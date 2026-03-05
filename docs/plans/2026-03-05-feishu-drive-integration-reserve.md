# Feishu Drive Integration Reserve (ZeoCanvasLite)

- Date: 2026-03-05
- Scope: Reserve Feishu Drive storage adapter for future OpenClaw team workflow, while keeping current runtime stable on COS.

## 1. Goal

Keep the current canvas and generation flow unchanged, but make storage swappable by runtime mode:

- `RUNTIME_STORAGE_MODE=cos` (default, production-ready now)
- `RUNTIME_STORAGE_MODE=feishu` (reserved; adapter skeleton present, returns explicit not-ready errors)

Existing adapter entrypoints:

- `src/services/storage/serverRuntimeStorage.ts`
- `src/services/storage/feishuDriveAdapter.ts`

## 2. Verified Feishu Endpoints (2026-03-05)

The following endpoints are reachable and confirmed for contract planning:

- Token: `POST /open-apis/auth/v3/tenant_access_token/internal`
- Drive upload: `POST /open-apis/drive/v1/files/upload_all`
- Drive folder create: `POST /open-apis/drive/v1/files/create_folder`
- Root folder meta: `GET /open-apis/drive/explorer/v2/root_folder/meta`

Probe results used for verification:

- Missing/invalid token returns authorization errors on Drive endpoints.
- Token endpoint returns parameter/app validation errors when app credentials are invalid.

## 3. Official Doc References

- Tenant token (internal app): <https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal>
- Upload file (`upload_all`): <https://open.feishu.cn/document/server-docs/docs/drive-v1/upload/upload_all>
- Create folder: <https://open.feishu.cn/document/server-docs/docs/drive-v1/folder/create_folder>
- Upload media/material: <https://open.feishu.cn/document/server-docs/docs/drive-v1/media/upload_all>
- Download media/material: <https://open.feishu.cn/document/server-docs/docs/drive-v1/media/download>

Notes from docs metadata (for planning):

- `upload_all`: file size limit 20MB, rate limit 5 QPS.
- `create_folder`: rate limit 5 QPS, single-level node cap 1500.

## 4. Proposed Runtime Mapping

`serverRuntimeStorage` methods map to Feishu adapter methods:

- `uploadDataUrlServer` -> `uploadDataUrlToFeishu`
- `uploadBufferServer` -> `uploadBufferToFeishu`
- `fetchTextServer` -> `fetchTextFromFeishu`
- `uploadTextServer` -> `uploadTextToFeishu`

Key strategy (already reserved):

- Keep deterministic key format `zeocanvas/{userId}/{category}/...`
- Feishu mode should map this logical key to:
  - folder path under a configured root folder token, and
  - returned `file_token` for stable lookup/cache.

## 5. Required Env for Feishu Mode

Already reserved in code:

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_DRIVE_ROOT_FOLDER_TOKEN`
- `RUNTIME_STORAGE_MODE=feishu`

Current behavior:

- Missing env -> explicit `FEISHU_STORAGE_NOT_READY`
- Feishu mode + COS STS route -> returns `501` with clear message

## 6. Recommended Implementation Order (Next Iteration)

1. Implement `getTenantAccessToken()` with in-memory TTL cache (token ~2h, refresh ahead of expiry).
2. Implement `ensureFolderPath(rootToken, segments[])` with local token cache (`Map<logicalPath, folderToken>`).
3. Implement `uploadBufferToFeishu` using `files/upload_all` (multipart form).
4. Implement `uploadTextToFeishu` and `fetchTextFromFeishu` for sync payload persistence.
5. Return normalized storage result:
   - `provider: "feishu"`
   - `key` (logical key)
   - `fileToken`
   - `url` (open/download URL policy decided by team)

## 7. Risks / Pending Decisions

- Files over 20MB need split strategy or fallback provider.
- Open/share link policy (internal only vs external share) must be aligned with team security policy.
- Final permission scopes must be confirmed in Feishu app console before rollout.
- Root folder ownership and retention policy should be fixed early for team collaboration.

