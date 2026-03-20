import type { Config, RefillStats, CreditsResponse } from './types.js'

let currentCredits: number | null = null
let lastFetchTime: number | null = null
const CACHE_TTL_MS = 5000 // Cache credits for 5 seconds

export async function fetchCredits(config: Config): Promise<number> {
  const now = Date.now()

  // Return cached value if still fresh
  if (currentCredits !== null && lastFetchTime !== null && now - lastFetchTime < CACHE_TTL_MS) {
    return currentCredits
  }

  const baseUrl = config.upstream.base_url.replace(/\/v1$/, '')
  const response = await fetch(`${baseUrl}/v1/credits`, {
    headers: {
      Authorization: `Bearer ${config.upstream.api_key}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch credits: ${response.status} ${response.statusText}`)
  }

  const data: CreditsResponse = await response.json()
  currentCredits = data.credits
  lastFetchTime = now

  return currentCredits
}

export async function getCreditsWithCache(config: Config): Promise<number> {
  return fetchCredits(config)
}

export function getRefillStats(): RefillStats {
  return {
    total_refills: refillStats.total_refills,
    last_refill_at: refillStats.last_refill_at,
    current_credits: currentCredits,
    is_refilling: refillStats.is_refilling,
  }
}

export const refillStats: {
  total_refills: number
  last_refill_at: number | null
  is_refilling: boolean
} = {
  total_refills: 0,
  last_refill_at: null,
  is_refilling: false,
}

export function invalidateCreditsCache(): void {
  currentCredits = null
  lastFetchTime = null
}
