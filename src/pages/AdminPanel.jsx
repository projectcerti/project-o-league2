import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useApp } from '../App'
import { getCurrentWeek, getWeekLabel, calculatePoints, TOTAL_WEEKS } from '../utils/points'
import { Avatar } from './Feed'

export default function AdminPanel() {
  const { profile } = useApp()
  const [myEmail, setMyEmail] = useState('')
  const [tab, setTab] = useState('metrics')
  const [users, setUsers] = useState([])
  const [sessions, setSessions] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [feedback, setFeedback] = useState([]) // all feedback across all users
  const [loading, setLoading] = useState(true)
  const [initialLoad, setInitialLoad] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState('')
  const [grantEmail, setGrantEmail] = useState('')
  const [granting, setGranting] = useState(false)
  const [grantMsg, setGrantMsg] = useState('')
  const currentWeek = getCurrentWeek()

  const [isOwner, setIsOwner] = useState(false)
  const [overrideModal, setOverrideModal] = useState(null) // { userId, userName, weekNum, currentPts }
  const [overridePts, setOverridePts] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [savingOverride, setSavingOverride] = useState(false)

  useEffect(() => {
    async function checkRole() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      if (data?.role === 'owner') setIsOwner(true)
      setMyEmail(session?.user?.email?.toLowerCase() || '')
    }
    checkRole()
  }, [])

  useEffect(() => { loadData() }, [tab])

  async function loadData() {
    const [{ data: allUsers }, { data: allSubs }, { data: allSessions }, { data: allFeedback }] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('weekly_submissions').select('*'),
      supabase.from('sessions').select('*'),
      supabase.from('admin_feedback').select('*, profiles!admin_feedback_user_id_fkey(full_name, avatar_url, username)').order('created_at', { ascending: false }),
    ])
    setUsers(allUsers || [])
    setSubmissions(allSubs || [])
    setSessions(allSessions || [])
    setFeedback(allFeedback || [])
    setLoading(false)
    setInitialLoad(false)
  }

  async function grantAdmin() {
    if (!grantEmail.trim()) return
    setGranting(true)
    setGrantMsg('')
    const { data } = await supabase.from('profiles').select('id, full_name').eq('email', grantEmail.trim().toLowerCase()).maybeSingle()
    if (!data) { setGrantMsg('User not found. Make sure they have signed up.'); setGranting(false); return }
    await supabase.from('profiles').update({ is_admin: true }).eq('id', data.id)
    setGrantMsg(`✓ ${data.full_name} is now an admin.`)
    setGrantEmail('')
    setGranting(false)
    loadData()
  }

  async function revokeAdmin(userId, name) {
    await supabase.from('profiles').update({ is_admin: false }).eq('id', userId)
    loadData()
  }

  async function sendFeedback() {
    if (!selectedUser || !feedbackText.trim()) return
    setSavingFeedback(true)
    const { error } = await supabase.from('admin_feedback').insert({
      admin_id: profile.id,
      user_id: selectedUser.id,
      message: feedbackText.trim(),
    })
    if (!error) {
      setFeedbackMsg(`✓ Feedback sent to ${selectedUser.full_name}`)
      setFeedbackText('')
      setTimeout(() => setFeedbackMsg(''), 3000)
      loadData()
    }
    setSavingFeedback(false)
  }

  async function deleteFeedback(id) {
    await supabase.from('admin_feedback').delete().eq('id', id)
    loadData()
  }

  // Build metrics per user
  function getUserMetrics(userId) {
    const userSubs = submissions.filter(s => s.user_id === userId)
    const totalPts = userSubs.reduce((a, s) => a + (s.admin_override_points ?? s.calculated_points ?? 0), 0)
    const weeksSubmitted = userSubs.length
    const currentWeekSub = userSubs.find(s => s.week_number === currentWeek)
    const currentWeekPts = currentWeekSub ? (currentWeekSub.admin_override_points ?? currentWeekSub.calculated_points ?? 0) : null
    const avgPts = weeksSubmitted > 0 ? (totalPts / weeksSubmitted).toFixed(1) : 0
    const userSessions = sessions.filter(s => s.user_id === userId && s.week_number === currentWeek)
    const workouts = userSessions.filter(s => s.session_type === 'workout' && s.duration_minutes >= 30).length
    const recovery = userSessions.filter(s => s.session_type === 'recovery' && s.duration_minutes >= 20).length
    const nutrition = userSessions.filter(s => s.session_type === 'nutrition').length
    const missedWeeks = currentWeek - 1 - weeksSubmitted
    const status = weeksSubmitted === 0 ? 'none' :
      missedWeeks > 1 ? 'behind' :
      currentWeekPts === null && currentWeek > 1 ? 'needs-log' :
      totalPts >= (currentWeek * 8) ? 'great' : 'ok'
    return { totalPts, weeksSubmitted, currentWeekPts, avgPts, workouts, recovery, nutrition, missedWeeks, status }
  }

  const statusConfig = {
    great:     { label: '🔥 On fire',      bg: 'bg-lime/10 border-lime/30',     text: 'text-lime' },
    ok:        { label: '✓ On track',      bg: 'bg-blue-900/20 border-blue-700/30', text: 'text-blue-300' },
    'needs-log': { label: '⏰ Needs log',  bg: 'bg-yellow-900/20 border-yellow-700/30', text: 'text-yellow-400' },
    behind:    { label: '⚠️ Falling behind', bg: 'bg-red-900/20 border-red-700/30', text: 'text-red-400' },
    none:      { label: '👋 Not started', bg: 'bg-soft border-border',          text: 'text-muted' },
  }

  if (initialLoad && loading) return (
    <div className="max-w-3xl mx-auto space-y-3 pt-2 animate-pulse">
      {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-card rounded-3xl" />)}
    </div>
  )

  const admins = users.filter(u => u.is_admin)
  const metricsUsers = [...users].sort((a, b) => {
    const sa = getUserMetrics(a.id), sb = getUserMetrics(b.id)
    return sb.totalPts - sa.totalPts
  })

  return (
    <div className="max-w-3xl mx-auto space-y-4 pt-1 fade-up">
      <div className="py-1">
        <h1 className="font-kanit font-bold italic uppercase text-2xl text-white">ADMIN PANEL</h1>
        <p className="text-muted text-xs font-dm">Week {currentWeek} of {TOTAL_WEEKS}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { id: 'metrics',  label: '📊 Metrics' },
          { id: 'feedback', label: '💬 Feedback' },
          { id: 'logs',     label: '📋 Logs' },
          ...(isOwner ? [{ id: 'access', label: '🔑 Access' }] : []),
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-2xl text-sm font-kanit font-semibold uppercase whitespace-nowrap transition-all flex-shrink-0 ${
              tab === t.id ? 'bg-lime text-bg' : 'bg-card border border-border text-muted hover:text-white'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* ── METRICS TAB ── */}
      {tab === 'metrics' && (
        <div className="space-y-3">
          <p className="text-xs text-muted font-dm">Sorted by total points · Week {currentWeek}</p>
          {metricsUsers.map(u => {
            const m = getUserMetrics(u.id)
            const sc = statusConfig[m.status]
            const userFeedbackCount = feedback.filter(f => f.user_id === u.id).length
            return (
              <div key={u.id} className={`border rounded-3xl p-4 ${sc.bg}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.full_name} avatarUrl={u.avatar_url} size="md" />
                    <div>
                      <p className="font-kanit font-semibold text-white text-sm">{u.full_name}</p>
                      {u.username && <p className="text-muted text-xs font-dm">@{u.username}</p>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-xs font-kanit font-semibold px-2 py-1 rounded-full border ${sc.bg} ${sc.text}`}>{sc.label}</span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    { label: 'Total pts', value: m.totalPts },
                    { label: 'Avg/week', value: m.avgPts },
                    { label: 'Weeks logged', value: `${m.weeksSubmitted}/${currentWeek > 1 ? currentWeek - 1 : 0}` },
                    { label: 'This week', value: m.currentWeekPts !== null ? m.currentWeekPts : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-bg/40 rounded-2xl p-2 text-center">
                      <p className="text-xs text-muted font-dm">{label}</p>
                      <p className="font-kanit font-semibold text-white text-base">{value}</p>
                    </div>
                  ))}
                </div>

                {/* This week's activity */}
                <div className="flex gap-2 mb-3">
                  {[
                    { emoji: '💪', label: 'Workouts', val: m.workouts },
                    { emoji: '🧘', label: 'Recovery', val: m.recovery },
                    { emoji: '🥗', label: 'Nutrition', val: m.nutrition },
                  ].map(({ emoji, label, val }) => (
                    <div key={label} className={`flex-1 rounded-2xl px-2 py-1.5 text-center border ${val > 0 ? 'border-lime/20 bg-lime/5' : 'border-border bg-bg/20'}`}>
                      <p className="text-base">{emoji}</p>
                      <p className="text-xs text-muted font-dm">{label}</p>
                      <p className={`font-kanit font-semibold text-sm ${val > 0 ? 'text-lime' : 'text-border'}`}>{val}</p>
                    </div>
                  ))}
                </div>

                {m.missedWeeks > 0 && (
                  <p className="text-xs text-red-400 font-dm mb-2">⚠️ Missed {m.missedWeeks} week{m.missedWeeks !== 1 ? 's' : ''}</p>
                )}

                <div className="flex items-center gap-3">
                  <button onClick={() => { setSelectedUser(u); setTab('feedback') }}
                    className="text-xs text-lime font-dm hover:underline">
                    {userFeedbackCount > 0 ? `💬 ${userFeedbackCount} feedback note${userFeedbackCount !== 1 ? 's' : ''} · Send more →` : '💬 Send feedback →'}
                  </button>
                  <button onClick={() => {
                    setOverrideModal({ userId: u.id, userName: u.full_name, weekNum: currentWeek, currentPts: m.currentWeekPts ?? 0 })
                    setOverridePts(String(m.currentWeekPts ?? 0))
                  }}
                    className="text-xs text-yellow-400 font-dm hover:underline">
                    ✏️ Override points →
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── FEEDBACK TAB ── */}
      {tab === 'feedback' && (
        <div className="space-y-4">
          {/* Send feedback */}
          <div className="bg-card border border-border rounded-3xl p-4 space-y-3">
            <p className="font-kanit font-semibold uppercase text-sm text-white">SEND PRIVATE FEEDBACK</p>
            <p className="text-xs text-muted font-dm">Only the recipient can see this — it appears privately on their profile.</p>

            {/* User picker */}
            <div>
              <p className="text-xs font-dm text-muted uppercase tracking-widest mb-2">SELECT MEMBER</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {users.map(u => (
                  <button key={u.id} onClick={() => setSelectedUser(u)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-2xl border transition-all text-left ${
                      selectedUser?.id === u.id ? 'border-lime/40 bg-lime/10' : 'border-border hover:border-lime/20'
                    }`}>
                    <Avatar name={u.full_name} avatarUrl={u.avatar_url} size="sm" />
                    <div>
                      <p className="text-sm font-dm text-white">{u.full_name}</p>
                      {u.username && <p className="text-xs text-muted font-dm">@{u.username}</p>}
                    </div>
                    {selectedUser?.id === u.id && <span className="ml-auto text-lime text-xs">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {selectedUser && (
              <>
                <div>
                  <p className="text-xs font-dm text-muted uppercase tracking-widest mb-2">
                    MESSAGE TO {selectedUser.full_name.toUpperCase()}
                  </p>
                  <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
                    placeholder={`Hey ${selectedUser.full_name.split(' ')[0]}, great work this week…`}
                    rows={4}
                    className="w-full bg-soft border border-border rounded-2xl px-4 py-3 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 resize-none font-dm" />
                </div>
                {feedbackMsg && <p className="text-sm text-lime font-dm">{feedbackMsg}</p>}
                <button onClick={sendFeedback} disabled={savingFeedback || !feedbackText.trim()}
                  className="w-full bg-lime text-bg font-kanit font-bold uppercase py-3 rounded-2xl disabled:opacity-40 active:scale-95 transition-all shadow-lime-sm">
                  {savingFeedback ? 'SENDING…' : `SEND TO ${selectedUser.full_name.split(' ')[0].toUpperCase()}`}
                </button>
              </>
            )}
          </div>

          {/* Feedback history */}
          {feedback.length > 0 && (
            <div className="space-y-2">
              <p className="font-kanit font-semibold uppercase text-sm text-white">FEEDBACK HISTORY</p>
              {feedback.map(f => (
                <div key={f.id} className="bg-card border border-border rounded-3xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Avatar name={f.profiles?.full_name} avatarUrl={f.profiles?.avatar_url} size="sm" />
                      <div>
                        <p className="text-sm font-kanit font-semibold text-white">{f.profiles?.full_name}</p>
                        <p className="text-xs text-muted font-dm">{new Date(f.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      </div>
                    </div>
                    <button onClick={() => deleteFeedback(f.id)} className="text-muted hover:text-red-400 text-sm transition-colors">×</button>
                  </div>
                  <p className="text-sm text-gray-200 font-dm leading-relaxed">{f.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── LOGS TAB ── */}
      {tab === 'logs' && (
        <div className="space-y-3">
          <p className="text-xs text-muted font-dm">All submissions for review</p>
          {submissions.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-3xl p-8 text-center">
              <p className="text-muted font-dm text-sm">No submissions yet.</p>
            </div>
          ) : (
            [...submissions]
              .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
              .map(sub => {
                const u = users.find(u => u.id === sub.user_id)
                return (
                  <div key={sub.id} className="bg-card border border-border rounded-3xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Avatar name={u?.full_name} avatarUrl={u?.avatar_url} size="sm" />
                        <div>
                          <p className="font-kanit font-semibold text-sm text-white">{u?.full_name || 'Unknown'}</p>
                          <p className="text-xs text-muted font-dm">Week {sub.week_number} · {getWeekLabel(sub.week_number)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-kanit font-bold text-lime text-lg">{sub.admin_override_points ?? sub.calculated_points ?? 0}<span className="text-muted text-xs">/11</span></p>
                        <span className={`text-xs font-dm px-2 py-0.5 rounded-full ${
                          sub.status === 'approved' ? 'bg-lime/10 text-lime' :
                          sub.status === 'rejected' ? 'bg-red-900/20 text-red-400' :
                          'bg-yellow-900/20 text-yellow-400'
                        }`}>{sub.status}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 text-xs font-dm text-center">
                      {[
                        { label: '💪', val: sub.workouts },
                        { label: '🧘', val: sub.recovery_sessions },
                        { label: '🤝', val: sub.social_sessions },
                        { label: '🥗', val: `${sub.nutrition_days}d` },
                      ].map(({ label, val }) => (
                        <div key={label} className="bg-soft rounded-xl py-1.5">
                          <p>{label}</p><p className="text-white font-kanit">{val ?? 0}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
          )}
        </div>
      )}

      {/* ── ACCESS TAB (owner only) ── */}
      {tab === 'access' && isOwner && (
        <div className="space-y-4">
          {/* Grant admin */}
          <div className="bg-card border border-lime/20 rounded-3xl p-4 space-y-3">
            <p className="font-kanit font-semibold uppercase text-sm text-white">GRANT ADMIN ACCESS</p>
            <p className="text-xs text-muted font-dm">Enter someone's email to make them an admin.</p>
            <div className="flex gap-2">
              <input type="email" value={grantEmail}
                onChange={e => { setGrantEmail(e.target.value); setGrantMsg('') }}
                placeholder="their@email.com"
                className="flex-1 bg-soft border border-border rounded-2xl px-4 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 font-dm" />
              <button onClick={grantAdmin} disabled={granting || !grantEmail.trim()}
                className="bg-lime text-bg font-kanit font-semibold uppercase text-sm px-4 py-2.5 rounded-2xl disabled:opacity-40 shadow-lime-sm">
                {granting ? '…' : 'GRANT'}
              </button>
            </div>
            {grantMsg && <p className={`text-sm font-dm ${grantMsg.startsWith('✓') ? 'text-lime' : 'text-red-400'}`}>{grantMsg}</p>}
          </div>

          {/* Current admins */}
          <div className="bg-card border border-border rounded-3xl p-4">
            <p className="font-kanit font-semibold uppercase text-sm text-white mb-3">CURRENT ADMINS</p>
            {admins.length === 0 ? (
              <p className="text-muted text-sm font-dm">No admins yet.</p>
            ) : (
              <div className="space-y-2">
                {admins.map(u => (
                  <div key={u.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.full_name} avatarUrl={u.avatar_url} size="sm" />
                      <div>
                        <p className="text-sm font-dm text-white">{u.full_name}</p>
                        <p className="text-xs text-muted font-dm">{u.email}</p>
                      </div>
                    </div>
                    {u.email?.toLowerCase() !== OWNER_EMAIL && (
                      <button onClick={() => revokeAdmin(u.id, u.full_name)}
                        className="text-xs text-red-400 font-dm hover:underline">Revoke</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Point Override Modal */}
      {overrideModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setOverrideModal(null)}>
          <div className="bg-card border border-border rounded-3xl p-5 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-kanit font-bold italic uppercase text-white">Override Points</p>
              <button onClick={() => setOverrideModal(null)} className="text-muted hover:text-white text-xl">×</button>
            </div>
            <p className="text-sm text-muted font-dm">
              Setting points for <span className="text-white font-semibold">{overrideModal.userName}</span> — Week {overrideModal.weekNum}
            </p>

            <div>
              <p className="text-xs font-dm text-muted uppercase tracking-widest mb-2">NEW POINTS (0–11)</p>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {Array.from({ length: 12 }, (_, i) => i).map(n => (
                  <button key={n} onClick={() => setOverridePts(String(n))}
                    className={`w-9 h-9 rounded-xl text-sm font-kanit font-semibold transition-all ${
                      parseInt(overridePts) === n ? 'bg-lime text-bg' : 'bg-soft border border-border text-muted hover:text-white'
                    }`}>{n}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted font-dm">Or type:</span>
                <input type="number" min="0" max="11" value={overridePts}
                  onChange={e => setOverridePts(e.target.value)}
                  className="w-20 bg-soft border border-border rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:border-lime/40 font-dm" />
                <span className="text-muted font-dm text-sm">/11</span>
              </div>
            </div>

            <div>
              <p className="text-xs font-dm text-muted uppercase tracking-widest mb-2">REASON (OPTIONAL)</p>
              <textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
                placeholder="e.g. Deducted for missed deadline, bonus for extra effort…"
                rows={2}
                className="w-full bg-soft border border-border rounded-2xl px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 resize-none font-dm" />
              <p className="text-xs text-muted font-dm mt-1">The user will be notified with this reason.</p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setOverrideModal(null)}
                className="flex-1 border border-border text-muted font-kanit font-semibold uppercase py-2.5 rounded-2xl hover:text-white transition-all text-sm">
                Cancel
              </button>
              <button onClick={savePointOverride} disabled={savingOverride || overridePts === ''}
                className="flex-1 bg-lime text-bg font-kanit font-bold uppercase py-2.5 rounded-2xl disabled:opacity-40 shadow-lime-sm text-sm">
                {savingOverride ? 'Saving…' : 'Set Points'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
