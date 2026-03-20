import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { z } from 'zod'
import type { Config } from './types.js'

const ConfigSchema = z.object({
  server: z.object({
    host: z.string().default('0.0.0.0'),
    port: z.number().default(8080),
  }),
  upstream: z.object({
    base_url: z.string().default('https://api.vibeduel.ai/v1'),
    api_key: z.string().default(''),
  }),
  downstream: z.object({
    api_key: z.string().default(''),
  }),
  auto_refill: z.object({
    enabled: z.boolean().default(true),
    threshold: z.number().default(60),
    target_credits: z.number().nullable().default(null),
    check_interval_ms: z.number().default(30000),
    max_refills_per_session: z.number().default(5),
  }),
})

let config: Config | null = null

export function loadConfig(configPath: string = './config.yaml'): Config {
  if (config) return config

  const fileContent = readFileSync(configPath, 'utf-8')
  const rawConfig = parse(fileContent)

  // Override with environment variables
  const envConfig = {
    server: {
      host: process.env.SERVER_HOST ?? rawConfig.server?.host ?? '0.0.0.0',
      port: parseInt(process.env.SERVER_PORT ?? rawConfig.server?.port ?? '8080'),
    },
    upstream: {
      base_url: process.env.VIBEDUEL_BASE_URL ?? rawConfig.upstream?.base_url ?? 'https://api.vibeduel.ai/v1',
      api_key: process.env.VIBEDUEL_API_KEY ?? rawConfig.upstream?.api_key ?? '',
    },
    downstream: {
      api_key: process.env.DOWNSTREAM_API_KEY ?? rawConfig.downstream?.api_key ?? '',
    },
    auto_refill: {
      enabled: process.env.AUTO_REFILL_ENABLED !== 'false',
      threshold: parseInt(process.env.AUTO_REFILL_THRESHOLD ?? rawConfig.auto_refill?.threshold ?? '60'),
      target_credits: rawConfig.auto_refill?.target_credits ?? null,
      check_interval_ms: parseInt(process.env.AUTO_REFILL_INTERVAL_MS ?? rawConfig.auto_refill?.check_interval_ms ?? '30000'),
      max_refills_per_session: parseInt(process.env.AUTO_REFILL_MAX_PER_SESSION ?? rawConfig.auto_refill?.max_refills_per_session ?? '5'),
    },
  }

  config = ConfigSchema.parse(envConfig)

  // Validate required config
  if (!config.upstream.api_key) {
    throw new Error('VIBEDUEL_API_KEY is required. Set it via environment variable or config.yaml')
  }
  if (!config.downstream.api_key) {
    throw new Error('DOWNSTREAM_API_KEY is required. Set it via environment variable or config.yaml')
  }

  return config
}

export function getConfig(): Config {
  if (!config) {
    throw new Error('Config not loaded. Call loadConfig() first.')
  }
  return config
}
