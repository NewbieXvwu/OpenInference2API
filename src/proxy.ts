import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import type { Config } from './types.js'
import { fetchCredits, invalidateCreditsCache } from './credits.js'
import { triggerAutoRefill, checkAndRefillIfNeeded } from './refill.js'

// Paths that don't require authentication
const PUBLIC_PATHS = ['/health', '/v1/models']

// Models cache - only fetched once on startup
let cachedModels: string[] | null = null

export function createProxyApp(config: Config): Hono {
  const app = new Hono()

  // Authentication middleware - skip for public paths
  app.use('/*', async (c: Context, next: Next) => {
    // Skip auth for public paths
    const path = c.req.path
    if (PUBLIC_PATHS.includes(path) || path.startsWith('/health')) {
      await next()
      return
    }

    const authHeader = c.req.header('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({
        error: {
          message: 'Missing or invalid Authorization header',
          type: 'authentication_error',
          code: 'missing_authorization',
        }
      }, 401)
    }

    const providedKey = authHeader.slice(7)

    if (providedKey !== config.downstream.api_key) {
      return c.json({
        error: {
          message: 'Invalid API key',
          type: 'authentication_error',
          code: 'invalid_authorization',
        }
      }, 401)
    }

    await next()
  })

  // ==================== Public Endpoints ====================

  // Health check
  app.get('/health', (c: Context) => {
    return c.json({
      status: 'ok',
      service: 'openinference2api',
      version: '1.0.0',
      upstream: config.upstream.base_url,
      timestamp: new Date().toISOString(),
    })
  })

  // OpenAI-compatible models list
  app.get('/v1/models', async (c: Context) => {
    // Return cached models if available
    if (cachedModels !== null) {
      return c.json({
        object: 'list',
        data: cachedModels.map((id, index) => ({
          id,
          object: 'model',
          created: 1700000000 + index,
          owned_by: 'vibeduel',
          permission: [],
          root: id,
          parent: null,
        })),
      })
    }

    // Fetch models from upstream on first request
    try {
      const upstreamUrl = `${config.upstream.base_url}/usable_models`
      const response = await fetch(upstreamUrl, {
        headers: {
          Authorization: `Bearer ${config.upstream.api_key}`,
        },
      })

      if (!response.ok) {
        return c.json({
          error: {
            message: `Failed to fetch models: ${response.status}`,
            type: 'server_error',
            code: 'model_fetch_failed',
          }
        }, response.status)
      }

      const data = await response.json()
      cachedModels = Array.isArray(data) ? data : (data.models || [])

      return c.json({
        object: 'list',
        data: cachedModels.map((id, index) => ({
          id,
          object: 'model',
          created: 1700000000 + index,
          owned_by: 'vibeduel',
          permission: [],
          root: id,
          parent: null,
        })),
      })
    } catch (error) {
      console.error('[Proxy] Models fetch error:', error)
      return c.json({
        error: {
          message: 'Failed to fetch models',
          type: 'server_error',
          code: 'model_fetch_failed',
        }
      }, 500)
    }
  })

  // Also support /models (without v1 prefix)
  app.get('/models', async (c: Context) => {
    c.req.path = '/v1/models'
    return app.fetch(c.req.raw)
  })

  // ==================== Credits Endpoints ====================

  // Get current credits
  app.get('/v1/credits', async (c: Context) => {
    try {
      const credits = await fetchCredits(config)
      return c.json({
        credits,
        source: 'vibeduel',
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error('[Proxy] Failed to fetch credits:', error)
      return c.json({
        error: {
          message: 'Failed to fetch credits',
          type: 'server_error',
          code: 'credits_fetch_failed',
        }
      }, 500)
    }
  })

  // ==================== Chat Completions ====================

  // Chat completions - OpenAI's main API endpoint
  app.post('/v1/chat/completions', async (c: Context) => {
    try {
      const body = await c.req.json()

      // Validate request
      if (!body.messages || !Array.isArray(body.messages)) {
        return c.json({
          error: {
            message: 'messages is required and must be an array',
            type: 'invalid_request_error',
            code: 'missing_messages',
          }
        }, 400)
      }

      if (!body.model) {
        return c.json({
          error: {
            message: 'model is required',
            type: 'invalid_request_error',
            code: 'missing_model',
          }
        }, 400)
      }

      // Add tracking number if not present
      if (!body.session_tracking_number) {
        body.session_tracking_number = `proxy_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      }

      // Extract duel-related headers if present
      const duelRoundId = c.req.header('x-duel-round-id')
      const opencodeSession = c.req.header('x-opencode-session')

      const upstreamUrl = `${config.upstream.base_url}/chat/completions`

      const upstreamHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.upstream.api_key}`,
      }

      // Forward duel headers if present
      if (duelRoundId) {
        upstreamHeaders['x-duel-round-id'] = duelRoundId
      }
      if (opencodeSession) {
        upstreamHeaders['x-opencode-session'] = opencodeSession
      }

      // Forward additional headers that might be relevant
      const forwardedHeaders = [
        'x-request-id',
        'x-trace-id',
        'anthropic-dangerous-direct-browser-access',
      ]
      for (const header of forwardedHeaders) {
        const value = c.req.header(header)
        if (value) {
          upstreamHeaders[header] = value
        }
      }

      console.log(`[Proxy] Forwarding chat completion: model=${body.model}, stream=${body.stream ?? false}, tools=${!!body.tools}`)

      const upstreamResponse = await fetch(upstreamUrl, {
        method: 'POST',
        headers: upstreamHeaders,
        body: JSON.stringify(body),
      })

      // Handle streaming response
      if (body.stream === true) {
        console.log(`[Proxy] Streaming response for model=${body.model}`)
        return streamResponse(c, upstreamResponse)
      }

      // Handle non-streaming response
      if (!upstreamResponse.ok) {
        const errorData = await upstreamResponse.json().catch(() => ({}))
        console.error(`[Proxy] Upstream error: ${upstreamResponse.status}`, errorData)
        return c.json({
          error: {
            message: errorData.error?.message || `Upstream request failed with status ${upstreamResponse.status}`,
            type: errorData.error?.type || 'upstream_error',
            code: `upstream_${upstreamResponse.status}`,
          }
        }, upstreamResponse.status)
      }

      const responseData = await upstreamResponse.json()

      // Invalidate credits cache after successful request
      invalidateCreditsCache()

      // Check if we should trigger auto-refill (based on time since last refill)
      // Fire and forget - runs in parallel with response
      checkAndRefillIfNeeded(config)

      return c.json(responseData, 200)
    } catch (error) {
      console.error('[Proxy] Chat completion error:', error)
      return c.json({
        error: {
          message: error instanceof Error ? error.message : 'Proxy error',
          type: 'proxy_error',
          code: 'proxy_internal_error',
        }
      }, 500)
    }
  })

  // Support /chat/completions without v1 prefix
  app.post('/chat/completions', async (c: Context) => {
    c.req.path = '/v1/chat/completions'
    return app.fetch(c.req.raw)
  })

  // ==================== Admin Endpoints ====================

  // Manual trigger for auto-refill
  app.post('/admin/refill', async (c: Context) => {
    try {
      const success = await triggerAutoRefill(config)
      if (success) {
        const credits = await fetchCredits(config)
        return c.json({
          success: true,
          credits,
          message: 'Refill successful',
        })
      } else {
        return c.json({
          success: false,
          message: 'Refill skipped or failed (check logs)',
        }, 200)
      }
    } catch (error) {
      console.error('[Proxy] Refill error:', error)
      return c.json({
        error: {
          message: 'Refill failed',
          type: 'server_error',
        }
      }, 500)
    }
  })

  // Get service stats
  app.get('/admin/stats', async (c: Context) => {
    try {
      const credits = await fetchCredits(config)
      const { getRefillStats } = await import('./refill.js')
      const refillStats = getRefillStats()

      return c.json({
        credits,
        auto_refill: {
          enabled: config.auto_refill.enabled,
          threshold: config.auto_refill.threshold,
          ...refillStats,
        },
        upstream: config.upstream.base_url,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error('[Proxy] Stats error:', error)
      return c.json({
        error: {
          message: 'Failed to fetch stats',
          type: 'server_error',
        }
      }, 500)
    }
  })

  return app
}

// ==================== Helper Functions ====================

async function streamResponse(c: Context, upstreamResponse: Response): Promise<Response> {
  const reader = upstreamResponse.body?.getReader()
  if (!reader) {
    return c.json({ error: 'No response body' }, 500)
  }

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          controller.enqueue(value)
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
    cancel() {
      reader.cancel()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Request-Origin': 'openinference2api',
    },
  })
}
