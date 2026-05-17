'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '@/components/sidebar'
import { api } from '@/libs/api'
import { supabase } from '@/libs/supabase'
import type { Company } from '@/types'

interface PipelineStats {
  avg_score: number
  hot: number
  warm: number
  cold: number
  unscored: number
  total: number
}

function DashboardContent() {
  const [userId, setUserId] = useState<string | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<PipelineStats | null>(null)
  const [scoring, setScoring] = useState(false)
  const [scoreProgress, setScoreProgress] = useState<{ scored: number; total: number } | null>(null)
  const [expandedRationale, setExpandedRationale] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pageSize = 50

  const [filters, setFilters] = useState({
    intent_label: searchParams.get('intent_label') || '',
    industry: searchParams.get('industry') || '',
    location: searchParams.get('location') || '',
    scraped_today: searchParams.get('scraped_today') === 'true',
      order_by: searchParams.get('order_by') || 'created_at',
    })

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
        const [companiesRes, statsRes] = await Promise.all([
          api.get('/companies', {
            params: {
              page,
              page_size: pageSize,
              ...filters,
            },
          }),
          api.get('/scoring/stats'),
        ])
        setCompanies(companiesRes.data.items || [])
        setTotal(companiesRes.data.total || 0)
        setStats(statsRes.data)
      } catch (err) {
        console.error('Failed to load dashboard data', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [userId, filters, page])

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
  }, [])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total])

  const handleExport = async () => {
    try {
      const res = await api.get('/companies/export')
      const blob = new Blob([res.data.content], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = res.data.filename || 'companies.csv'
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export companies', err)
    }
  }

  const handleScoreAll = async () => {
    setScoring(true)
    try {
      await api.post('/scoring/all')
      pollRef.current = setInterval(async () => {
        try {
          const res = await api.get('/scoring/status')
          const { scored, total } = res.data
          setScoreProgress({ scored, total })
          if (scored >= total) {
            if (pollRef.current) clearInterval(pollRef.current)
            setScoring(false)
            setScoreProgress(null)
            void api
              .get('/companies', {
                params: {
                  page,
                  page_size: pageSize,
                  ...filters,
                },
              })
              .then(res => {
                setCompanies(res.data.items || [])
                setTotal(res.data.total || 0)
              })
            void api.get('/scoring/stats').then(res => setStats(res.data))
          }
        } catch {
          setScoring(false)
        }
      }, 3000)
    } catch {
      setScoring(false)
    }
  }

  const handleScoreSingle = async (companyId: string) => {
    try {
      const res = await api.post(`/scoring/company/${companyId}`)
      if (res.data.score !== undefined) {
        setCompanies(prev =>
          prev.map(company =>
            company.id !== companyId
              ? company
              : {
                  ...company,
                  enrichments: [
                    {
                      score: res.data.score,
                      intent_label: res.data.intent_label,
                      rationale: res.data.rationale,
                      recommended_action: res.data.recommended_action,
                    },
                  ],
                }
          )
        )
        void api.get('/scoring/stats').then(res => setStats(res.data))
      }
    } catch (err) {
      console.error('Failed to score company', err)
    }
  }

  const updateFilter = (key: string, value: string | boolean) => {
    setPage(1)
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const clearFilters = () => {
    setFilters({
      intent_label: '',
      industry: '',
      location: '',
      scraped_today: false,
      order_by: 'created_at',
    })
    router.push('/dashboard')
  }

  const getIntentColor = (intent: string | null) => {
    if (intent === 'Hot') return { bg: 'var(--red-dim)', color: 'var(--red)' }
    if (intent === 'Warm') return { bg: 'var(--amber-dim)', color: 'var(--amber)' }
    return { bg: 'var(--bg-3)', color: 'var(--text-3)' }
  }

  const getScoreColor = (score: number | null) => {
    if (!score) return 'var(--text-3)'
    if (score >= 80) return 'var(--green)'
    if (score >= 60) return 'var(--amber)'
    return 'var(--red)'
  }

  const hasActiveFilters = Boolean(
    filters.intent_label || filters.industry || filters.location || filters.scraped_today
  )

  if (!userId) return null

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>
      <Sidebar
        userId={userId}
        activeConversationId=""
        onSelectConversation={() => router.push('/chat')}
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
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
              Lead Dashboard
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '1px' }}>
              {loading ? 'Loading...' : `${total} companies`}
              {hasActiveFilters && ' filtered'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              onClick={handleExport}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '5px 10px',
                color: 'var(--text-2)',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Export CSV
            </button>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  color: 'var(--text-2)',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Clear filters
              </button>
            )}
            {stats && stats.unscored > 0 && (
              <button
                onClick={handleScoreAll}
                disabled={scoring}
                style={{
                  background: 'var(--green-dim)',
                  border: '1px solid #1a4a2a',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  color: 'var(--green)',
                  fontSize: '11px',
                  cursor: scoring ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                }}
              >
                {scoring ? 'Scoring...' : `Score all (${stats.unscored})`}
              </button>
            )}
            <button
              onClick={() => router.push('/chat')}
              style={{
                background: 'var(--accent)',
                border: 'none',
                borderRadius: '6px',
                padding: '5px 12px',
                color: 'white',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              + Find leads
            </button>
          </div>
        </div>

        {scoring && scoreProgress && (
          <div
            style={{
              background: '#0a1a15',
              borderBottom: '1px solid #1a3a2a',
              padding: '8px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '11px',
              color: 'var(--green)',
            }}
          >
            <span>Scoring in progress</span>
            <div style={{ flex: 1, height: '3px', background: '#1a3a2a', borderRadius: '2px' }}>
              <div
                style={{
                  height: '100%',
                  background: 'var(--green)',
                  borderRadius: '2px',
                  width: `${(scoreProgress.scored / Math.max(scoreProgress.total, 1)) * 100}%`,
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
            <span style={{ color: 'var(--text-3)' }}>
              {scoreProgress.scored} / {scoreProgress.total}
            </span>
          </div>
        )}

        {stats && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '8px',
              padding: '10px 20px',
              background: 'var(--bg-2)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            {[
              {
                label: 'Avg score',
                value: stats.avg_score || '-',
                color:
                  stats.avg_score >= 70
                    ? 'var(--green)'
                    : stats.avg_score >= 50
                      ? 'var(--amber)'
                      : 'var(--text)',
              },
              { label: 'Hot', value: stats.hot, color: 'var(--red)' },
              { label: 'Warm', value: stats.warm, color: 'var(--amber)' },
              { label: 'Cold', value: stats.cold, color: 'var(--text-3)' },
              { label: 'Unscored', value: stats.unscored, color: 'var(--text-3)' },
            ].map(item => (
              <div
                key={item.label}
                style={{ background: 'var(--bg-3)', borderRadius: '6px', padding: '8px 10px' }}
              >
                <div
                  style={{
                    fontSize: '9px',
                    color: 'var(--text-3)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: item.color,
                    marginTop: '2px',
                  }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            padding: '10px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
            alignItems: 'center',
            background: 'var(--bg-2)',
          }}
        >
          {['', 'Hot', 'Warm', 'Cold'].map(intent => (
            <button
              key={intent || 'all'}
              onClick={() => updateFilter('intent_label', intent)}
              style={{
                padding: '4px 10px',
                borderRadius: '99px',
                border: '1px solid',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: 600,
                borderColor: filters.intent_label === intent ? 'var(--accent)' : 'var(--border)',
                background: filters.intent_label === intent ? 'var(--accent-dim)' : 'var(--bg-3)',
                color: filters.intent_label === intent ? 'var(--accent)' : 'var(--text-2)',
              }}
            >
              {intent || 'All'}
            </button>
          ))}
          <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />
          <button
            onClick={() => updateFilter('scraped_today', !filters.scraped_today)}
            style={{
              padding: '4px 10px',
              borderRadius: '99px',
              border: '1px solid',
              fontSize: '11px',
              cursor: 'pointer',
              borderColor: filters.scraped_today ? 'var(--accent)' : 'var(--border)',
              background: filters.scraped_today ? 'var(--accent-dim)' : 'var(--bg-3)',
              color: filters.scraped_today ? 'var(--accent)' : 'var(--text-2)',
            }}
          >
            Today
          </button>
          <button
            onClick={() =>
              updateFilter('order_by', filters.order_by === 'score' ? 'created_at' : 'score')
            }
            style={{
              padding: '4px 10px',
              borderRadius: '99px',
              border: '1px solid',
              fontSize: '11px',
              cursor: 'pointer',
              borderColor: filters.order_by === 'score' ? 'var(--accent)' : 'var(--border)',
              background: filters.order_by === 'score' ? 'var(--accent-dim)' : 'var(--bg-3)',
              color: filters.order_by === 'score' ? 'var(--accent)' : 'var(--text-2)',
            }}
          >
            Sort by score
          </button>
          <input
            placeholder="Industry..."
            value={filters.industry}
            onChange={e => updateFilter('industry', e.target.value)}
            style={{
              background: 'var(--bg-3)',
              border: '1px solid var(--border)',
              borderRadius: '99px',
              padding: '4px 12px',
              color: 'var(--text)',
              fontSize: '11px',
              outline: 'none',
              width: '120px',
            }}
          />
          <input
            placeholder="Location..."
            value={filters.location}
            onChange={e => updateFilter('location', e.target.value)}
            style={{
              background: 'var(--bg-3)',
              border: '1px solid var(--border)',
              borderRadius: '99px',
              padding: '4px 12px',
              color: 'var(--text)',
              fontSize: '11px',
              outline: 'none',
              width: '120px',
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '200px',
                color: 'var(--text-3)',
                fontSize: '13px',
              }}
            >
              Loading companies...
            </div>
          ) : companies.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '200px',
                gap: '10px',
              }}
            >
              <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>No companies found</div>
              <button
                onClick={() => router.push('/chat')}
                style={{
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '7px 14px',
                  color: 'white',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Find leads in chat
              </button>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Company', 'Industry', 'Location', 'Employees', 'Tech Stack', 'Score', 'Intent', 'Rationale', 'Action', 'Links'].map(header => (
                    <th
                      key={header}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        fontSize: '10px',
                        color: 'var(--text-3)',
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        background: 'var(--bg-2)',
                        position: 'sticky',
                        top: 0,
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {companies.map((company, index) => {
                  const enrichment = company.enrichments?.[0]
                  const intentColors = getIntentColor(enrichment?.intent_label || null)
                  const isUnscored = !enrichment?.score

                  return (
                    <tr
                      key={company.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                      }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <button
                          onClick={() => router.push(`/company/${company.id}`)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                            {company.name}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
                            {company.domain}
                          </div>
                        </button>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-2)' }}>
                        {company.industry || '-'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-2)' }}>
                        {company.location || '-'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-2)' }}>
                        {company.employee_count || '-'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {(company.tech_stack || []).slice(0, 3).map(tech => (
                            <span
                              key={tech}
                              style={{
                                fontSize: '10px',
                                background: 'var(--bg-3)',
                                color: 'var(--text-3)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                              }}
                            >
                              {tech}
                            </span>
                          ))}
                          {(company.tech_stack || []).length > 3 && (
                            <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>
                              +{company.tech_stack.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {isUnscored ? (
                          <button
                            onClick={() => handleScoreSingle(company.id)}
                            style={{
                              fontSize: '10px',
                              background: 'var(--bg-3)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px',
                              padding: '3px 8px',
                              color: 'var(--text-3)',
                              cursor: 'pointer',
                            }}
                          >
                            Score
                          </button>
                        ) : (
                          <span
                            style={{
                              fontSize: '13px',
                              fontWeight: 700,
                              color: getScoreColor(enrichment?.score || null),
                            }}
                          >
                            {enrichment?.score}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {enrichment?.intent_label ? (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '3px 8px',
                              borderRadius: '99px',
                              background: intentColors.bg,
                              color: intentColors.color,
                            }}
                          >
                            {enrichment.intent_label}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-3)', fontSize: '12px' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', maxWidth: '220px' }}>
                        {enrichment?.rationale ? (
                          <div>
                            <div
                              style={{
                                fontSize: '11px',
                                color: 'var(--text-3)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: expandedRationale === company.id ? 'normal' : 'nowrap',
                              }}
                            >
                              {enrichment.rationale}
                            </div>
                            <button
                              onClick={() =>
                                setExpandedRationale(expandedRationale === company.id ? null : company.id)
                              }
                              style={{
                                fontSize: '10px',
                                color: 'var(--accent)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '2px 0',
                                marginTop: '2px',
                              }}
                            >
                              {expandedRationale === company.id ? 'less' : 'more'}
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-3)', fontSize: '11px' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {enrichment?.recommended_action ? (
                          <span
                            style={{
                              fontSize: '10px',
                              background: 'var(--accent-dim)',
                              color: 'var(--accent)',
                              padding: '3px 8px',
                              borderRadius: '4px',
                            }}
                          >
                            {enrichment.recommended_action}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-3)', fontSize: '11px' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {company.url && (
                            <a
                              href={company.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none' }}
                            >
                              Web
                            </a>
                          )}
                          {company.linkedin_url && (
                            <a
                              href={company.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: '11px', color: 'var(--text-3)', textDecoration: 'none' }}
                            >
                              LinkedIn
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-2)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
            Page {page} of {totalPages}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              disabled={page <= 1}
              style={{
                background: 'var(--bg-3)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '6px 10px',
                color: page <= 1 ? 'var(--text-3)' : 'var(--text-2)',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Previous
            </button>
            <button
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              style={{
                background: 'var(--bg-3)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '6px 10px',
                color: page >= totalPages ? 'var(--text-3)' : 'var(--text-2)',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div style={{ color: 'var(--text-2)', padding: '40px' }}>Loading...</div>}>
      <DashboardContent />
    </Suspense>
  )
}
