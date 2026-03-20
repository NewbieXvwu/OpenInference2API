import type { Config, DuelVoteRequest, DuelVoteResponse } from './types.js'
import { fetchCredits, refillStats, invalidateCreditsCache } from './credits.js'

// Generate a simple round ID for auto-refill duels
function generateDuelRoundId(): string {
  return `auto_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

// Generate a simple session ID
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

let refillsThisSession = 0
let checkIntervalMs = 30000 // Default 30 seconds

export async function triggerAutoRefill(config: Config): Promise<boolean> {
  if (!config.auto_refill.enabled) {
    console.log('[AutoRefill] Disabled in config')
    return false
  }

  if (refillStats.is_refilling) {
    console.log('[AutoRefill] Already in progress, skipping')
    return false
  }

  if (refillsThisSession >= config.auto_refill.max_refills_per_session) {
    console.log(`[AutoRefill] Max refills per session (${config.auto_refill.max_refills_per_session}) reached`)
    return false
  }

  const currentCredits = await fetchCredits(config)
  if (currentCredits > config.auto_refill.threshold) {
    console.log(`[AutoRefill] Credits (${currentCredits}) above threshold (${config.auto_refill.threshold}), skipping`)
    return false
  }

  console.log(`[AutoRefill] Starting auto-refill. Current credits: ${currentCredits}`)

  refillStats.is_refilling = true

  try {
    const baseUrl = config.upstream.base_url.replace(/\/v1$/, '')
    const duelRoundId = generateDuelRoundId()
    const slotCount = 2 // Use 2 slots for faster auto-refill

    // Create sessions for the duel
    const sessions: string[] = []
    for (let i = 0; i < slotCount; i++) {
      const sessionId = generateSessionId()
      sessions.push(sessionId)
    }

    console.log(`[AutoRefill] Created ${sessions.length} sessions, round: ${duelRoundId}`)

    // Send a simple "hello" prompt to all slots via upstream
    const promptResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.upstream.api_key}`,
        'Content-Type': 'application/json',
        'x-duel-round-id': duelRoundId,
        'x-opencode-session': sessions[0]!,
      },
      body: JSON.stringify({
        model: 'duel',
        messages: [{ role: 'user', content: 'hello' }],
        duel_round_id: duelRoundId,
        max_tokens: 10,
      }),
    })

    if (!promptResponse.ok) {
      console.error(`[AutoRefill] Prompt request failed: ${promptResponse.status}`)
      return false
    }

    console.log(`[AutoRefill] Prompt sent to all slots, waiting for responses...`)

    // Wait a bit for responses to complete
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Vote for slot 0
    const voteRequest: DuelVoteRequest = {
      duel_round_id: duelRoundId,
      winner_opencode_session: sessions[0]!,
    }

    console.log(`[AutoRefill] Submitting vote for session: ${sessions[0]}`)

    const voteResponse = await fetch(`${baseUrl}/v1/duel/vote`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.upstream.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(voteRequest),
    })

    if (!voteResponse.ok) {
      console.error(`[AutoRefill] Vote request failed: ${voteResponse.status}`)
      return false
    }

    const voteResult: DuelVoteResponse = await voteResponse.json()
    console.log(`[AutoRefill] Vote successful. Winner: ${voteResult.winner}`)

    // Invalidate cache and fetch new credits
    invalidateCreditsCache()
    const newCredits = await fetchCredits(config)

    console.log(`[AutoRefill] Complete! New credits: ${newCredits}`)

    refillStats.total_refills++
    refillStats.last_refill_at = Date.now()
    refillsThisSession++

    return true
  } catch (error) {
    console.error('[AutoRefill] Error:', error)
    return false
  } finally {
    refillStats.is_refilling = false
  }
}

// Check if refill should be triggered based on time since last refill
export function shouldRefill(): boolean {
  if (!refillStats.last_refill_at) {
    return true // Never refilled, should do initial check
  }
  const elapsed = Date.now() - refillStats.last_refill_at
  return elapsed >= checkIntervalMs
}

// Trigger refill in background if needed - called on each request
export function checkAndRefillIfNeeded(config: Config): void {
  if (!config.auto_refill.enabled) return
  if (refillStats.is_refilling) return
  if (refillsThisSession >= config.auto_refill.max_refills_per_session) return
  if (!shouldRefill()) return

  // Fire and forget
  triggerAutoRefill(config).catch((err) =>
    console.error('[AutoRefill] Background refill failed:', err)
  )
}

// Initial check on startup
export async function initAutoRefill(config: Config): Promise<void> {
  if (!config.auto_refill.enabled) {
    console.log('[AutoRefill] Auto-refill is disabled')
    return
  }

  checkIntervalMs = config.auto_refill.check_interval_ms
  console.log(`[AutoRefill] Initial check (threshold: ${config.auto_refill.threshold}, interval: ${checkIntervalMs}ms)`)
  await triggerAutoRefill(config)
}

export function getRefillStats() {
  return {
    ...refillStats,
    refills_this_session: refillsThisSession,
  }
}

export function resetSessionRefillCount(): void {
  refillsThisSession = 0
}
