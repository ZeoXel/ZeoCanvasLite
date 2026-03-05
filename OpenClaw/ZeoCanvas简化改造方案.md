# ZeoCanvas 简化改造方案

> 目标：抛弃冗余系统，最大化简洁性和流畅性
> 分析时间：2026-03-05

---

## 一、当前架构分析

### 现有结构

```
ZeoCanvas (Next.js 应用)
├── src/app/
│   ├── page.tsx (主页 → StudioTab)
│   └── api/
│       ├── studio/ (核心 API)
│       │   ├── image/
│       │   ├── video/
│       │   ├── chat/
│       │   └── proxy/
│       ├── audio/
│       │   ├── minimax/
│       │   └── suno/
│       └── video/
│           └── vidu-multiframe/
├── src/components/
│   ├── studio/ (画布核心组件)
│   └── ui/ (基础 UI)
└── src/services/
    ├── geminiService.ts (35KB - 大文件)
    ├── externalModels.ts (16KB)
    ├── minimaxService.ts
    ├── viduService.ts
    ├── sunoService.ts
    └── storage.ts
```

### 识别的冗余部分

基于文件大小和命名，可能包含：
- ❌ 用户系统（登录/注册）
- ❌ 充值/支付系统
- ❌ 权限管理
- ❌ 多租户逻辑
- ❌ 复杂的网关层

---

## 二、简化目标

### 核心保留功能

✅ **画布核心**
- CanvasBoard（画布主体）
- Node（节点系统）
- 拖拽/连线逻辑

✅ **AI 生成 API**
- 图像生成接口
- 视频生成接口
- 音频生成接口

✅ **基础 UI**
- 侧边栏
- 设置面板
- 加载状态

### 移除功能

❌ **用户系统**
- 无需登录/注册
- 无需用户数据库
- 本地化部署，单用户模式

❌ **支付系统**
- 无需充值
- 无需余额管理
- 直接使用 API Key

❌ **复杂网关**
- 简化 API 路由
- 直接调用 AI 服务

---

## 三、简化后的架构

### 目标结构

```
ZeoCanvas-Lite
├── src/
│   ├── app/
│   │   ├── page.tsx (画布主页)
│   │   └── api/
│   │       ├── generate/image/route.ts
│   │       ├── generate/video/route.ts
│   │       └── generate/audio/route.ts
│   ├── components/
│   │   ├── canvas/
│   │   │   ├── Board.tsx
│   │   │   ├── Node.tsx
│   │   │   └── Controls.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       └── Input.tsx
│   ├── lib/
│   │   ├── ai-client.ts (统一 AI 调用)
│   │   └── storage.ts (本地存储)
│   └── types/
│       └── index.ts
└── config/
    └── ai-providers.ts (AI 服务配置)
```


---

## 四、具体简化措施

### 4.1 移除用户系统

**删除文件：**
- 所有 auth 相关代码
- 用户数据库模型
- 登录/注册页面
- Session 管理

**替代方案：**
- 本地配置文件存储 API Key
- 无需身份验证

---

### 4.2 简化 API 层

**当前问题：**
- API 路由过于分散
- 可能包含权限检查、计费逻辑

**简化方案：**

```typescript
// src/app/api/generate/image/route.ts
export async function POST(req: Request) {
  const { prompt, model } = await req.json();
  
  // 直接调用 AI 服务，无需鉴权
  const result = await generateImage(prompt, model);
  
  return Response.json(result);
}
```

**删除：**
- 用户鉴权中间件
- 余额检查
- 使用量统计
- 复杂的错误处理（保留基础即可）

---

### 4.3 精简 Services

**geminiService.ts (35KB) 可能包含：**
- ❌ 多种模型切换逻辑
- ❌ 复杂的重试机制
- ❌ 使用量追踪
- ✅ 保留：基础 API 调用

**简化为：**

```typescript
// src/lib/ai-client.ts
export async function generateImage(prompt: string, provider: string) {
  const config = AI_PROVIDERS[provider];
  
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.apiKey}` },
    body: JSON.stringify({ prompt })
  });
  
  return response.json();
}
```


### 4.4 配置管理简化

**删除：**
- 数据库配置
- 用户配置表
- 复杂的环境变量

**简化为本地配置文件：**

```typescript
// config/ai-providers.ts
export const AI_PROVIDERS = {
  runway: {
    endpoint: 'https://api.runwayml.com/v1/generate',
    apiKey: process.env.RUNWAY_API_KEY || ''
  },
  midjourney: {
    endpoint: 'https://api.midjourney.com/v1/imagine',
    apiKey: process.env.MIDJOURNEY_API_KEY || ''
  },
  suno: {
    endpoint: 'https://api.suno.ai/v1/generate',
    apiKey: process.env.SUNO_API_KEY || ''
  }
};
```

**环境变量（.env.local）：**
```bash
# AI Provider Keys
RUNWAY_API_KEY=your_key
MIDJOURNEY_API_KEY=your_key
SUNO_API_KEY=your_key

# 无需数据库
# 无需 Redis
# 无需 Session Secret
```

---

### 4.5 存储简化

**删除：**
- 数据库（PostgreSQL/MySQL）
- 用户数据表
- 订单/支付记录

**简化为：**

```typescript
// src/lib/storage.ts
export const storage = {
  // 本地浏览器存储
  saveProject: (project: Project) => {
    localStorage.setItem(`project_${project.id}`, JSON.stringify(project));
  },
  
  loadProject: (id: string) => {
    const data = localStorage.getItem(`project_${id}`);
    return data ? JSON.parse(data) : null;
  },
  
  // 文件系统存储（服务端）
  saveAsset: async (file: Buffer, filename: string) => {
    const path = `./assets/${filename}`;
    await fs.writeFile(path, file);
    return path;
  }
};
```


---

## 五、改造步骤

### 阶段 1：分析现有代码（1天）

**任务：**
- [ ] 阅读 geminiService.ts，识别核心逻辑
- [ ] 检查是否有用户/支付相关代码
- [ ] 列出所有需要删除的文件
- [ ] 识别画布核心组件

**输出：**
- 删除文件清单
- 保留文件清单

---

### 阶段 2：创建精简版本（2-3天）

**方案 A：渐进式简化（推荐）**
```bash
# 1. 创建新分支
git checkout -b lite

# 2. 逐步删除冗余代码
# 3. 测试核心功能
# 4. 提交简化版本
```

**方案 B：全新搭建**
```bash
# 1. 创建新项目
npx create-next-app@latest zeocanvas-lite

# 2. 只复制核心组件
cp -r ZeoCanvas/src/components/studio zeocanvas-lite/src/components/canvas

# 3. 重写 API 层
# 4. 重写 Services
```

**推荐：方案 A**（保留现有逻辑，减少风险）


### 阶段 3：核心功能改造（3-5天）

**任务清单：**

**Day 1：API 层简化**
- [ ] 合并 API 路由到 3 个文件
- [ ] 删除鉴权中间件
- [ ] 删除计费逻辑
- [ ] 测试 API 调用

**Day 2：Services 精简**
- [ ] 提取 geminiService 核心逻辑
- [ ] 创建统一的 ai-client.ts
- [ ] 删除冗余代码
- [ ] 测试 AI 调用

**Day 3：存储简化**
- [ ] 移除数据库依赖
- [ ] 实现本地存储
- [ ] 实现文件系统存储
- [ ] 测试保存/加载

**Day 4：UI 清理**
- [ ] 删除登录/注册页面
- [ ] 删除充值相关 UI
- [ ] 简化设置面板
- [ ] 测试画布功能

**Day 5：集成测试**
- [ ] 端到端测试
- [ ] 性能测试
- [ ] 修复问题

---

## 六、预期效果

### 代码量对比

| 指标 | 当前 | 简化后 | 减少 |
|------|------|--------|------|
| 总文件数 | ~50+ | ~20 | 60% |
| 代码行数 | ~10000+ | ~3000 | 70% |
| 依赖包数 | ~30+ | ~15 | 50% |
| API 路由 | 10+ | 3 | 70% |

### 性能提升

- ✅ 启动速度：减少 50%
- ✅ 构建时间：减少 60%
- ✅ 包体积：减少 40%
- ✅ 内存占用：减少 30%

### 维护性提升

- ✅ 代码更清晰
- ✅ 依赖更少
- ✅ 调试更简单
- ✅ 部署更容易


---

## 七、与 OpenClaw 集成

### 7.1 添加 API 端点

简化后的 ZeoCanvas 需要提供以下 API 供 OpenClaw 调用：

```typescript
// src/app/api/task/route.ts
export async function POST(req: Request) {
  const { type, prompt, params } = await req.json();
  
  // 创建任务
  const taskId = generateId();
  tasks.set(taskId, { status: 'pending', type, prompt, params });
  
  // 异步执行
  executeTask(taskId, type, prompt, params);
  
  return Response.json({ taskId });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');
  
  // 查询任务状态
  const task = tasks.get(taskId);
  return Response.json(task);
}
```

### 7.2 WebSocket 实时推送

```typescript
// src/app/api/ws/route.ts
export async function GET(req: Request) {
  const { socket, response } = Deno.upgradeWebSocket(req);
  
  socket.onopen = () => {
    // 连接建立
  };
  
  socket.onmessage = (event) => {
    // 接收消息
  };
  
  // 任务进度推送
  taskEmitter.on('progress', (data) => {
    socket.send(JSON.stringify(data));
  });
  
  return response;
}
```


### 7.3 OpenClaw 客户端示例

```typescript
// OpenClaw 端调用 ZeoCanvas
export class ZeoCanvasClient {
  private baseUrl = 'http://localhost:3000';
  
  async submitTask(type: string, prompt: string) {
    const res = await fetch(`${this.baseUrl}/api/task`, {
      method: 'POST',
      body: JSON.stringify({ type, prompt })
    });
    return res.json();
  }
  
  async getTaskStatus(taskId: string) {
    const res = await fetch(`${this.baseUrl}/api/task?taskId=${taskId}`);
    return res.json();
  }
  
  connectWebSocket() {
    const ws = new WebSocket(`ws://localhost:3000/api/ws`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('Progress:', data);
    };
    return ws;
  }
}
```

---

## 八、部署方案

### 本地部署（推荐）

```bash
# 1. 安装依赖
cd zeocanvas-lite
npm install

# 2. 配置 API Keys
cp .env.example .env.local
# 编辑 .env.local 填入 API Keys

# 3. 启动
npm run dev
# 访问 http://localhost:3000
```

### Docker 部署（可选）

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 九、总结

### 简化原则

1. **删除用户系统** - 本地化部署，无需多用户
2. **删除支付系统** - 直接使用 API Key
3. **简化 API 层** - 3 个核心接口即可
4. **精简 Services** - 统一 AI 调用逻辑
5. **本地存储** - 无需数据库

### 核心保留

- ✅ 画布核心功能
- ✅ AI 生成能力
- ✅ 实时状态推送
- ✅ 基础 UI 组件

### 工作量估算

- **代码分析：** 1 天
- **核心改造：** 3-5 天
- **测试优化：** 1-2 天
- **总计：** 5-8 天

### 下一步行动

1. 🔴 立即分析 geminiService.ts 和 externalModels.ts
2. 列出删除文件清单
3. 创建 lite 分支开始改造
4. 逐步测试核心功能

---

*改造完成后，ZeoCanvas 将成为轻量级的 AI 生成画布，完美适配 OpenClaw 集成*

