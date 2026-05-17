'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '@/components/sidebar'
import { api } from '@/libs/api'
import { supabase } from '@/libs/supabase'
import type { CompanyProfileResponse, Draft } from '@/types'

export default function CompanyProfilePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<CompanyProfileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [drafting, setDrafting] = useState(false)
  const [watchlisted, setWatchlisted] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.push('/login')
      else setUserId(data.session.user.id)
    })
  }, [router])

  useEffect(() => {
    if (!userId || !params?.id) return
    void (async () => {
      setLoading(true)
      try {
        const res = await api.get(`/companies/${params.id}`, { params: { user_id: userId } })
        setProfile(res.data)
        setWatchlisted(Boolean(res.data.watchlisted))
      } catch (err) {
        console.error('Failed to load company profile', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [userId, params?.id])

  const toggleWatchlist = async () => {
    if (!userId || !params?.id) return
    try {
      if (watchlisted) {
        await api.delete(`/companies/${params.id}/watchlist`, { data: { user_id: userId } })
        setWatchlisted(false)
      } else {
        await api.post(`/companies/${params.id}/watchlist`, { user_id: userId })
        setWatchlisted(true)
      }
    } catch (err) {
      console.error('Failed to update watchlist', err)
    }
  }

  const generateDraft = async (tone: string) => {
    if (!params?.id) return
    setDrafting(true)
    try {
      const res = await api.post(`/companies/${params.id}/draft-email`, { tone })
      const draft: Draft = {
        company_id: res.data.company_id,
        subject: res.data.subject,
        body: res.data.body,
        tone: res.data.tone,
        why_now: res.data.why_now,
      }
      setProfile(prev =>
        prev ? { ...prev, drafts: [draft, ...prev.drafts] } : prev
      )
    } catch (err) {
      console.error('Failed to generate draft', err)
    } finally {
      setDrafting(false)
    }
  }

  if (!userId) return null

  const company = profile?.company
  const enrichment = profile?.enrichment
  const score = enrichment?.score || 0
  const scoreFill = Math.max(0, Math.min(100, score))

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>
      <Sidebar userId={userId} activeConversationId="" onSelectConversation={() => router.push('/chat')} />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading || !company ? (
          <div style={{ padding: '32px', color: 'var(--text-3)' }}>Loading company profile...</div>
        ) : (
          <div style={{ padding: '28px', display: 'grid', gap: '20px' }}>
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(91,110,245,0.16), rgba(17,17,19,0.95))',
                border: '1px solid var(--border)',
                borderRadius: '24px',
                padding: '24px',
                display: 'grid',
                gridTemplateColumns: '1.4fr 0.8fr',
                gap: '20px',
              }}
            >
              <div>
                <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)' }}>
                  Company Profile
                </div>
                <h1 style={{ margin: '8px 0 0', fontSize: '34px', color: 'var(--text)' }}>{company.name}</h1>
                <div style={{ marginTop: '8px', fontSize: '14px', color: 'var(--text-2)' }}>
                  {company.industry || 'Unknown industry'} • {company.location || 'Unknown location'}
                </div>
                <p style={{ marginTop: '18px', maxWidth: '720px', fontSize: '14px', color: 'var(--text-2)', lineHeight: '1.7' }}>
                  {company.description || 'No company description is available yet.'}
                </p>
                <div style={{ marginTop: '18px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    onClick={toggleWatchlist}
                    style={{
                      background: watchlisted ? 'var(--green-dim)' : 'var(--accent-dim)',
                      border: '1px solid',
                      borderColor: watchlisted ? '#1a4a2a' : 'var(--accent)',
                      color: watchlisted ? 'var(--green)' : 'var(--accent)',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {watchlisted ? 'Watching' : 'Add to Watchlist'}
                  </button>
                  <button
                    onClick={() => router.push(`/chat?prompt=${encodeURIComponent(`Draft an email for ${company.name} in a conversational tone`)}`)}
                    style={{
                      background: 'var(--bg-3)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-2)',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    Open in Chat
                  </button>
                  {company.url && (
                    <a
                      href={company.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: 'var(--bg-3)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-2)',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        textDecoration: 'none',
                      }}
                    >
                      Website
                    </a>
                  )}
                  {company.linkedin_url && (
                    <a
                      href={company.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: 'var(--bg-3)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-2)',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        textDecoration: 'none',
                      }}
                    >
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(10,10,11,0.75)',
                  border: '1px solid var(--border)',
                  borderRadius: '20px',
                  padding: '20px',
                }}
              >
                <div style={{ fontSize: '12px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Intent Score
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '18px' }}>
                  <div
                    style={{
                      width: '180px',
                      height: '180px',
                      borderRadius: '50%',
                      background: `conic-gradient(var(--accent) ${scoreFill * 3.6}deg, var(--bg-3) 0deg)`,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: '136px',
                        height: '136px',
                        borderRadius: '50%',
                        background: 'var(--bg)',
                        display: 'grid',
                        placeItems: 'center',
                        textAlign: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '38px', fontWeight: 800, color: 'var(--text)' }}>{score}</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-3)' }}>
                          {enrichment?.intent_label || 'Unscored'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.7' }}>
                  {enrichment?.rationale || 'No rationale available yet.'}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '18px', padding: '20px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Enrichment
                </div>
                <div style={{ marginTop: '14px', display: 'grid', gap: '12px' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                    Revenue estimate: <span style={{ color: 'var(--text)' }}>{enrichment?.revenue_estimate || 'Unknown'}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                    Funding stage: <span style={{ color: 'var(--text)' }}>{enrichment?.funding_stage || 'Unknown'}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                    Employees: <span style={{ color: 'var(--text)' }}>{company.employee_count || 'Unknown'}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                    Recommended action: <span style={{ color: 'var(--text)' }}>{enrichment?.recommended_action || 'Watch'}</span>
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '18px', padding: '20px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Tech Stack
                </div>
                <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(company.tech_stack || []).length ? (
                    company.tech_stack.map(tech => (
                      <span
                        key={tech}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '10px',
                          background: 'var(--bg-3)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-2)',
                          fontSize: '12px',
                        }}
                      >
                        {tech}
                      </span>
                    ))
                  ) : (
                    <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>No tech stack detected yet.</div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '18px', padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Signal Timeline
                  </div>
                  <button
                    onClick={() => router.push('/signals')}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px' }}
                  >
                    View all
                  </button>
                </div>
                <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
                  {profile?.signals?.length ? (
                    profile.signals.map(signal => (
                      <div
                        key={signal.id}
                        style={{
                          padding: '12px',
                          borderRadius: '12px',
                          background: 'var(--bg-3)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{signal.headline}</div>
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-3)' }}>
                          {new Date(signal.created_at).toLocaleString()}
                        </div>
                        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-2)', lineHeight: '1.6' }}>
                          {signal.summary}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>No timeline events yet.</div>
                  )}
                </div>
              </div>

              <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '18px', padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Outreach Writer
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['conversational', 'formal', 'direct'].map(tone => (
                      <button
                        key={tone}
                        onClick={() => generateDraft(tone)}
                        disabled={drafting}
                        style={{
                          background: 'var(--bg-3)',
                          border: '1px solid var(--border)',
                          borderRadius: '999px',
                          padding: '6px 10px',
                          color: 'var(--text-2)',
                          fontSize: '11px',
                          cursor: drafting ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: '14px', display: 'grid', gap: '12px' }}>
                  {profile?.drafts?.length ? (
                    profile.drafts.map((draft, index) => (
                      <div
                        key={`${draft.subject}-${index}`}
                        style={{
                          padding: '14px',
                          borderRadius: '14px',
                          background: 'var(--bg-3)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{draft.subject}</div>
                        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--accent)' }}>{draft.tone}</div>
                        <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-2)', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                          {draft.body}
                        </div>
                        {draft.why_now ? (
                          <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-3)' }}>
                            Why now: {draft.why_now}
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>
                      No drafts yet. Generate one with a tone button above.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
