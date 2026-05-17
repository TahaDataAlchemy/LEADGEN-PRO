'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '@/components/sidebar'
import { api } from '@/libs/api'
import { supabase } from '@/libs/supabase'
import type { AgentResponse, Message } from '@/types'

const generateTempId = () => `temp-${Math.random().toString(36).slice(2)}`

function getDraftCard(message: Message) {
  const payload = message.tool_payload as { result?: Record<string, unknown> } | undefined
  const result = payload?.result
  if (!result || message.tool_called !== 'draft_email') return null
  if (typeof result.subject !== 'string' || typeof result.body !== 'string') return null
  return {
    subject: result.subject,
    body: result.body,
    tone: typeof result.tone === 'string' ? result.tone : '',
    whyNow: typeof result.why_now === 'string' ? result.why_now : '',
  }
}

export default function ChatPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [activeConvId, setActiveConvId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const seededPromptRef = useRef(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const seededPrompt = searchParams.get('prompt')

  function navigateFromAgent(data: AgentResponse) {
    if (!data.navigate_to) return
    if (data.navigate_to === '/dashboard') {
      const params = new URLSearchParams(
        Object.entries(data.dashboard_filters || {}).filter(([, value]) => value != null)
      )
      router.push(`${data.navigate_to}?${params.toString()}`)
      return
    }
    router.push(data.navigate_to)
  }

  const runSeededPrompt = useEffectEvent(async (messageText: string) => {
    const res = await api.post('/conversations/new', { user_id: userId })
    const convId = res.data.id as string
    setActiveConvId(convId)
    await sendMessageToConversation(convId, messageText)
    router.replace('/chat')
  })

  async function sendMessageToConversation(conversationId: string, messageText: string) {
    if (!messageText || loading || !userId) return

    const tempUserMsg: Message = {
      id: generateTempId(),
      conversation_id: conversationId,
      role: 'user',
      content: messageText,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempUserMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await api.post<AgentResponse>('/conversations/message', {
        conversation_id: conversationId,
        user_id: userId,
        message: messageText,
      })
      const data = res.data

      const agentMsg: Message = {
        id: generateTempId(),
        conversation_id: conversationId,
        role: 'assistant',
        content: data.reply,
        tool_called: data.tool_called,
        tool_status: data.tool_status,
        tool_payload: { args: data.tool_payload, result: data.tool_result || null },
        created_at: new Date().toISOString(),
      }
      setMessages(prev => [...prev, agentMsg])
      try {
        const res = await api.get(`/conversations/${conversationId}/suggestions`)
        setSuggestions(res.data.suggestions || [])
      } catch {
        setSuggestions([])
      }
      navigateFromAgent(data)
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: generateTempId(),
          conversation_id: conversationId,
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
          created_at: new Date().toISOString(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  async function createConversationAndSend(messageText: string) {
    if (!userId) return
    const res = await api.post('/conversations/new', { user_id: userId })
    const convId = res.data.id as string
    setActiveConvId(convId)
    await sendMessageToConversation(convId, messageText)
    router.replace('/chat')
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push('/login')
      } else {
        setUserId(data.session.user.id)
      }
    })
  }, [router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (!activeConvId) return
    void (async () => {
      try {
        const [messagesRes, suggestionsRes] = await Promise.all([
          api.get(`/conversations/${activeConvId}/messages`),
          api.get(`/conversations/${activeConvId}/suggestions`),
        ])
        setMessages(messagesRes.data)
        setSuggestions(suggestionsRes.data.suggestions || [])
      } catch (err) {
        console.error('Failed to load conversation data', err)
      }
    })()
  }, [activeConvId])

  useEffect(() => {
    if (!userId || !seededPrompt || seededPromptRef.current) return
    seededPromptRef.current = true
    void runSeededPrompt(seededPrompt)
  }, [userId, seededPrompt])

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim()
    if (!messageText || !activeConvId) return
    await sendMessageToConversation(activeConvId, messageText)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!userId) return null

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>
      <Sidebar
        userId={userId}
        activeConversationId={activeConvId}
        onSelectConversation={setActiveConvId}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-2)',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
            AI Analyst
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span
              style={{
                fontSize: '10px',
                background: 'var(--green-dim)',
                color: 'var(--green)',
                padding: '3px 8px',
                borderRadius: '99px',
                fontWeight: 600,
              }}
            >
              Groq
            </span>
            <span
              style={{
                fontSize: '10px',
                background: 'var(--accent-dim)',
                color: 'var(--accent)',
                padding: '3px 8px',
                borderRadius: '99px',
                fontWeight: 600,
              }}
            >
              Agent active
            </span>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {!activeConvId && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                paddingTop: '60px',
              }}
            >
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>
                LeadGen Pro
              </div>
              <div
                style={{
                  fontSize: '14px',
                  color: 'var(--text-2)',
                  textAlign: 'center',
                  maxWidth: '420px',
                }}
              >
                Start a new chat or pick a conversation to find leads, monitor changes, open company profiles, and draft outreach.
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  justifyContent: 'center',
                  marginTop: '8px',
                }}
              >
                {[
                  'Find SaaS companies in Texas',
                  "Show me today's scraped leads",
                  'Add Spectral AI to my watchlist',
                  'How is my pipeline looking?',
                ].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => createConversationAndSend(suggestion)}
                    style={{
                      background: 'var(--bg-3)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      color: 'var(--text-2)',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => {
            const draftCard = getDraftCard(msg)
            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: '8px',
                  alignItems: 'flex-start',
                }}
              >
                {msg.role === 'assistant' && (
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: 'white',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    AI
                  </div>
                )}

                <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {msg.tool_called && msg.role === 'assistant' && (
                    <span
                      style={{
                        fontSize: '10px',
                        background: 'var(--bg-3)',
                        color: 'var(--text-3)',
                        padding: '2px 7px',
                        borderRadius: '99px',
                        width: 'fit-content',
                        fontFamily: 'monospace',
                      }}
                    >
                      {msg.tool_called} {msg.tool_status === 'success' ? 'ok' : 'err'}
                    </span>
                  )}

                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-3)',
                      color: 'var(--text)',
                      fontSize: '13px',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {msg.content}
                  </div>

                  {draftCard && (
                    <div
                      style={{
                        border: '1px solid var(--border)',
                        background: 'var(--bg-2)',
                        borderRadius: '14px',
                        padding: '14px',
                      }}
                    >
                      <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Outreach Draft
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
                        {draftCard.subject}
                      </div>
                      {draftCard.tone && (
                        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--accent)' }}>
                          Tone: {draftCard.tone}
                        </div>
                      )}
                      <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text-2)', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                        {draftCard.body}
                      </div>
                      {draftCard.whyNow && (
                        <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-3)' }}>
                          Why now: {draftCard.whyNow}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: 'var(--bg-3)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      color: 'var(--text-2)',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    U
                  </div>
                )}
              </div>
            )
          })}

          {loading && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'white',
                }}
              >
                AI
              </div>
              <div
                style={{
                  padding: '12px 16px',
                  background: 'var(--bg-3)',
                  borderRadius: '14px 14px 14px 4px',
                  display: 'flex',
                  gap: '4px',
                  alignItems: 'center',
                }}
              >
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: 'var(--text-3)',
                      animation: 'bounce 1.2s infinite',
                      animationDelay: `${i * 0.2}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {suggestions.length > 0 && activeConvId && (
          <div
            style={{
              padding: '8px 20px',
              display: 'flex',
              gap: '6px',
              flexWrap: 'wrap',
              borderTop: '1px solid var(--border)',
            }}
          >
            {suggestions.map(suggestion => (
              <button
                key={suggestion}
                onClick={() => sendMessage(suggestion)}
                style={{
                  background: 'var(--bg-3)',
                  border: '1px solid var(--border)',
                  borderRadius: '99px',
                  padding: '5px 12px',
                  color: 'var(--text-2)',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <div
          style={{
            padding: '12px 20px 16px',
            background: 'var(--bg-2)',
            borderTop: '1px solid var(--border)',
          }}
        >
          {!activeConvId && (
            <p
              style={{
                fontSize: '11px',
                color: 'var(--text-3)',
                textAlign: 'center',
                marginBottom: '8px',
              }}
            >
              Create a new chat to start
            </p>
          )}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-end',
              background: 'var(--bg-3)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '10px 14px',
            }}
          >
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={activeConvId ? 'Ask anything about your leads...' : 'Select or create a conversation first'}
              disabled={!activeConvId || loading}
              rows={1}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text)',
                fontSize: '13px',
                resize: 'none',
                lineHeight: '1.5',
                maxHeight: '120px',
                fontFamily: 'inherit',
              }}
              onInput={e => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = 'auto'
                target.style.height = `${Math.min(target.scrollHeight, 120)}px`
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim() || !activeConvId}
              style={{
                background: loading || !input.trim() || !activeConvId ? 'var(--bg-3)' : 'var(--accent)',
                border: 'none',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: loading || !input.trim() || !activeConvId ? 'not-allowed' : 'pointer',
                flexShrink: 0,
                fontSize: '14px',
                color: 'white',
              }}
            >
              ^
            </button>
          </div>
          <p style={{ fontSize: '10px', color: 'var(--text-3)', textAlign: 'center', marginTop: '6px' }}>
            Enter to send. Shift+Enter for a new line.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  )
}
