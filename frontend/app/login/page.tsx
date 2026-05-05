'use client'
import { useState } from 'react'
import { supabase } from '@/libs/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const router = useRouter()

  const handleSubmit = async () => {
    if (!email || !password) return
    setLoading(true)
    setMessage('')

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(error.message)
      else router.push('/chat')
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setMessage(error.message)
      else setMessage('Check your email to confirm your account.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '380px',
      }}>
        {/* logo */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{
            fontSize: '11px',
            letterSpacing: '0.15em',
            color: 'var(--accent)',
            textTransform: 'uppercase',
            marginBottom: '8px',
            fontWeight: 600
          }}>
            LeadGen Pro
          </div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 600,
            color: 'var(--text)',
            margin: 0
          }}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h1>
          <p style={{
            color: 'var(--text-2)',
            fontSize: '14px',
            marginTop: '6px'
          }}>
            AI-powered lead intelligence platform
          </p>
        </div>

        {/* form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            style={{
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '11px 14px',
              color: 'var(--text)',
              fontSize: '14px',
              outline: 'none',
              width: '100%'
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            style={{
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '11px 14px',
              color: 'var(--text)',
              fontSize: '14px',
              outline: 'none',
              width: '100%'
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '11px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              marginTop: '4px'
            }}
          >
            {loading ? 'Loading...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </div>

        {message && (
          <p style={{
            marginTop: '12px',
            fontSize: '13px',
            color: message.includes('Check') ? 'var(--green)' : 'var(--red)',
            textAlign: 'center'
          }}>
            {message}
          </p>
        )}

        <p style={{
          marginTop: '20px',
          fontSize: '13px',
          color: 'var(--text-2)',
          textAlign: 'center'
        }}>
          {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
          <span
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            style={{ color: 'var(--accent)', cursor: 'pointer' }}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </span>
        </p>
      </div>
    </div>
  )
}