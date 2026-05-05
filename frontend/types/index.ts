export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  tool_called?: string | null
  tool_payload?: Record<string, any>
  tool_status?: string | null
  created_at: string
}

export interface AgentResponse {
  reply: string
  tool_called: string | null
  tool_payload: Record<string, any>
  tool_status: string | null
  navigate_to: string | null
  dashboard_filters: Record<string, string>
}

export interface Company {
  id: string
  name: string
  domain: string
  url: string
  industry: string
  location: string
  employee_count: number | null
  linkedin_url: string | null
  tech_stack: string[]
  created_at: string
  enrichments?: {
    score: number | null
    intent_label: string | null
    rationale: string | null
  }[]
}