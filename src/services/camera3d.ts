/**
 * 3D 相机运镜服务
 *
 * 将相机参数转换为自然语言提示词，用于图像模型理解视角变化
 *
 * 坐标系说明：
 * - azimuth (方位角): 相机绕Y轴旋转，0°=正前方，顺时针增加
 *   - 0° = 相机在正前方，看到主体正面
 *   - 90° = 相机在右侧，看到主体左侧面
 *   - 180° = 相机在后方，看到主体背面
 *   - 270° = 相机在左侧，看到主体右侧面
 * - elevation (俯仰角): -30°=仰视，0°=平视，60°=俯视
 * - distance (距离): 0.6=近景，1.0=中景，1.5=远景
 */

import type { CameraParams } from '@/types';

// ==================== 提示词策略 ====================

export type PromptStyle = 'command' | 'qwen';

/**
 * 生成用于显示的简短视角描述
 */
export function generateCameraPrompt(params: CameraParams): string {
  const az = ((params.azimuth % 360) + 360) % 360;
  const el = params.elevation;
  const dist = params.distance;

  // 水平方位
  let horizontal: string;
  if (az <= 15 || az > 345) horizontal = 'front';
  else if (az <= 60) horizontal = 'front-left';
  else if (az <= 120) horizontal = 'left';
  else if (az <= 165) horizontal = 'back-left';
  else if (az <= 195) horizontal = 'back';
  else if (az <= 240) horizontal = 'back-right';
  else if (az <= 300) horizontal = 'right';
  else horizontal = 'front-right';

  // 垂直角度
  let vertical: string;
  if (el > 40) vertical = 'top-down';
  else if (el > 20) vertical = 'high angle';
  else if (el > 5) vertical = 'slightly above';
  else if (el >= -5) vertical = 'eye level';
  else if (el >= -20) vertical = 'low angle';
  else vertical = 'worm eye';

  // 景别
  let framing: string;
  if (dist < 0.75) framing = 'ECU';
  else if (dist < 0.9) framing = 'CU';
  else if (dist <= 1.1) framing = 'MS';
  else if (dist <= 1.3) framing = 'MWS';
  else framing = 'WS';

  return `${horizontal} · ${vertical} · ${framing}`;
}

/**
 * 生成指令式提示词（用于通用图像模型）
 *
 * 使用标准摄影视角术语，基于业界最佳实践
 * 参考：front view, side view, 3/4 view, back view, viewed from, seen from
 *
 * 坐标系：
 * - azimuth 0° = 正前方 front view
 * - azimuth 45° = 3/4 view from left
 * - azimuth 90° = left side view
 * - azimuth 180° = back view
 * - azimuth 270° = right side view
 * - azimuth 315° = 3/4 view from right
 */
export function generateFullPrompt(params: CameraParams, customPrompt?: string): string {
  const az = ((params.azimuth % 360) + 360) % 360;
  const el = params.elevation;
  const dist = params.distance;

  const parts: string[] = [];

  // 1. 水平视角描述 - 使用标准摄影术语
  // 注意：azimuth 增加 = 相机顺时针移动 = 看到的是右侧内容
  let viewAngle = '';
  if (az <= 22 || az > 337) {
    viewAngle = 'front view';
  } else if (az <= 67) {
    viewAngle = '3/4 view from the right';
  } else if (az <= 112) {
    viewAngle = 'right side view';
  } else if (az <= 157) {
    viewAngle = 'back 3/4 view from the right';
  } else if (az <= 202) {
    viewAngle = 'back view';
  } else if (az <= 247) {
    viewAngle = 'back 3/4 view from the left';
  } else if (az <= 292) {
    viewAngle = 'left side view';
  } else {
    viewAngle = '3/4 view from the left';
  }

  // 2. 垂直角度描述
  let verticalAngle = '';
  if (el > 50) {
    verticalAngle = 'bird\'s eye view';
  } else if (el > 30) {
    verticalAngle = 'high angle';
  } else if (el > 10) {
    verticalAngle = 'slightly elevated angle';
  } else if (el >= -10) {
    verticalAngle = 'eye level';
  } else if (el >= -20) {
    verticalAngle = 'low angle';
  } else {
    verticalAngle = 'worm\'s eye view';
  }

  // 3. 景别描述
  let shotType = '';
  if (dist < 0.7) {
    shotType = 'extreme close-up';
  } else if (dist < 0.85) {
    shotType = 'close-up shot';
  } else if (dist <= 1.15) {
    shotType = 'medium shot';
  } else if (dist <= 1.35) {
    shotType = 'medium wide shot';
  } else {
    shotType = 'wide shot';
  }

  // 组合视角描述
  // 格式: "viewed from [angle], [vertical], [shot type]"
  if (viewAngle !== 'front view' || verticalAngle !== 'eye level') {
    if (verticalAngle === 'eye level') {
      parts.push(`${viewAngle}`);
    } else if (viewAngle === 'front view') {
      parts.push(`${verticalAngle}`);
    } else {
      parts.push(`${viewAngle}, ${verticalAngle}`);
    }
  }

  // 添加景别（如果不是默认的中景）
  if (shotType !== 'medium shot') {
    parts.push(shotType);
  }

  // 构建最终提示词
  let prompt = '';
  if (parts.length === 0) {
    prompt = 'Same angle and framing';
  } else {
    prompt = parts.join(', ');
  }

  // 添加保持一致性的说明
  const finalPrompt = `${prompt}. Maintain all visual details, style, and lighting.`;

  if (customPrompt && customPrompt.trim()) {
    return `${finalPrompt} ${customPrompt.trim()}`;
  }

  return finalPrompt;
}

/**
 * 生成 Qwen-Edit 专用提示词
 * 使用 Qwen-Edit LoRA 理解的简洁指令格式
 */
export function generateQwenPrompt(params: CameraParams, customPrompt?: string): string {
  const az = ((params.azimuth % 360) + 360) % 360;
  const el = params.elevation;
  const dist = params.distance;

  const commands: string[] = [];

  // Qwen-Edit 风格的简洁指令

  // 1. 水平旋转
  if (az > 20 && az <= 340) {
    if (az <= 180) {
      if (az <= 60) {
        commands.push(`将镜头向右旋转${Math.round(az)}度`);
      } else if (az <= 120) {
        commands.push('将镜头移到左侧');
      } else {
        commands.push('将镜头移到后方');
      }
    } else {
      const leftAngle = 360 - az;
      if (leftAngle <= 60) {
        commands.push(`将镜头向左旋转${Math.round(leftAngle)}度`);
      } else if (leftAngle <= 120) {
        commands.push('将镜头移到右侧');
      } else {
        commands.push('将镜头移到后方');
      }
    }
  }

  // 2. 垂直俯仰
  if (el > 40) {
    commands.push('将镜头转为俯视');
  } else if (el > 15) {
    commands.push('将镜头向下倾斜');
  } else if (el < -15) {
    commands.push('将镜头向上倾斜');
  }

  // 3. 距离
  if (dist < 0.8) {
    commands.push('将镜头转为特写镜头');
  } else if (dist > 1.25) {
    commands.push('将镜头转为广角镜头');
  }

  // 默认保持
  if (commands.length === 0) {
    return customPrompt?.trim() || '保持当前视角';
  }

  const instruction = commands.join('，');

  if (customPrompt && customPrompt.trim()) {
    return `${instruction}。${customPrompt.trim()}`;
  }

  return instruction;
}

// ==================== fal.ai 参数映射 ====================

export interface FalCameraParams {
  horizontal_angle: number; // 0-360
  vertical_angle: number;   // -30~90
  zoom: number;             // 0-10
}

/**
 * 将 Studio CameraParams 映射为 fal.ai 数值参数
 *
 * azimuth (0-360) → horizontal_angle (0-360): 直接传递
 * elevation (-30~60) → vertical_angle (-30~90): 直接传递（范围兼容）
 * distance (0.6-1.5) → zoom (0-10): 线性映射
 */
export function mapToFalParams(params: CameraParams): FalCameraParams {
  const az = ((params.azimuth % 360) + 360) % 360;
  const el = params.elevation;
  const dist = params.distance;

  // distance 0.6 (近景) → zoom 10 (放大), distance 1.5 (远景) → zoom 0 (缩小)
  // 反向映射：近距离=高zoom
  const zoom = Math.round(((1.5 - dist) / 0.9) * 10 * 10) / 10;

  return {
    horizontal_angle: Math.round(az),
    vertical_angle: Math.round(el),
    zoom: Math.max(0, Math.min(10, zoom)),
  };
}

// ==================== 默认参数 ====================

export const DEFAULT_CAMERA_PARAMS: CameraParams = {
  azimuth: 0,      // 正前方
  elevation: 0,    // 眼平线
  distance: 1.0,   // 标准焦距
};

// ==================== 参数约束 ====================

export const CAMERA_PARAMS_LIMITS = {
  azimuth: { min: 0, max: 360 },
  elevation: { min: -30, max: 60 },
  distance: { min: 0.6, max: 1.5 },
};

/**
 * 约束相机参数到有效范围
 */
export function clampCameraParams(params: Partial<CameraParams>): Partial<CameraParams> {
  const result: Partial<CameraParams> = {};

  if (params.azimuth !== undefined) {
    let az = params.azimuth % 360;
    if (az < 0) az += 360;
    result.azimuth = az;
  }

  if (params.elevation !== undefined) {
    result.elevation = Math.max(
      CAMERA_PARAMS_LIMITS.elevation.min,
      Math.min(CAMERA_PARAMS_LIMITS.elevation.max, params.elevation)
    );
  }

  if (params.distance !== undefined) {
    result.distance = Math.max(
      CAMERA_PARAMS_LIMITS.distance.min,
      Math.min(CAMERA_PARAMS_LIMITS.distance.max, params.distance)
    );
  }

  return result;
}
