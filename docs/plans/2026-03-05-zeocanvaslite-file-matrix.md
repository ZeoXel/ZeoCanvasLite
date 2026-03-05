# ZeoCanvasLite 文件迁移矩阵（基于 studio）

> 用途：执行前清单，指导“保留 / 改造 / 删除”

## 路径基线

- 父目录：`/Users/g/Desktop/探索`
- 源目录：`/Users/g/Desktop/探索/studio`
- 目标目录：`/Users/g/Desktop/探索/ZeoCanvasLite`

## 一、优先保留（画布与生成主链路）

- `src/app/layout.tsx`（改标题与品牌）
- `src/app/globals.css`
- `src/app/canvas/page.tsx`（后续可上移到 `src/app/page.tsx`）
- `src/components/studio/Node.tsx`
- `src/components/studio/SidebarDock.tsx`
- `src/components/studio/SettingsModal.tsx`
- `src/components/studio/AssistantPanel.tsx`
- `src/components/studio/AudioNodePanel.tsx`
- `src/components/studio/CanvasPreview.tsx`
- `src/components/studio/ImageCropper.tsx`
- `src/components/studio/ImageEditOverlay.tsx`
- `src/components/studio/shared/**`
- `src/hooks/canvas/**`
- `src/types/index.ts`
- `src/services/providers/**`
- `src/services/viduService.ts`
- `src/services/minimaxService.ts`
- `src/services/sunoService.ts`
- `src/services/storage.ts`
- `src/app/api/studio/image/route.ts`
- `src/app/api/studio/video/route.ts`
- `src/app/api/studio/chat/route.ts`
- `src/app/api/studio/camera3d/route.ts`
- `src/app/api/studio/proxy/route.ts`
- `src/app/api/audio/minimax/route.ts`
- `src/app/api/audio/suno/route.ts`
- `src/app/api/video/vidu/route.ts`（可选保留，后续并入 `/api/generate/video`）

## 二、保留但必须改造

- `src/components/studio/StudioTab.tsx`
  - 去除：`useAuth/useUserData/LoginModal/UserInfo*`
  - 保留：画布节点与生成流程
- `src/lib/server/assignedKey.ts`
  - 从 Session/Supabase 分配改为本地 env 直取
- `src/app/Providers.tsx`
  - 移除 `SessionProvider/AuthProvider/UserDataProvider/TaskLogProvider`
- `src/services/cosStorage.ts` / `src/services/cosStorageServer.ts`
  - 保留 COS 兼容或替换为本地 `assets/` 策略

## 三、优先删除（用户/支付/后台模块）

- `src/app/(auth)/**`
- `src/app/(dashboard)/**`
- `src/app/pay-result/**`
- `src/app/api/auth/**`
- `src/app/api/payment/**`
- `src/app/api/user/**`
- `src/app/api/promo/**`
- `src/components/dashboard/**`
- `src/components/recharge/**`
- `src/components/layout/DashboardLayout.tsx`
- `src/components/common/AuthRequiredNotice.tsx`
- `src/components/studio/LoginModal.tsx`
- `src/components/studio/UserInfoWidget.tsx`
- `src/components/studio/UserInfoModal.tsx`
- `src/components/studio/UserAvatar.tsx`
- `src/contexts/AuthContext.tsx`
- `src/contexts/UserDataContext.tsx`
- `src/contexts/TaskLogContext.tsx`
- `src/lib/auth.ts`
- `src/lib/supabase.ts`
- `src/lib/services/**`
- `src/services/paymentService.ts`
- `src/services/creditsService.ts`
- `src/services/creditsEvents.ts`
- `src/services/gatewayUsageService.ts`
- `src/services/userApiService.ts`
- `src/services/userKeyService.ts`
- `supabase/**`

## 四、暂缓决策（按 OpenClaw 集成需要）

- `src/app/api/coze/**`
- `src/config/coze/**`
- `src/services/coze/**`
- `src/services/studioSyncService.ts`
- `src/services/studioSyncCosService.ts`
- `src/app/api/studio/sync/route.ts`
- `src/app/api/studio/sync-cos/route.ts`
- `src/app/api/studio/upload/route.ts`

## 五、新增建议（Lite）

- `src/app/api/generate/image/route.ts`
- `src/app/api/generate/video/route.ts`
- `src/app/api/generate/audio/route.ts`
- `src/app/api/task/route.ts`（OpenClaw 对接）
- `src/config/ai-providers.ts`
- `src/lib/ai-client.ts`
- `src/lib/storage-lite.ts`

## 六、执行顺序建议

1. 完成目录基线复制
2. 先替换 `assignedKey` 与全局 Providers
3. 打通 `/api/generate/*` 再删旧路由
4. 清理 `StudioTab` 用户态 UI
5. 最后删除 auth/payment/supabase 代码树
