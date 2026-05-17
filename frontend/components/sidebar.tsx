'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { api } from '@/libs/api'
import { supabase } from '@/libs/supabase'
import type { Conversation } from '@/types'

interface SidebarProps {
  userId: string
  activeConversationId?: string
  onSelectConversation: (id: string) => void
}

export default function Sidebar({
  userId,
  activeConversationId,
  onSelectConversation,
}: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadSignals, setUnreadSignals] = useState(0)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    void (async () => {
      try {
        const [conversationsRes, unreadRes] = await Promise.all([
          api.get(`/conversations/user/${userId}`),
          api.get('/signals/unread-count', { params: { user_id: userId } }),
        ])
        setConversations(conversationsRes.data)
        setUnreadSignals(unreadRes.data.count || 0)
      } catch (err) {
        console.error('Failed to load sidebar data', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [userId])

  useEffect(() => {
    const timer = setInterval(() => {
      void (async () => {
        try {
          const res = await api.get('/signals/unread-count', { params: { user_id: userId } })
          setUnreadSignals(res.data.count || 0)
        } catch {
          setUnreadSignals(0)
        }
      })()
    }, 20000)
    return () => clearInterval(timer)
  }, [userId])

  const createNewConversation = async () => {
    try {
      const res = await api.post('/conversations/new', { user_id: userId })
      const newConv = res.data
      setConversations(prev => [newConv, ...prev])
      onSelectConversation(newConv.id)
      router.push('/chat')
    } catch (err) {
      console.error('Failed to create conversation', err)
    }
  }

  const deleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation()
    try {
      await api.delete(`/conversations/${convId}`)
      setConversations(prev => prev.filter(conv => conv.id !== convId))
      if (activeConversationId === convId) onSelectConversation('')
    } catch (err) {
      console.error('Failed to delete conversation', err)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navItems = [
    { label: 'Chat', path: '/chat', icon: 'O' },
    { label: 'Dashboard', path: '/dashboard', icon: '[]' },
    { label: 'Signals', path: '/signals', icon: '!!', badge: unreadSignals },
  ]

  return (
    <div
      style={{
        width: '240px',
        background: 'var(--bg-2)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        flexShrink: 0,
      }}
    >
      <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid var(--border)' }}>
        <div
          style={{
            fontSize: '11px',
            letterSpacing: '0.12em',
            color: 'var(--accent)',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          LeadGen Pro
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
          live lead intelligence
        </div>
      </div>

      <div style={{ padding: '8px 8px 0' }}>
        {navItems.map(item => (
          <div
            key={item.path}
            onClick={() => router.push(item.path)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '8px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              color: pathname.startsWith(item.path) ? 'var(--text)' : 'var(--text-2)',
              background: pathname.startsWith(item.path) ? 'var(--bg-3)' : 'transparent',
              marginBottom: '4px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', width: '20px', color: 'var(--text-3)' }}>
                {item.icon}
              </span>
              {item.label}
            </div>
            {item.badge ? (
              <span
                style={{
                  minWidth: '20px',
                  padding: '2px 6px',
                  borderRadius: '999px',
                  background: 'var(--red-dim)',
                  color: 'var(--red)',
                  fontSize: '10px',
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              >
                {item.badge}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <div style={{ padding: '8px' }}>
        <button
          onClick={createNewConversation}
          style={{
            width: '100%',
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent)',
            borderRadius: '8px',
            padding: '8px',
            color: 'var(--accent)',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          + New chat
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
        <div
          style={{
            fontSize: '10px',
            color: 'var(--text-3)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '6px 6px 4px',
          }}
        >
          Recent
        </div>

        {loading ? (
          <div style={{ fontSize: '12px', color: 'var(--text-3)', padding: '8px 6px' }}>
            Loading...
          </div>
        ) : conversations.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-3)', padding: '8px 6px' }}>
            No conversations yet
          </div>
        ) : (
          conversations.map(conv => (
            <div
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '8px',
                borderRadius: '8px',
                cursor: 'pointer',
                background: activeConversationId === conv.id ? 'var(--bg-3)' : 'transparent',
                marginBottom: '2px',
              }}
            >
              <span
                style={{
                  fontSize: '12px',
                  color: activeConversationId === conv.id ? 'var(--text)' : 'var(--text-2)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {conv.title}
              </span>
              <span
                onClick={e => deleteConversation(e, conv.id)}
                style={{
                  fontSize: '12px',
                  color: 'var(--text-3)',
                  cursor: 'pointer',
                  padding: '0 2px',
                  flexShrink: 0,
                }}
              >
                x
              </span>
            </div>
          ))
        )}
      </div>

      <div style={{ padding: '10px 8px', borderTop: '1px solid var(--border)' }}>
        <div
          onClick={handleSignOut}
          style={{
            fontSize: '12px',
            color: 'var(--text-3)',
            cursor: 'pointer',
            padding: '6px 8px',
            borderRadius: '6px',
          }}
        >
          Sign out
        </div>
      </div>
    </div>
  )
}
