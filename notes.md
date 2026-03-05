# Notes: 充值系统迁移研究

## 源项目关键代码分析

### 1. 充值配置 (types.ts)
```typescript
// 充值选项配置
export const RECHARGE_OPTIONS = [
  { amount: 10, credits: 100, bonus: 0 },
  { amount: 30, credits: 300, bonus: 30 },
  { amount: 50, credits: 500, bonus: 50 },
  { amount: 100, credits: 1000, bonus: 150 },
  { amount: 200, credits: 2000, bonus: 400 },
  { amount: 500, credits: 5000, bonus: 1500 },
]

// 支付流程状态
export type PaymentStep = 'select' | 'paying' | 'waiting'
```

### 2. 支付方式
- **支付宝PC**: `alipay.trade.page.pay` - 新窗口打开
- **支付宝WAP**: `alipay.trade.wap.pay` - 当前窗口跳转
- **微信Native**: 生成二维码，用户扫码支付

### 3. 回调处理
- 支付宝：签名验证 + 订单状态更新
- 微信：AES-256-GCM解密 + 订单状态更新

## 目标项目适配要点

### 1. 积分体系对接
- 源项目：零素 (credits)
- 目标项目：积分 (credits) - 名称一致，可直接复用

### 2. 数据库字段映射
| 源项目字段 | 目标项目字段 | 说明 |
|-----------|-------------|------|
| user_id | user_id | 用户ID |
| order_no | order_no | 订单号 |
| amount | amount | 支付金额 |
| credits | points | 积分数量 |
| payment_method | payment_method | 支付方式 |
| status | status | 订单状态 |

### 3. UI适配
- 源项目：独立弹窗 (RechargeModal)
- 目标项目：内嵌卡片 (替换"最近30天"区域)

## 迁移文件清单

### 需要创建的新文件

#### 类型定义
1. `src/types/payment.ts` - 支付相关类型

#### API接口 (6个)
1. `src/app/api/payment/alipay/route.ts` - 支付宝PC支付
2. `src/app/api/payment/alipay/wap/route.ts` - 支付宝WAP支付
3. `src/app/api/payment/alipay/notify/route.ts` - 支付宝回调
4. `src/app/api/payment/wechat/route.ts` - 微信支付
5. `src/app/api/payment/wechat/notify/route.ts` - 微信回调
6. `src/app/api/payment/order-status/[orderNo]/route.ts` - 订单查询

#### 前端组件 (4个)
1. `src/components/recharge/RechargeCard.tsx` - 充值卡片主组件
2. `src/components/recharge/AmountSelector.tsx` - 金额选择器
3. `src/components/recharge/PaymentMethodSelector.tsx` - 支付方式选择
4. `src/components/recharge/QRCodeDisplay.tsx` - 二维码展示

#### 服务和Hook
1. `src/services/paymentService.ts` - 支付服务
2. `src/hooks/useRecharge.ts` - 充值Hook

#### 页面
1. `src/app/pay-result/page.tsx` - 支付结果页

### 需要修改的文件
1. `src/components/studio/UserInfoModal.tsx` - 替换"最近30天"为充值卡片
2. `src/services/creditsService.ts` - 完善 rechargeCredits() 函数
3. `.env.local` - 添加支付配置环境变量

## 环境变量配置

```env
# 支付宝配置
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
ALIPAY_PUBLIC_KEY=
ALIPAY_NOTIFY_URL=
ALIPAY_RETURN_URL=

# 微信支付配置
WECHAT_APP_ID=
WECHAT_MCH_ID=
WECHAT_API_KEY=
WECHAT_PRIVATE_KEY=
WECHAT_SERIAL_NO=
WECHAT_NOTIFY_URL=
```

## 实施顺序

### 第一批：基础设施
1. 类型定义 `src/types/payment.ts`
2. 支付服务 `src/services/paymentService.ts`
3. 环境变量配置

### 第二批：API接口
1. 支付宝PC支付接口
2. 支付宝WAP支付接口
3. 微信支付接口
4. 订单状态查询接口
5. 支付宝回调接口
6. 微信回调接口

### 第三批：前端组件
1. AmountSelector 金额选择器
2. PaymentMethodSelector 支付方式选择
3. QRCodeDisplay 二维码展示
4. RechargeCard 充值卡片主组件

### 第四批：集成
1. 修改 UserInfoModal 集成充值卡片
2. 完善 creditsService.rechargeCredits()
3. 创建支付结果页
4. 测试完整流程
