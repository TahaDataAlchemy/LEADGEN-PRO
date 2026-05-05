'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/libs/supabase'
import { api } from '@/libs/api'
import Sidebar from '@/components/sidebar'
import type { Message, AgentResponse } from '@/types'

const generateTempId = () => `temp-${Math.random().toString(36).slice(2)}`

export default function ChatPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [activeConvId, setActiveConvId] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // ── auth check ─────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push('/login')
      } else {
        setUserId(data.session.user.id)
      }
    })
  }, [])

  // ── scroll to bottom on new message ───────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── load messages when conversation changes ────────────
  useEffect(() => {
    if (!activeConvId) return
    loadMessages(activeConvId)
    loadSuggestions(activeConvId)
  }, [activeConvId])

  const loadMessages = async (convId: string) => {
    try {
      const res = await api.get(`/conversations/${convId}/messages`)
      setMessages(res.data)
    } catch (err) {
      console.error('Failed to load messages', err)
    }
  }

  const loadSuggestions = async (convId: string) => {
    try {
      const res = await api.get(`/conversations/${convId}/suggestions`)
      setSuggestions(res.data.suggestions || [])
    } catch (err) {
      setSuggestions([])
    }
  }

  // ── send message ───────────────────────────────────────
  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim()
    if (!messageText || loading || !activeConvId || !userId) return

    // optimistic UI — show user message immediately
    const tempUserMsg: Message = {
      id: generateTempId(),
      conversation_id: activeConvId,
      role: 'user',
      content: messageText,
      created_at: new Date().toISOString()
    }
    setMessages(prev => [...prev, tempUserMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await api.post<AgentResponse>('/conversations/message', {
        conversation_id: activeConvId,
        user_id: userId,
        message: messageText
      })

      const data = res.data

      // add agent reply to messages
      const agentMsg: Message = {
        id: generateTempId(),
        conversation_id: activeConvId,
        role: 'assistant',
        content: data.reply,
        tool_called: data.tool_called,
        tool_status: data.tool_status,
        created_at: new Date().toISOString()
      }
      setMessages(prev => [...prev, agentMsg])

      // refresh suggestions after reply
      loadSuggestions(activeConvId)

      // navigate to dashboard if agent signals it
      if (data.navigate_to) {
        const params = new URLSearchParams(
          Object.fromEntries(
            Object.entries(data.dashboard_filters)
              .filter(([_, v]) => v !== null && v !== undefined)
              .map(([k, v]) => [k, String(v)])
          )
        )
        setTimeout(() => {
          router.push(`${data.navigate_to}?${params.toString()}`)
        }, 1200)
      }

    } catch (err) {
      setMessages(prev => [...prev, {
        id: generateTempId(),
        conversation_id: activeConvId,
        role: 'assistant',
        content: 'Something went wrong. Please try again.',
        created_at: new Date().toISOString()
      }])
    } finally {
      setLoading(false)
    }
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

        {/* topbar */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-2)'
        }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
            AI Analyst
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{
              fontSize: '10px',
              background: 'var(--green-dim)',
              color: 'var(--green)',
              padding: '3px 8px',
              borderRadius: '99px',
              fontWeight: 500
            }}>
              Groq · llama-3.3-70b
            </span>
            <span style={{
              fontSize: '10px',
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
              padding: '3px 8px',
              borderRadius: '99px',
              fontWeight: 500
            }}>
              Agent active
            </span>
          </div>
        </div>

        {/* messages area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>

          {/* empty state */}
          {!activeConvId && (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              paddingTop: '60px'
            }}>
              <div style={{
                fontSize: '20px',
                fontWeight: 600,
                color: 'var(--text)'
              }}>
                LeadGen Pro
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text-2)', textAlign: 'center', maxWidth: '360px' }}>
                Start a new chat or select a conversation from the sidebar to begin finding and analyzing leads.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
                {[
                  'Find SaaS companies in Texas',
                  'Show me today\'s scraped leads',
                  'Draft email for Acme Corp',
                  'Analyze my pipeline'
                ].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={async () => {
                      const res = await api.post('/conversations/new', { user_id: userId })
                      setActiveConvId(res.data.id)
                      setTimeout(() => sendMessage(suggestion), 300)
                    }}
                    style={{
                      background: 'var(--bg-3)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      color: 'var(--text-2)',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* messages */}
          {messages.map(msg => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                gap: '8px',
                alignItems: 'flex-start'
              }}
            >
              {/* AI avatar */}
              {msg.role === 'assistant' && (
                <div style={{
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
                  marginTop: '2px'
                }}>
                  AI
                </div>
              )}

              <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {/* tool badge */}
                {msg.tool_called && msg.role === 'assistant' && (
                  <span style={{
                    fontSize: '10px',
                    background: 'var(--bg-3)',
                    color: 'var(--text-3)',
                    padding: '2px 7px',
                    borderRadius: '99px',
                    width: 'fit-content',
                    fontFamily: 'monospace'
                  }}>
                    {msg.tool_called}
                    {msg.tool_status === 'success' ? ' ✓' : ' ✗'}
                  </span>
                )}

                {/* bubble */}
                <div style={{
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-3)',
                  color: 'var(--text)',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap'
                }}>
                  {msg.content}
                </div>
              </div>

              {/* user avatar */}
              {msg.role === 'user' && (
                <div style={{
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
                  marginTop: '2px'
                }}>
                  U
                </div>
              )}
            </div>
          ))}

          {/* loading dots */}
          {loading && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <div style={{
                width: '26px', height: '26px', borderRadius: '50%',
                background: 'var(--accent)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0
              }}>
                AI
              </div>
              <div style={{
                padding: '12px 16px',
                background: 'var(--bg-3)',
                borderRadius: '14px 14px 14px 4px',
                display: 'flex',
                gap: '4px',
                alignItems: 'center'
              }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: '6px', height: '6px',
                    borderRadius: '50%',
                    background: 'var(--text-3)',
                    animation: 'bounce 1.2s infinite',
                    animationDelay: `${i * 0.2}s`
                  }} />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* suggested questions */}
        {suggestions.length > 0 && activeConvId && (
          <div style={{
            padding: '8px 20px',
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
            borderTop: '1px solid var(--border)'
          }}>
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => sendMessage(s)}
                style={{
                  background: 'var(--bg-3)',
                  border: '1px solid var(--border)',
                  borderRadius: '99px',
                  padding: '5px 12px',
                  color: 'var(--text-2)',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* input bar */}
        <div style={{
          padding: '12px 20px 16px',
          background: 'var(--bg-2)',
          borderTop: '1px solid var(--border)'
        }}>
          {!activeConvId && (
            <p style={{
              fontSize: '11px',
              color: 'var(--text-3)',
              textAlign: 'center',
              marginBottom: '8px'
            }}>
              Create a new chat to start
            </p>
          )}
          <div style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-end',
            background: 'var(--bg-3)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '10px 14px'
          }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={activeConvId
                ? "Ask anything about your leads..."
                : "Select or create a conversation first"
              }
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
                fontFamily: 'inherit'
              }}
              onInput={e => {
                const t = e.target as HTMLTextAreaElement
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 120) + 'px'
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim() || !activeConvId}
              style={{
                background: loading || !input.trim() || !activeConvId
                  ? 'var(--bg-3)'
                  : 'var(--accent)',
                border: 'none',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: loading || !input.trim() || !activeConvId
                  ? 'not-allowed'
                  : 'pointer',
                flexShrink: 0,
                fontSize: '14px'
              }}
            >
              ↑
            </button>
          </div>
          <p style={{
            fontSize: '10px',
            color: 'var(--text-3)',
            textAlign: 'center',
            marginTop: '6px'
          }}>
            Enter to send · Shift+Enter for new line
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