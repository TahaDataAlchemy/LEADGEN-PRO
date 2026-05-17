'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/sidebar'
import { api } from '@/libs/api'
import { supabase } from '@/libs/supabase'
import type { Signal } from '@/types'

export default function SignalsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.push('/login')
      else setUserId(data.session.user.id)
    })
  }, [router])

  useEffect(() => {
    if (!userId) return
    void (async () => {
      setLoading(true)
      try {
        const res = await api.get('/signals', {
          params: { user_id: userId, unread_only: unreadOnly },
        })
        setSignals(res.data.items || [])
      } catch (err) {
        console.error('Failed to load signals', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [userId, unreadOnly])

  const markReadAndOpen = async (signal: Signal) => {
    if (!userId) return
    try {
      if (!signal.is_read) {
        await api.post(`/signals/${signal.id}/read`, { user_id: userId })
      }
    } catch {}
    router.push(`/company/${signal.company_id}`)
  }

  const severityColor = (severity: string) => {
    if (severity === 'high') return { bg: 'var(--red-dim)', color: 'var(--red)' }
    if (severity === 'medium') return { bg: 'var(--amber-dim)', color: 'var(--amber)' }
    return { bg: 'var(--bg-3)', color: 'var(--text-3)' }
  }

  if (!userId) return null

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>
      <Sidebar userId={userId} activeConversationId="" onSelectConversation={() => router.push('/chat')} />

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
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Signal Feed</div>
            <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '1px' }}>
              Live watchlist updates for funding, hiring, and headcount movement
            </div>
          </div>
          <button
            onClick={() => setUnreadOnly(prev => !prev)}
            style={{
              padding: '6px 10px',
              borderRadius: '999px',
              border: '1px solid',
              fontSize: '11px',
              cursor: 'pointer',
              borderColor: unreadOnly ? 'var(--accent)' : 'var(--border)',
              background: unreadOnly ? 'var(--accent-dim)' : 'var(--bg-3)',
              color: unreadOnly ? 'var(--accent)' : 'var(--text-2)',
            }}
          >
            {unreadOnly ? 'Unread only' : 'All signals'}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {loading ? (
            <div style={{ color: 'var(--text-3)', fontSize: '13px' }}>Loading signals...</div>
          ) : signals.length === 0 ? (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-3)',
                fontSize: '13px',
              }}
            >
              No signals yet. Add companies to your watchlist to start monitoring them.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {signals.map(signal => {
                const colors = severityColor(signal.severity)
                return (
                  <button
                    key={signal.id}
                    onClick={() => markReadAndOpen(signal)}
                    style={{
                      background: signal.is_read ? 'var(--bg-2)' : 'var(--bg-3)',
                      border: signal.is_read ? '1px solid var(--border)' : '1px solid var(--accent-dim)',
                      borderRadius: '16px',
                      padding: '16px',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
                          {signal.headline}
                        </div>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-3)' }}>
                          {signal.companies?.name || 'Company'} • {new Date(signal.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        {!signal.is_read && (
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: 'var(--accent)',
                              marginTop: '6px',
                            }}
                          />
                        )}
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '4px 8px',
                            borderRadius: '999px',
                            background: colors.bg,
                            color: colors.color,
                            textTransform: 'uppercase',
                          }}
                        >
                          {signal.severity}
                        </span>
                      </div>
                    </div>
                    <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.6' }}>
                      {signal.summary}
                    </div>
                    {signal.changes?.length ? (
                      <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {signal.changes.map(change => (
                          <span
                            key={change}
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-3)',
                              background: 'var(--bg)',
                              border: '1px solid var(--border)',
                              borderRadius: '999px',
                              padding: '4px 8px',
                            }}
                          >
                            {change}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
