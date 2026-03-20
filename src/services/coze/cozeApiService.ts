/**
 * Coze API 服务层
 * 保持与 coze-workflow-platform 完全一致的调用方式
 */

import { getGatewayConfig, cozeConfig } from '@/config/coze/gateway.config';
import { workflows } from '@/config/coze/workflows';
import type {
  CozeStreamEvent,
  CozeWorkflowParameters,
  CozeExecutionResult
} from '@/types/coze';

const SERVER_BASE_URL = cozeConfig.server.BASE_URL;

/**
 * 设置嵌套对象值
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[keys[keys.length - 1]] = value;
  return obj;
}

/**
 * 构建工作流参数
 * 保持与原项目完全一致的参数处理逻辑
 */
export function buildWorkflowParameters(
  workflowId: string,
  formData: Record<string, string | undefined>
): CozeWorkflowParameters {
  const workflow = workflows.find(w => w.id === workflowId);
  if (!workflow) return {};

  const parameters: Record<string, unknown> = {};

  workflow.inputs.forEach(input => {
    let value = formData[input.key];
    if (value !== undefined && value !== '') {
      // 数字类型输入需要转成 number，避免下游忽略
      let finalValue: unknown = value;
      if (input.type === 'number') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          finalValue = parsed;
        }
      }

      // 检查是否是文件类型的输入参数
      const isFileType = ['image', 'video', 'audio', 'file'].includes(input.type);

      if (isFileType && typeof finalValue === 'string') {
        // 检查是否是file_id（通常以字母数字组合开头，不包含协议）
        const isFileId = !finalValue.startsWith('http') && !finalValue.startsWith('/');

        if (isFileId) {
          // 如果是file_id，按照Coze API要求格式化为JSON字符串
          console.log(`📎 处理file_id参数: ${input.key} = ${finalValue}`);
          finalValue = JSON.stringify({ file_id: finalValue });
        } else if (finalValue.startsWith('/')) {
          // 如果是相对路径，补全服务器URL
          finalValue = SERVER_BASE_URL + finalValue;
          console.log(`🔗 处理URL参数: ${input.key} = ${finalValue}`);
        }
      }

      setNestedValue(parameters, input.key, finalValue);
    }
  });

  return parameters as CozeWorkflowParameters;
}

/**
 * 验证工作流参数
 */
export function validateWorkflowParameters(
  workflowId: string,
  formData: Record<string, string | undefined>
): { valid: boolean; errors: string[] } {
  const workflow = workflows.find(w => w.id === workflowId);
  if (!workflow) return { valid: false, errors: ['工作流不存在'] };

  const errors: string[] = [];

  workflow.inputs.forEach(input => {
    if (input.required) {
      const value = formData[input.key];
      if (!value || value.trim() === '') {
        errors.push(`${input.label}是必填项`);
      }
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * 通过网关调用工作流（流式）
 * 保持与原项目完全一致的调用方式
 */
export async function callGatewayStream(
  workflowId: string,
  parameters: CozeWorkflowParameters = {},
  apiKey?: string
): Promise<ReadableStream<Uint8Array>> {
  const gatewayConfig = getGatewayConfig();
  const effectiveApiKey = apiKey || gatewayConfig.GATEWAY_API_KEY;

  console.log(`🚀 通过网关执行工作流 ${workflowId}...`);
  console.log('📋 参数:', JSON.stringify(parameters, null, 2));

  const userInput = (parameters.input as string) || (parameters.BOT_USER_INPUT as string) || '';

  // 设置10分钟超时，与原项目保持一致
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 600000);

  let response: Response;
  try {
    response = await fetch(
      `${gatewayConfig.GATEWAY_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${effectiveApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: gatewayConfig.GATEWAY_MODEL,
          stream: true,
          messages: [
            { role: 'user', content: userInput }
          ],
          workflow_id: workflowId,
          workflow_parameters: parameters
        }),
        signal: controller.signal
      }
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const status = response.status;
    let errorMessage = '网关请求失败';

    // 尝试获取详细错误信息
    let errorBody = '';
    try {
      errorBody = await response.text();
      console.error('❌ 网关错误响应:', status, errorBody);
    } catch (e) {
      console.error('❌ 无法读取错误响应体');
    }

    if (status === 401) {
      errorMessage = '网关认证失败,请检查API密钥是否正确';
    } else if (status === 403) {
      errorMessage = '网关访问被拒绝,权限不足';
    } else if (status === 404) {
      errorMessage = '网关接口不存在,请检查URL是否正确';
    } else if (status === 429) {
      errorMessage = '请求过于频繁,已被限流';
    } else if (status >= 500) {
      // 尝试解析错误详情
      try {
        const errorJson = JSON.parse(errorBody);
        if (errorJson.error?.message) {
          errorMessage = `网关错误: ${errorJson.error.message}`;
        } else if (errorJson.message) {
          errorMessage = `网关错误: ${errorJson.message}`;
        } else {
          errorMessage = '网关服务器错误,请稍后重试';
        }
      } catch {
        errorMessage = '网关服务器错误,请稍后重试';
      }
    }

    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error('响应体为空');
  }

  return response.body;
}

/**
 * 解析网关流式响应
 * 生成器函数，与原项目保持一致
 */
export async function* parseGatewayStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<CozeStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();

          if (data === '[DONE]') {
            yield {
              event: 'Done',
              data: { status: 'completed' }
            };
            return;
          }

          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content;
            const finishReason = json.choices?.[0]?.finish_reason;

            if (content) {
              yield {
                event: 'Message',
                data: { content }
              };
            }

            if (finishReason === 'stop') {
              yield {
                event: 'Done',
                data: { status: 'completed' }
              };
            }
          } catch {
            console.warn('解析SSE数据失败:', data);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 运行工作流（流式）
 */
export async function runWorkflowStream(
  workflowId: string,
  parameters: CozeWorkflowParameters = {}
): Promise<AsyncGenerator<CozeStreamEvent>> {
  const gatewayConfig = getGatewayConfig();

  if (gatewayConfig.USE_GATEWAY) {
    console.log('🌐 使用网关模式调用Coze工作流');
    const stream = await callGatewayStream(workflowId, parameters);
    return parseGatewayStream(stream);
  }

  // 直连模式（保留但默认不使用）
  throw new Error('直连模式需要服务端实现');
}

/**
 * 异步执行工作流
 */
export async function runWorkflowAsync(
  workflowId: string,
  parameters: CozeWorkflowParameters = {},
  apiKey?: string
): Promise<{
  execute_id: string;
  workflow_id: string;
  status: string;
  data: unknown;
}> {
  const gatewayConfig = getGatewayConfig();
  const effectiveApiKey = apiKey || gatewayConfig.GATEWAY_API_KEY;

  if (!gatewayConfig.USE_GATEWAY) {
    throw new Error('异步执行需要网关模式');
  }

  console.log('🌐 网关模式异步执行');
  console.log(`🚀 通过网关异步执行工作流 ${workflowId}...`);

  const userInput = (parameters.input as string) || (parameters.BOT_USER_INPUT as string) || '';
  const asyncModel = 'coze-workflow-async';

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${effectiveApiKey}`,
    'Content-Type': 'application/json'
  };

  const response = await fetch(
    `${gatewayConfig.GATEWAY_BASE_URL}/chat/completions`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: asyncModel,
        stream: false,
        messages: [
          { role: 'user', content: userInput }
        ],
        workflow_id: workflowId,
        workflow_parameters: parameters
      })
    }
  );

  if (!response.ok) {
    const status = response.status;
    let errorBody = '';
    try {
      errorBody = await response.text();
      console.error('❌ 异步执行错误响应:', status, errorBody);
    } catch {
      console.error('❌ 无法读取错误响应体');
    }

    if (status === 401) {
      throw new Error('网关认证失败,请检查API密钥是否正确');
    } else if (status === 403) {
      throw new Error('网关访问被拒绝,权限不足');
    } else if (status === 404) {
      throw new Error('网关接口不存在,请检查URL是否正确');
    } else if (status === 429) {
      throw new Error('请求过于频繁,已被限流');
    } else if (status >= 500) {
      throw new Error('网关服务器错误,请稍后重试');
    }
    throw new Error('异步执行失败');
  }

  const data = await response.json();

  return {
    execute_id: data.execute_id || `gateway_${Date.now()}`,
    workflow_id: workflowId,
    status: data.status || 'Running',
    data
  };
}

/**
 * 查询工作流执行历史
 */
export async function getWorkflowHistory(
  workflowId: string,
  executeId: string,
  apiKey?: string
): Promise<unknown> {
  const gatewayConfig = getGatewayConfig();
  const effectiveApiKey = apiKey || gatewayConfig.GATEWAY_API_KEY;

  if (!gatewayConfig.USE_GATEWAY) {
    throw new Error('查询历史需要网关模式');
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${effectiveApiKey}`,
    'Content-Type': 'application/json'
  };

  const url = `${gatewayConfig.GATEWAY_BASE_URL}/workflows/executions/${executeId}`;

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const status = response.status;
    if (status === 401) {
      throw new Error('网关认证失败');
    } else if (status === 404) {
      throw new Error('执行记录不存在');
    }
    throw new Error('查询失败');
  }

  return response.json();
}

/**
 * 解析输出内容
 */
export function parseOutputContent(content: string): CozeExecutionResult {
  try {
    if (content.startsWith('{') && content.endsWith('}')) {
      const parsed = JSON.parse(content);

      if (parsed.output && typeof parsed.output === 'string') {
        return {
          type: 'text',
          content: parsed.output
        };
      }

      if (parsed.image_url || parsed.imageUrl || parsed.image) {
        return {
          type: 'image',
          content: parsed.image_url || parsed.imageUrl || parsed.image,
          metadata: {
            text: parsed.text || parsed.description || ''
          }
        };
      }

      return {
        type: 'json',
        content: JSON.stringify(parsed, null, 2)
      };
    }

    // 检测媒体URL
    const urlPatterns = {
      image: /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)/gi,
      video: /https?:\/\/[^\s]+\.(mp4|mov|avi|webm)/gi,
      audio: /https?:\/\/[^\s]+\.(mp3|wav|m4a|ogg)/gi
    };

    const imageUrls = content.match(urlPatterns.image) || [];
    const videoUrls = content.match(urlPatterns.video) || [];
    const audioUrls = content.match(urlPatterns.audio) || [];

    if (imageUrls.length > 0 || videoUrls.length > 0 || audioUrls.length > 0) {
      return {
        type: 'mixed',
        content,
        metadata: {
          imageUrls,
          videoUrls,
          audioUrls
        }
      };
    }

    return {
      type: 'text',
      content
    };
  } catch {
    return {
      type: 'text',
      content
    };
  }
}

/**
 * 测试API连接
 */
export async function testApiConnection(): Promise<boolean> {
  const gatewayConfig = getGatewayConfig();

  try {
    if (gatewayConfig.USE_GATEWAY) {
      console.log('🧪 测试网关连接...');
      const baseUrl = gatewayConfig.GATEWAY_BASE_URL.replace('/v1', '');
      const response = await fetch(`${baseUrl}/`, {
        headers: {
          'Authorization': `Bearer ${gatewayConfig.GATEWAY_API_KEY}`
        }
      });
      console.log('✅ 网关连接测试成功');
      return response.ok;
    }

    return false;
  } catch (error) {
    console.error('❌ API连接测试失败:', error);
    return false;
  }
}
