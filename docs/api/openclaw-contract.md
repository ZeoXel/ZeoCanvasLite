# OpenClaw Task Contract (MVP)

## Overview

This project now exposes a stable task contract for OpenClaw-oriented orchestration:

- `POST /api/task` - submit a generation task
- `GET /api/task/:id` - query task status/result

Internally, the contract forwards to `generate/*` endpoints:

- `POST /api/generate/image`
- `POST /api/generate/video`
- `POST/GET /api/generate/audio`

## Submit Task

### Endpoint

`POST /api/task`

### Request

```json
{
  "type": "image|video|audio",
  "provider": "optional, required for audio: minimax|suno",
  "payload": {}
}
```

### Response

```json
{
  "taskId": "string",
  "type": "image|video|audio",
  "provider": "string",
  "status": "queued|running|succeeded|failed",
  "result": {},
  "error": "optional string",
  "meta": {},
  "createdAt": 0,
  "updatedAt": 0
}
```

## Query Task

### Endpoint

`GET /api/task/:id?type=video&provider=vidu`

### Query Parameters

- `type` (required when task not in in-memory cache): `image|video|audio`
- `provider` (required for audio): `minimax|suno`
- `model` (optional for video providers)

### Response

Same object schema as submit response.

## Notes

- Task cache is in-memory process-level (MVP behavior).
- Video and async audio task IDs map to upstream provider task IDs.
- Image tasks are usually immediate success and cached locally.
- Legacy routes remain available during transition (`/api/studio/*`, `/api/audio/*`).
