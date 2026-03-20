# Task Plan: 充值系统迁移

## Goal
将 weblschat 项目的完整用户充值系统迁移到 studio 项目的账户管理页面，替换"最近30天"统计区域。

## Phases
- [x] Phase 1: 分析源项目充值系统架构
- [x] Phase 2: 分析目标项目账户管理结构
- [x] Phase 3: 设计迁移方案和文件清单
- [x] Phase 4: 实施迁移 - 类型定义和配置
- [x] Phase 5: 实施迁移 - API接口
- [x] Phase 6: 实施迁移 - 前端组件
- [x] Phase 7: 集成测试和调试

## Key Questions
1. ✅ 源项目支付系统支持哪些支付方式？→ 支付宝PC/WAP + 微信扫码
2. ✅ 目标项目数据库是否支持支付功能？→ 已有 payments、balance_logs 表
3. ✅ 充值界面放在哪个位置？→ UserInfoModal.tsx 第443-473行"最近30天"区域
4. 积分汇率如何设定？→ 待确认（源项目为1元=10零素）

## 源项目分析结果

### 核心文件清单
| 类型 | 源路径 | 功能 |
|------|--------|------|
| 类型定义 | `src/types/payment.ts` | 支付方法、状态、订单类型 |
| 类型定义 | `src/components/modals/recharge/types.ts` | 充值选项、汇率配置 |
| 主组件 | `src/components/modals/RechargeModal.tsx` | 充值弹窗主组件 |
| 子组件 | `src/components/modals/recharge/AmountSelector.tsx` | 金额选择器 |
| 子组件 | `src/components/modals/recharge/PaymentMethodSelector.tsx` | 支付方式选择 |
| 子组件 | `src/components/modals/recharge/QRCodeDisplay.tsx` | 微信二维码展示 |
| API | `src/app/api/payment/alipay/route.ts` | 支付宝PC支付 |
| API | `src/app/api/payment/alipay/wap/route.ts` | 支付宝WAP支付 |
| API | `src/app/api/payment/wechat/route.ts` | 微信Native支付 |
| API | `src/app/api/payment/alipay/notify/route.ts` | 支付宝回调 |
| API | `src/app/api/payment/wechat/notify/route.ts` | 微信回调 |
| API | `src/app/api/payment/order-status/[orderNo]/route.ts` | 订单状态查询 |
| 服务 | `src/lib/services/payment.service.ts` | 支付业务逻辑 |
| Hook | `src/hooks/useRecharge.ts` | 充值状态管理 |
| 页面 | `src/app/pay-result/page.tsx` | 支付结果页 |

### 支付特性
- 6个预设充值档位：10/30/50/100/200/500元
- 汇率：1元 = 10零素（含赠送机制）
- 支付宝：PC新窗口 + 移动端WAP跳转
- 微信：Native扫码支付
- 状态轮询：自动检测支付完成

## 目标项目现状

### 已有基础设施
- ✅ `payments` 表：支持微信/支付宝
- ✅ `balance_logs` 表：余额变动记录
- ✅ `CreditsService`：已预留 `rechargeCredits()` 函数
- ✅ `CreditsEvents`：积分更新事件系统
- ✅ UserInfoModal：双Tab设计，左侧有"最近30天"区域

### 替换位置
- 文件：`src/components/studio/UserInfoModal.tsx`
- 行号：443-473
- 当前内容：最近30天统计（总请求数、总消费）

## Decisions Made
- 使用内嵌充值卡片替代弹窗：更符合账户管理页面的交互逻辑
- 保留源项目的支付流程：成熟稳定，无需重新设计
- 复用现有数据库结构：payments 和 balance_logs 表已满足需求

## Errors Encountered
- (暂无)

## Status
**已完成** - 充值系统迁移完毕

---

# 迁移完成总结

## 已创建的文件 (16个)

### 类型定义
- `src/types/payment.ts` - 支付核心类型定义

### API接口 (6个)
- `src/app/api/payment/alipay/route.ts` - 支付宝PC支付
- `src/app/api/payment/alipay/wap/route.ts` - 支付宝WAP支付
- `src/app/api/payment/alipay/notify/route.ts` - 支付宝回调
- `src/app/api/payment/wechat/route.ts` - 微信Native支付
- `src/app/api/payment/wechat/notify/route.ts` - 微信回调
- `src/app/api/payment/order-status/[orderNo]/route.ts` - 订单查询

### 前端组件 (6个)
- `src/components/recharge/types.ts` - 充值配置
- `src/components/recharge/AmountSelector.tsx` - 金额选择器
- `src/components/recharge/PaymentMethodSelector.tsx` - 支付方式选择
- `src/components/recharge/QRCodeDisplay.tsx` - 二维码展示
- `src/components/recharge/RechargeCard.tsx` - 充值卡片主组件
- `src/components/recharge/index.ts` - 导出文件

### 服务和Hook
- `src/services/paymentService.ts` - 支付服务
- `src/hooks/useRecharge.ts` - 充值Hook

### 页面
- `src/app/pay-result/page.tsx` - 支付结果页

## 已修改的文件
- `src/components/studio/UserInfoModal.tsx` - 集成充值卡片

## 已安装的依赖
- `qrcode.react` - 二维码生成

## 待配置的环境变量
```env
# 支付宝配置
ALIPAY_APPID=
ALIPAY_PRIVATE_KEY=
ALIPAY_PUBLIC_KEY=

# 微信支付配置
WECHAT_APPID=
WECHAT_MCH_ID=
WECHAT_API_KEY=
WECHAT_SERIAL_NO=
WECHAT_PRIVATE_KEY=

# 基础URL
NEXT_PUBLIC_BASE_URL=
```

---

# 详细实施方案

## 文件创建清单 (共15个新文件)

### 1. 类型定义 (1个)
| 文件 | 说明 |
|------|------|
| `src/types/payment.ts` | 支付方法、订单状态、充值配置类型 |

### 2. API接口 (6个)
| 文件 | 说明 |
|------|------|
| `src/app/api/payment/alipay/route.ts` | 支付宝PC网页支付 |
| `src/app/api/payment/alipay/wap/route.ts` | 支付宝移动端WAP支付 |
| `src/app/api/payment/alipay/notify/route.ts` | 支付宝异步通知回调 |
| `src/app/api/payment/wechat/route.ts` | 微信Native扫码支付 |
| `src/app/api/payment/wechat/notify/route.ts` | 微信支付回调通知 |
| `src/app/api/payment/order-status/[orderNo]/route.ts` | 订单状态查询 |

### 3. 前端组件 (5个)
| 文件 | 说明 |
|------|------|
| `src/components/recharge/types.ts` | 充值组件类型和配置 |
| `src/components/recharge/AmountSelector.tsx` | 金额选择器（6档位） |
| `src/components/recharge/PaymentMethodSelector.tsx` | 支付方式选择 |
| `src/components/recharge/QRCodeDisplay.tsx` | 微信二维码展示 |
| `src/components/recharge/RechargeCard.tsx` | 充值卡片主组件 |

### 4. 服务和Hook (2个)
| 文件 | 说明 |
|------|------|
| `src/services/paymentService.ts` | 支付订单CRUD和业务逻辑 |
| `src/hooks/useRecharge.ts` | 充值状态管理Hook |

### 5. 页面 (1个)
| 文件 | 说明 |
|------|------|
| `src/app/pay-result/page.tsx` | 支付结果展示页 |

## 文件修改清单 (3个)

| 文件 | 修改内容 |
|------|----------|
| `src/components/studio/UserInfoModal.tsx` | 替换"最近30天"区域为RechargeCard |
| `src/services/creditsService.ts` | 完善rechargeCredits()函数 |
| `.env.local` | 添加支付宝/微信支付环境变量 |

## UI设计方案

### 充值卡片布局 (替换"最近30天"位置)
```
┌─────────────────────────────────────┐
│  💰 账户充值                         │
├─────────────────────────────────────┤
│  当前余额: 1,234 积分                │
├─────────────────────────────────────┤
│  选择充值金额:                       │
│  ┌────┐ ┌────┐ ┌────┐              │
│  │ 10 │ │ 30 │ │ 50 │              │
│  └────┘ └────┘ └────┘              │
│  ┌────┐ ┌────┐ ┌────┐              │
│  │100 │ │200 │ │500 │              │
│  └────┘ └────┘ └────┘              │
├─────────────────────────────────────┤
│  支付方式:                          │
│  ○ 支付宝  ○ 微信支付               │
├─────────────────────────────────────┤
│  [      立即充值      ]             │
└─────────────────────────────────────┘
```

## 实施步骤

### Step 1: 基础设施搭建
1. 创建 `src/types/payment.ts` 类型定义
2. 创建 `src/components/recharge/types.ts` 充值配置
3. 创建 `src/services/paymentService.ts` 支付服务

### Step 2: API接口开发
1. 迁移支付宝PC支付接口
2. 迁移支付宝WAP支付接口
3. 迁移微信Native支付接口
4. 迁移订单状态查询接口
5. 迁移支付宝回调接口
6. 迁移微信回调接口

### Step 3: 前端组件开发
1. 创建 AmountSelector 金额选择组件
2. 创建 PaymentMethodSelector 支付方式组件
3. 创建 QRCodeDisplay 二维码组件
4. 创建 RechargeCard 充值卡片主组件
5. 创建 useRecharge Hook

### Step 4: 集成和测试
1. 修改 UserInfoModal 集成充值卡片
2. 完善 creditsService.rechargeCredits()
3. 创建支付结果页
4. 端到端测试

## 依赖包
需要安装的npm包：
- `qrcode.react` - 二维码生成
- `alipay-sdk` - 支付宝SDK (如果源项目有使用)
