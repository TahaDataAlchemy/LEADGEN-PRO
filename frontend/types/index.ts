export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface ToolPayload {
  args?: Record<string, unknown>
  result?: Record<string, unknown> | null
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  tool_called?: string | null
  tool_payload?: ToolPayload | Record<string, unknown> | null
  tool_status?: string | null
  created_at: string
}

export interface AgentResponse {
  reply: string
  tool_called: string | null
  tool_payload: Record<string, unknown>
  tool_status: string | null
  tool_result?: Record<string, unknown> | null
  navigate_to: string | null
  dashboard_filters: Record<string, string>
}

export interface Enrichment {
  score: number | null
  intent_label: string | null
  rationale: string | null
  recommended_action: string | null
  revenue_estimate?: string | null
  revenue_min_usd?: number | null
  revenue_max_usd?: number | null
  funding_stage?: string | null
}

export interface Company {
  id: string
  name: string
  domain: string
  url: string
  industry: string
  location: string
  description?: string | null
  employee_count: number | null
  linkedin_url: string | null
  tech_stack: string[]
  created_at: string
  enrichments?: Enrichment[]
}

export interface Signal {
  id: string
  user_id: string
  company_id: string
  signal_type: string
  headline: string
  summary: string
  severity: 'high' | 'medium' | 'low'
  changes: string[]
  snapshot?: Record<string, unknown>
  is_read: boolean
  created_at: string
  companies?: {
    name?: string
    domain?: string
  } | null
}

export interface Draft {
  id?: string
  company_id: string
  subject: string
  body: string
  tone: string
  why_now?: string
  created_at?: string
}

export interface CompanyProfileResponse {
  company: Company
  enrichment: Enrichment
  signals: Signal[]
  watchlisted: boolean
  watchlist_entry?: Record<string, unknown> | null
  drafts: Draft[]
}
