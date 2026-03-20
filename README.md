# OpenInference2API

VibeDuel API reverse proxy that exposes a standard OpenAI-compatible interface with automatic credit refill.

## Features

- **OpenAI-Compatible API**: Standard `/v1/chat/completions` endpoint
- **Automatic Credit Refill**: Triggers duel-based credit refill on startup and after request intervals
- **Tool Calling Support**: Forwards tool definitions to upstream
- **Streaming Support**: Full support for Server-Sent Events (SSE) streaming

## Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure

Copy `.env.example` to `.env` and set your API keys:

```bash
cp .env.example .env
```

Edit `.env`:
```
VIBEDUEL_API_KEY=your_vibeduel_api_key
DOWNSTREAM_API_KEY=your_client_api_key
```

### 3. Run

```bash
bun run src/index.ts
```

Or with environment variables directly:

```bash
VIBEDUEL_API_KEY=xxx DOWNSTREAM_API_KEY=yyy bun run src/index.ts
```

## API Endpoints

### Public Endpoints (No Auth Required)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/v1/models` | GET | List available models (cached on startup) |

### Authenticated Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | Chat completion (OpenAI format) |
| `/v1/credits` | GET | Check current credits |
| `/admin/refill` | POST | Manually trigger auto-refill |
| `/admin/stats` | GET | Service statistics |

## Auto-Refill Behavior

When enabled, the service:

1. **Startup check**: Triggers initial refill check on server start
2. **Request-triggered**: After each chat completion request, checks if time since last refill exceeds interval
3. **When triggered** (credits below threshold):
   - Creates a 2-slot duel
   - Sends a "hello" prompt to both slots
   - Votes for slot 0
   - Earns 50 credits from VibeDuel
4. **Protection**: Maximum 5 refills per session to prevent infinite loops

## Configuration

See `config.yaml` for full configuration options. All settings can be overridden via environment variables.

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `VIBEDUEL_API_KEY` | Upstream API key | - |
| `DOWNSTREAM_API_KEY` | Client authentication key | - |
| `SERVER_HOST` | Listen on this IP | `0.0.0.0` |
| `SERVER_PORT` | Server port | `8080` |
| `VIBEDUEL_BASE_URL` | Upstream API URL | `https://api.vibeduel.ai/v1` |
| `AUTO_REFILL_ENABLED` | Enable auto-refill | `true` |
| `AUTO_REFILL_THRESHOLD` | Trigger refill when credits below | `60` |
| `AUTO_REFILL_INTERVAL_MS` | Minimum interval between refills | `30000` |
| `AUTO_REFILL_MAX_PER_SESSION` | Max refills per session | `5` |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Application                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OpenInference2API Proxy                     │
│  • Validates DOWNSTREAM_API_KEY                                 │
│  • Forwards requests to upstream                                │
│  • Auto-refill when credits low                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       api.vibeduel.ai                           │
│  • Chat Completions (OpenAI format)                             │
│  • Credits management                                           │
│  • Duel mode                                                    │
└─────────────────────────────────────────────────────────────────┘
```
