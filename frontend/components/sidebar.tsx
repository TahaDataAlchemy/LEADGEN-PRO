'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/libs/supabase'
import { api } from '@/libs/api'
import type { Conversation } from '@/types'

interface SidebarProps {
  userId: string
  activeConversationId?: string
  onSelectConversation: (id: string) => void
}

export default function Sidebar({
  userId,
  activeConversationId,
  onSelectConversation
}: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    fetchConversations()
  }, [userId])

  const fetchConversations = async () => {
    try {
      const res = await api.get(`/conversations/user/${userId}`)
      setConversations(res.data)
    } catch (err) {
      console.error('Failed to fetch conversations', err)
    } finally {
      setLoading(false)
    }
  }

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
      setConversations(prev => prev.filter(c => c.id !== convId))
      if (activeConversationId === convId) {
        onSelectConversation('')
      }
    } catch (err) {
      console.error('Failed to delete conversation', err)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navItems = [
    { label: 'Chat', path: '/chat', icon: '◎' },
    { label: 'Dashboard', path: '/dashboard', icon: '▤' },
  ]

  return (
    <div style={{
      width: '220px',
      background: 'var(--bg-2)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      flexShrink: 0
    }}>
      {/* logo */}
      <div style={{
        padding: '16px 14px 12px',
        borderBottom: '1px solid var(--border)'
      }}>
        <div style={{
          fontSize: '11px',
          letterSpacing: '0.12em',
          color: 'var(--accent)',
          textTransform: 'uppercase',
          fontWeight: 600
        }}>
          LeadGen Pro
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
          AI lead intelligence
        </div>
      </div>

      {/* nav */}
      <div style={{ padding: '8px 8px 0' }}>
        {navItems.map(item => (
          <div
            key={item.path}
            onClick={() => router.push(item.path)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              color: pathname === item.path ? 'var(--text)' : 'var(--text-2)',
              background: pathname === item.path ? 'var(--bg-3)' : 'transparent',
              marginBottom: '2px'
            }}
          >
            <span style={{ fontSize: '12px' }}>{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>

      {/* new chat button */}
      <div style={{ padding: '8px' }}>
        <button
          onClick={createNewConversation}
          style={{
            width: '100%',
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent)',
            borderRadius: '6px',
            padding: '7px',
            color: 'var(--accent)',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: 500
          }}
        >
          + New chat
        </button>
      </div>

      {/* conversations list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '4px 8px'
      }}>
        <div style={{
          fontSize: '10px',
          color: 'var(--text-3)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '6px 6px 4px'
        }}>
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
                padding: '7px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: activeConversationId === conv.id
                  ? 'var(--bg-3)'
                  : 'transparent',
                marginBottom: '1px',
              }}
            >
              <span style={{
                fontSize: '12px',
                color: activeConversationId === conv.id
                  ? 'var(--text)'
                  : 'var(--text-2)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1
              }}>
                {conv.title}
              </span>
              <span
                onClick={e => deleteConversation(e, conv.id)}
                style={{
                  fontSize: '11px',
                  color: 'var(--text-3)',
                  cursor: 'pointer',
                  padding: '0 2px',
                  flexShrink: 0
                }}
              >
                ×
              </span>
            </div>
          ))
        )}
      </div>

      {/* bottom — sign out */}
      <div style={{
        padding: '10px 8px',
        borderTop: '1px solid var(--border)'
      }}>
        <div
          onClick={handleSignOut}
          style={{
            fontSize: '12px',
            color: 'var(--text-3)',
            cursor: 'pointer',
            padding: '6px 8px',
            borderRadius: '6px'
          }}
        >
          Sign out
        </div>
      </div>
    </div>
  )
}