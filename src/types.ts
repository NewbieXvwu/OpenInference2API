// Type definitions for OpenInference2API

export interface Config {
  server: {
    host: string
    port: number
  }
  upstream: {
    base_url: string
    api_key: string
  }
  downstream: {
    api_key: string
  }
  auto_refill: {
    enabled: boolean
    threshold: number
    target_credits: number | null
    check_interval_ms: number
    max_refills_per_session: number
  }
}

// ==================== API Types ====================

export interface CreditsResponse {
  credits: number
}

export interface ModelObject {
  id: string
  object: 'model'
  created: number
  owned_by: string
  permission: unknown[]
  root: string
  parent: string | null
}

export interface ModelsListResponse {
  object: 'list'
  data: ModelObject[]
}

export interface DuelVoteRequest {
  duel_round_id: string
  winner_opencode_session: string
}

export interface DuelVoteResponse {
  winner: string
  models: string[]
  rating_update: Record<string, number>
}

// ==================== Chat Completions Types ====================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  top_p?: number
  max_tokens?: number
  stream?: boolean
  stop?: string | string[]
  presence_penalty?: number
  frequency_penalty?: number
  tools?: ToolDefinition[]
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  // Duel-specific
  duel_round_id?: string
  session_tracking_number?: string
  // VibeDuel-specific
  duel_slot?: number
  duel_slot_count?: number
  [key: string]: unknown
}

export interface ChatCompletionResponse {
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: ChatCompletionChoice[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  service_tier?: string
  system_fingerprint?: string
}

export interface ChatCompletionChoice {
  index: number
  message: {
    role: 'assistant'
    content: string | null
    tool_calls?: ToolCall[]
  }
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter'
  logprobs?: unknown
}

// ==================== Streaming Types ====================

export interface StreamChunk {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: StreamChoice[]
}

export interface StreamChoice {
  index: number
  delta: {
    role?: 'assistant'
    content?: string | null
    tool_calls?: ToolCall[]
  }
  finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter'
  logprobs?: unknown
}

// ==================== Responses API Types (OpenAI 2024-10-01+) ====================

export interface ResponsesRequest {
  model: string
  input: string | Array<{ role: string; content: string }>
  previous_messages?: Array<{
    role: string
    content: string
  }>
  stream?: boolean
  tools?: ToolDefinition[]
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  max_tokens?: number
  temperature?: number
  top_p?: number
  store?: boolean
  metadata?: Record<string, unknown>
}

export interface ResponsesResponse {
  id: string
  object: 'response'
  created: number
  model: string
  output_text?: string
  output?: Array<{
    type: 'message' | 'refusal' | 'script'
    id: string
    status: 'in_progress' | 'completed' | 'failed'
    content: Array<{
      type: 'output_text' | 'refusal' | 'input_image'
      text?: string
      image?: string
    }>
  }>
  finish_reason: 'stop' | 'max_output_tokens' | 'content_filter'
  usage: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
  }
}

// ==================== Embeddings Types ====================

export interface EmbeddingsRequest {
  model: string
  input: string | string[]
  encoding_format?: 'float' | 'base64'
  dimensions?: number
  user?: string
}

export interface EmbeddingsResponse {
  object: 'list'
  data: Array<{
    object: 'embedding'
    embedding: number[]
    index: number
  }>
  model: string
  usage: {
    prompt_tokens: number
    total_tokens: number
  }
}

// ==================== Error Types ====================

export interface OpenAIError {
  error: {
    message: string
    type: string
    code?: string
    param?: string
    line?: number
  }
}

// ==================== Refill Stats ====================

export interface RefillStats {
  total_refills: number
  last_refill_at: number | null
  current_credits: number | null
  is_refilling: boolean
  refills_this_session: number
}
