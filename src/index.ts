import { serve } from 'bun'
import { loadConfig } from './config.js'
import { createProxyApp } from './proxy.js'
import { initAutoRefill } from './refill.js'

// Load configuration
const configPath = process.env.CONFIG_PATH ?? './config.yaml'
const config = loadConfig(configPath)

const serverUrl = `http://${config.server.host}:${config.server.port}`
const upstreamUrl = config.upstream.base_url
const refillStatus = config.auto_refill.enabled ? 'enabled' : 'disabled'
const threshold = config.auto_refill.threshold

console.log(`
╔══════════════════════════════════════════════════════════════╗
║            OpenInference2API - VibeDuel Proxy                ║
╠══════════════════════════════════════════════════════════════╣
║  Server:      ${serverUrl.padEnd(47)}║
║  Upstream:    ${upstreamUrl.padEnd(47)}║
║  Auto-refill: ${refillStatus.padEnd(47)}║
║  Threshold:   ${String(threshold).padEnd(47)}║
╚══════════════════════════════════════════════════════════════╝
`)

// Create the proxy app
const app = createProxyApp(config)

// Initial auto-refill check on startup
initAutoRefill(config).catch((err) => console.error('[Server] Initial refill failed:', err))

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n[Server] Shutting down...')
  process.exit(0)
})

// Start serving
console.log(`[Server] Starting on http://${config.server.host}:${config.server.port}`)
console.log('[Server] Press Ctrl+C to stop')

serve({
  fetch: app.fetch,
  port: config.server.port,
  hostname: config.server.host,
})

console.log(`[Server] Ready! Proxy is running.`)
