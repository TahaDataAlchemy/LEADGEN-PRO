'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/libs/supabase'
import Sidebar from '@/components/sidebar'
import type { Company } from '@/types'

function DashboardContent() {
  const [userId, setUserId] = useState<string | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [activeConvId, setActiveConvId] = useState('')
  const searchParams = useSearchParams()
  const router = useRouter()

  const [filters, setFilters] = useState({
    intent_label: searchParams.get('intent_label') || '',
    industry: searchParams.get('industry') || '',
    location: searchParams.get('location') || '',
    scraped_today: searchParams.get('scraped_today') === 'true',
    order_by: searchParams.get('order_by') || 'created_at'
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.push('/login')
      else setUserId(data.session.user.id)
    })
  }, [])

  useEffect(() => {
    if (userId) fetchCompanies()
  }, [userId, filters])

  const fetchCompanies = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('companies')
        .select(`
          id, name, domain, url, industry, location,
          employee_count, linkedin_url, tech_stack, created_at,
          enrichments(score, intent_label, rationale)
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      if (filters.industry) {
        query = query.ilike('industry', `%${filters.industry}%`)
      }
      if (filters.location) {
        query = query.ilike('location', `%${filters.location}%`)
      }
      if (filters.scraped_today) {
        const today = new Date().toISOString().split('T')[0]
        query = query.gte('created_at', `${today}T00:00:00+00:00`)
      }

      const { data, error } = await query
      if (error) throw error

      let results = data || []

      if (filters.intent_label) {
        results = results.filter(c =>
          c.enrichments &&
          c.enrichments.length > 0 &&
          c.enrichments[0].intent_label === filters.intent_label
        )
      }

      if (filters.order_by === 'score') {
        results.sort((a, b) => {
          const aScore = a.enrichments?.[0]?.score || 0
          const bScore = b.enrichments?.[0]?.score || 0
          return bScore - aScore
        })
      }

      setCompanies(results as Company[])
    } catch (err) {
      console.error('Failed to fetch companies', err)
    } finally {
      setLoading(false)
    }
  }

  const updateFilter = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const clearFilters = () => {
    setFilters({
      intent_label: '',
      industry: '',
      location: '',
      scraped_today: false,
      order_by: 'created_at'
    })
    router.push('/dashboard')
  }

  const getIntentColor = (intent: string | null) => {
    if (intent === 'Hot') return { bg: 'var(--red-dim)', color: 'var(--red)' }
    if (intent === 'Warm') return { bg: 'var(--amber-dim)', color: 'var(--amber)' }
    if (intent === 'Cold') return { bg: 'var(--bg-3)', color: 'var(--text-3)' }
    return { bg: 'var(--bg-3)', color: 'var(--text-3)' }
  }

  const getScoreColor = (score: number | null) => {
    if (!score) return 'var(--text-3)'
    if (score >= 80) return 'var(--green)'
    if (score >= 60) return 'var(--amber)'
    return 'var(--red)'
  }

  const hasActiveFilters = filters.intent_label || filters.industry ||
    filters.location || filters.scraped_today

  if (!userId) return null

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>
      <Sidebar
        userId={userId}
        activeConversationId={activeConvId}
        onSelectConversation={id => {
          setActiveConvId(id)
          router.push('/chat')
        }}
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
          <div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
              Lead Dashboard
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '1px' }}>
              {loading ? 'Loading...' : `${companies.length} companies`}
              {hasActiveFilters && ' · filtered'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
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
                  cursor: 'pointer'
                }}
              >
                Clear filters
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
                fontWeight: 500
              }}
            >
              + Find leads
            </button>
          </div>
        </div>

        {/* filter bar */}
        <div style={{
          padding: '10px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          alignItems: 'center',
          background: 'var(--bg-2)'
        }}>
          {['', 'Hot', 'Warm', 'Cold'].map(intent => (
            <button
              key={intent}
              onClick={() => updateFilter('intent_label', intent)}
              style={{
                padding: '4px 10px',
                borderRadius: '99px',
                border: '1px solid',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: 500,
                borderColor: filters.intent_label === intent ? 'var(--accent)' : 'var(--border)',
                background: filters.intent_label === intent ? 'var(--accent-dim)' : 'var(--bg-3)',
                color: filters.intent_label === intent ? 'var(--accent)' : 'var(--text-2)'
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
              color: filters.scraped_today ? 'var(--accent)' : 'var(--text-2)'
            }}
          >
            Today
          </button>

          <button
            onClick={() => updateFilter('order_by',
              filters.order_by === 'score' ? 'created_at' : 'score'
            )}
            style={{
              padding: '4px 10px',
              borderRadius: '99px',
              border: '1px solid',
              fontSize: '11px',
              cursor: 'pointer',
              borderColor: filters.order_by === 'score' ? 'var(--accent)' : 'var(--border)',
              background: filters.order_by === 'score' ? 'var(--accent-dim)' : 'var(--bg-3)',
              color: filters.order_by === 'score' ? 'var(--accent)' : 'var(--text-2)'
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
              width: '110px'
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
              width: '110px'
            }}
          />
        </div>

        {/* table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
          {loading ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '200px',
              color: 'var(--text-3)',
              fontSize: '13px'
            }}>
              Loading companies...
            </div>
          ) : companies.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '200px',
              gap: '10px'
            }}>
              <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                No companies found
              </div>
              <button
                onClick={() => router.push('/chat')}
                style={{
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '7px 14px',
                  color: 'white',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Find leads in chat
              </button>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Company', 'Industry', 'Location', 'Employees', 'Tech Stack', 'Score', 'Intent', 'Links'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px',
                      textAlign: 'left',
                      fontSize: '10px',
                      color: 'var(--text-3)',
                      fontWeight: 500,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      background: 'var(--bg-2)',
                      position: 'sticky',
                      top: 0
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {companies.map((company, i) => {
                  const enrichment = company.enrichments?.[0]
                  const intentColors = getIntentColor(enrichment?.intent_label || null)

                  return (
                    <tr
                      key={company.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'
                      }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                          {company.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
                          {company.domain}
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-2)' }}>
                        {company.industry || '—'}
                      </td>

                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-2)' }}>
                        {company.location || '—'}
                      </td>

                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-2)' }}>
                        {company.employee_count || '—'}
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {(company.tech_stack || []).slice(0, 3).map(tech => (
                            <span key={tech} style={{
                              fontSize: '10px',
                              background: 'var(--bg-3)',
                              color: 'var(--text-3)',
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
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
                        <span style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: getScoreColor(enrichment?.score || null)
                        }}>
                          {enrichment?.score || '—'}
                        </span>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        {enrichment?.intent_label ? (
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 500,
                            padding: '3px 8px',
                            borderRadius: '99px',
                            background: intentColors.bg,
                            color: intentColors.color
                          }}>
                            {enrichment.intent_label}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-3)', fontSize: '12px' }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {company.url && (
                            
                              <a href={company.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none' }}
                            >
                              Website ↗
                            </a>
                          )}
                          {company.linkedin_url && (
                            
                              <a href={company.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: '11px', color: 'var(--text-3)', textDecoration: 'none' }}
                            >
                              LinkedIn ↗
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

