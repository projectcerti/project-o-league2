import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Auth() {
  const [mode, setMode] = useState('welcome') // 'welcome' | 'login' | 'register'
  const [form, setForm] = useState({ full_name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  function update(field, value) { setForm(f => ({ ...f, [field]: value })); setError('') }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError(''); setMessage('')
    try {
      if (mode === 'register') {
        if (!form.full_name.trim()) { setError('Please enter your name.'); return }
        const { error } = await supabase.auth.signUp({
          email: form.email, password: form.password,
          options: { data: { full_name: form.full_name.trim() } },
        })
        if (error) throw error
        setMessage('Account created! Check your email to confirm, then sign in.')
        setMode('login')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
        if (error) throw error
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  // Welcome screen
  if (mode === 'welcome') {
    return (
      <div className="min-h-screen bg-bg flex flex-col relative overflow-hidden">
        {/* Subtle radial glow behind logo */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(200,255,0,0.07) 0%, transparent 70%)' }} />

        <div className="flex-1 flex flex-col items-center justify-between px-6 py-14 relative">

          {/* Logo + tagline */}
          <div className="flex flex-col items-center text-center mt-8">
            <img src="/logo.png" alt="Project Challenge" className="w-72 max-w-full object-contain mb-6" />
            <p className="text-muted font-dm text-sm uppercase tracking-widest">Season 1 · 6 Week Challenge</p>
          </div>

          {/* Stats row */}
          <div className="w-full max-w-xs">
            <div className="grid grid-cols-3 gap-3 mb-10">
              {[
                { val: '11', label: 'MAX PTS\nPER WEEK' },
                { val: '6', label: 'WEEKS\nCHALLENGE' },
                { val: '£50', label: 'FLAWLESS\nBONUS' },
              ].map(({ val, label }) => (
                <div key={val} className="bg-card border border-border rounded-2xl p-3 text-center">
                  <p className="font-kanit font-bold italic uppercase text-2xl text-lime leading-none">{val}</p>
                  <p className="text-muted font-dm text-xs mt-1 leading-tight whitespace-pre-line">{label}</p>
                </div>
              ))}
            </div>

            {/* CTA buttons */}
            <div className="space-y-3">
              <button onClick={() => setMode('register')}
                className="w-full bg-lime text-bg font-kanit font-bold italic text-lg py-4 rounded-2xl shadow-lime-glow active:scale-95 transition-all uppercase tracking-wide">
                JOIN THE CHALLENGE
              </button>
              <button onClick={() => setMode('login')}
                className="w-full bg-transparent border border-border text-white font-kanit font-semibold text-base py-4 rounded-2xl active:scale-95 transition-all uppercase tracking-wide hover:border-lime/30">
                SIGN IN
              </button>
            </div>

            <p className="text-center text-muted font-dm text-xs mt-6 leading-relaxed">
              Train · Recover · Eat well · Stay consistent
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Login / Register screen
  return (
    <div className="min-h-screen bg-bg flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-64 rounded-full opacity-60"
        style={{ background: 'radial-gradient(circle, rgba(200,255,0,0.05) 0%, transparent 70%)' }} />

      <div className="flex-1 flex flex-col px-6 py-10 relative">

        {/* Back button */}
        <button onClick={() => { setMode('welcome'); setError('') }}
          className="flex items-center gap-2 text-muted hover:text-white transition-colors font-dm text-sm mb-10 w-fit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          BACK
        </button>

        {/* Logo small */}
        <div className="flex justify-center mb-8">
          <img src="/logo.png" alt="Project Challenge" className="w-48 max-w-full object-contain" />
        </div>

        {/* Title */}
        <div className="mb-8">
          <h1 className="font-kanit font-bold italic text-3xl text-white uppercase">
            {mode === 'login' ? 'WELCOME\nBACK' : 'CREATE\nACCOUNT'}
          </h1>
          <p className="text-muted font-dm text-sm mt-2">
            {mode === 'login' ? 'Sign in to track your progress' : 'Join the 6 week challenge'}
          </p>
        </div>

        {/* Messages */}
        {message && (
          <div className="mb-4 bg-lime/10 border border-lime/20 text-lime text-sm rounded-2xl px-4 py-3 font-dm">{message}</div>
        )}
        {error && (
          <div className="mb-4 bg-red-900/20 border border-red-800/40 text-red-400 text-sm rounded-2xl px-4 py-3 font-dm">{error}</div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3 flex-1">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-dm text-muted uppercase tracking-widest mb-1.5">FULL NAME</label>
              <input type="text" value={form.full_name} onChange={e => update('full_name', e.target.value)}
                placeholder="Your name" required autoComplete="name"
                className="w-full bg-card border border-border rounded-2xl px-4 py-3.5 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 transition-colors font-dm" />
            </div>
          )}
          <div>
            <label className="block text-xs font-dm text-muted uppercase tracking-widest mb-1.5">EMAIL</label>
            <input type="email" value={form.email} onChange={e => update('email', e.target.value)}
              placeholder="you@email.com" required autoComplete="email"
              className="w-full bg-card border border-border rounded-2xl px-4 py-3.5 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 transition-colors font-dm" />
          </div>
          <div>
            <label className="block text-xs font-dm text-muted uppercase tracking-widest mb-1.5">PASSWORD</label>
            <input type="password" value={form.password} onChange={e => update('password', e.target.value)}
              placeholder="••••••••" required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full bg-card border border-border rounded-2xl px-4 py-3.5 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 transition-colors font-dm" />
          </div>

          <div className="pt-2">
            <button type="submit" disabled={loading}
              className="w-full bg-lime text-bg font-kanit font-bold italic text-lg py-4 rounded-2xl shadow-lime-glow disabled:opacity-50 active:scale-95 transition-all uppercase">
              {loading ? '...' : mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
            </button>
          </div>
        </form>

        <p className="text-center text-sm text-muted font-dm mt-6">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
            className="text-lime font-medium hover:underline uppercase text-xs tracking-wide">
            {mode === 'login' ? 'SIGN UP' : 'SIGN IN'}
          </button>
        </p>
      </div>
    </div>
  )
}
