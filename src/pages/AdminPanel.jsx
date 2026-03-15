import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useApp } from '../App'
import { getWeekLabel, calculatePoints } from '../utils/points'
import { getLane } from '../utils/lanes'

export default function AdminPanel() {
  const { profile } = useApp()
  const [myEmail, setMyEmail] = useState('')
  const [tab, setTab] = useState('pending')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setMyEmail(session?.user?.email?.toLowerCase() || '')
    })
  }, [])
  const [eligibility, setEligibility] = useState([])
  const [grantEmail, setGrantEmail] = useState('')
  const [granting, setGranting] = useState(false)
  const [grantMsg, setGrantMsg] = useState('')
  const [submissions, setSubmissions] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [overrideValues, setOverrideValues] = useState({})

  useEffect(() => {
    loadData()
  }, [tab])

  async function loadData() {
    setLoading(true)
    if (tab === 'eligibility') {
      const { data } = await supabase.from('prize_eligibility').select('*').order('total_points', { ascending: false })
      setEligibility(data || [])
      setLoading(false)
      return
    }
    if (tab === 'users') {
      const { data } = await supabase.from('profiles').select('*').order('full_name')
      setUsers(data || [])
    } else {
      const query = supabase
        .from('weekly_submissions')
        .select('*, profiles(full_name, email)')
        .order('submitted_at', { ascending: false })
      if (tab === 'pending') query.eq('status', 'submitted')
      const { data } = await query
      setSubmissions(data || [])
    }
    setLoading(false)
  }

  async function grantAdmin() {
    if (!grantEmail.trim()) return
    setGranting(true); setGrantMsg('')
    const { data, error } = await supabase
      .from('profiles')
      .update({ is_admin: true })
      .eq('email', grantEmail.trim().toLowerCase())
      .select('full_name')
    if (error || !data?.length) {
      setGrantMsg('No user found with that email.')
    } else {
      setGrantMsg(`✓ Admin granted to ${data[0].full_name}`)
      setGrantEmail('')
    }
    setGranting(false)
  }

  async function updateStatus(id, status) {
    setSaving(id + status)
    const override = overrideValues[id]
    const update = { status }
    if (override !== undefined && override !== '') {
      update.admin_override_points = parseInt(override)
    }
    await supabase.from('weekly_submissions').update(update).eq('id', id)
    setSaving(null)
    loadData()
  }

  async function toggleAdmin(userId, current) {
    await supabase.from('profiles').update({ is_admin: !current }).eq('id', userId)
    loadData()
  }

  async function deleteUser(userId) {
    if (!confirm('Are you sure? This will delete the user and all their submissions.')) return
    await supabase.from('profiles').delete().eq('id', userId)
    loadData()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-kanit font-bold italic uppercase text-4xl tracking-tight">ADMIN PANEL</h1>
        <p className="text-muted text-sm">Organiser controls</p>
      </div>

      {/* Grant Admin — only visible to the owner */}
      {myEmail === 'projectcertii@gmail.com' && (
      <div className="bg-card border border-lime/20 rounded-3xl p-4">
        <p className="font-kanit font-semibold uppercase text-sm text-white mb-1">GRANT ADMIN ACCESS</p>
        <p className="text-muted text-xs font-dm mb-3">Enter someone's email to make them an admin</p>
        <div className="flex gap-2">
          <input
            type="email"
            value={grantEmail}
            onChange={e => { setGrantEmail(e.target.value); setGrantMsg('') }}
            placeholder="their@email.com"
            className="flex-1 bg-soft border border-border rounded-2xl px-4 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 font-dm"
          />
          <button
            onClick={grantAdmin}
            disabled={granting || !grantEmail.trim()}
            className="bg-lime text-bg font-kanit font-semibold uppercase text-sm px-4 py-2.5 rounded-2xl disabled:opacity-40 transition-all shadow-lime-sm"
          >
            {granting ? '...' : 'GRANT'}
          </button>
        </div>
        {grantMsg && (
          <p className={`text-sm font-dm mt-2 ${grantMsg.startsWith('✓') ? 'text-lime' : 'text-red-400'}`}>{grantMsg}</p>
        )}
      </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {['pending', 'all', 'users', 'eligibility'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-2xl text-sm font-medium transition-all ${
              tab === t ? 'bg-lime text-bg' : 'bg-card border border-border text-muted hover:text-white'
            }`}
          >
            {t === 'pending' ? 'Pending' : t === 'all' ? 'All Submissions' : t === 'users' ? 'Users' : '🎯 Eligibility'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-card rounded-2xl animate-pulse" />)}
        </div>
      ) : tab === 'eligibility' ? (
        <EligibilityTab rows={eligibility} />
      ) : tab === 'users' ? (
        <UsersTab users={users} onToggleAdmin={toggleAdmin} onDelete={deleteUser} />
      ) : (
        <SubmissionsTab
          submissions={submissions}
          saving={saving}
          overrideValues={overrideValues}
          onOverrideChange={(id, val) => setOverrideValues(v => ({ ...v, [id]: val }))}
          onApprove={id => updateStatus(id, 'approved')}
          onReject={id => updateStatus(id, 'rejected')}
          onPending={id => updateStatus(id, 'submitted')}
          emptyText={tab === 'pending' ? 'No pending submissions.' : 'No submissions found.'}
        />
      )}
    </div>
  )
}

function SubmissionsTab({ submissions, saving, overrideValues, onOverrideChange, onApprove, onReject, onPending, emptyText }) {
  if (submissions.length === 0) {
    return <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted text-sm">{emptyText}</div>
  }

  return (
    <div className="space-y-3">
      {submissions.map(sub => {
        const calc = sub.admin_override_points ?? sub.calculated_points ?? 0
        return (
          <div key={sub.id} className={`bg-card border rounded-2xl p-5 ${
            sub.status === 'approved' ? 'border-green-800/50' :
            sub.status === 'rejected' ? 'border-red-800/50' :
            'border-border'
          }`}>
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">{sub.profiles?.full_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    sub.status === 'approved' ? 'border-green-700 text-green-400' :
                    sub.status === 'rejected' ? 'border-red-700 text-red-400' :
                    'border-yellow-700 text-yellow-400'
                  }`}>
                    {sub.status === 'approved' ? '✓ Approved' : sub.status === 'rejected' ? '✗ Rejected' : '⏳ Pending'}
                  </span>
                </div>
                <p className="text-muted text-xs mt-0.5">
                  Week {sub.week_number} · {getWeekLabel(sub.week_number)} · submitted {new Date(sub.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="font-kanit font-bold italic uppercase text-3xl text-white">{calc}<span className="text-muted text-sm">/11</span></div>
            </div>

            {/* Activity breakdown */}
            <div className="grid grid-cols-4 md:grid-cols-4 gap-2 text-xs mb-3">
              {[
                { label: '💪 Workouts', val: sub.workouts },
                { label: '🧘 Recovery', val: sub.recovery_sessions + ' sessions' },
                { label: '🤝 Social', val: sub.social_sessions + ' sessions' },
                { label: '🥗 Nutrition', val: sub.nutrition_days + ' days' },
              ].map(({ label, val }) => (
                <div key={label} className="bg-bg rounded-2xl p-2">
                  <p className="text-muted">{label}</p>
                  <p className="text-white font-medium mt-0.5">{val}</p>
                </div>
              ))}
            </div>

            {/* Notes */}
            {sub.notes && <p className="text-muted text-xs italic mb-3">"{sub.notes}"</p>}

            {/* Proof photos */}
            {sub.proof_urls?.length > 0 && (
              <div className="flex gap-2 mb-3">
                {sub.proof_urls.map(url => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="proof" className="w-14 h-14 rounded-2xl object-cover border border-border hover:border-lime transition-colors" />
                  </a>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted">Override pts:</label>
                <input
                  type="number"
                  min="0" max="11"
                  value={overrideValues[sub.id] ?? ''}
                  onChange={e => onOverrideChange(sub.id, e.target.value)}
                  placeholder={String(sub.calculated_points ?? 0)}
                  className="w-16 bg-bg border border-border rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-lime"
                />
              </div>
              <div className="flex gap-2 ml-auto">
                {sub.status !== 'submitted' && (
                  <button onClick={() => onPending(sub.id)} disabled={saving === sub.id + 'submitted'}
                    className="text-xs px-3 py-1.5 rounded-2xl border border-border text-muted hover:text-white transition-colors">
                    Reset
                  </button>
                )}
                {sub.status !== 'rejected' && (
                  <button onClick={() => onReject(sub.id)} disabled={saving === sub.id + 'rejected'}
                    className="text-xs px-3 py-1.5 rounded-2xl border border-red-800 text-red-400 hover:bg-red-900/20 transition-colors">
                    {saving === sub.id + 'rejected' ? '...' : 'Reject'}
                  </button>
                )}
                {sub.status !== 'approved' && (
                  <button onClick={() => onApprove(sub.id)} disabled={saving === sub.id + 'approved'}
                    className="text-xs px-3 py-1.5 rounded-2xl bg-green-900/30 border border-green-800 text-green-400 hover:bg-green-900/50 transition-colors">
                    {saving === sub.id + 'approved' ? '...' : 'Approve'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function UsersTab({ users, onToggleAdmin, onDelete }) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border grid grid-cols-12 text-xs text-muted uppercase tracking-wider">
        <span className="col-span-5">Name</span>
        <span className="col-span-4">Email</span>
        <span className="col-span-3 text-right">Actions</span>
      </div>
      {users.length === 0 ? (
        <div className="p-8 text-center text-muted text-sm">No users found.</div>
      ) : (
        users.map(user => (
          <div key={user.id} className="px-5 py-4 grid grid-cols-12 items-center border-b border-border/50 last:border-0">
            <div className="col-span-5 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-border flex items-center justify-center text-xs font-bold text-muted">
                {user.full_name?.[0]?.toUpperCase()}
              </div>
              <div>
                <span className="text-sm text-white">{user.full_name}</span>
                {user.is_admin && <span className="ml-2 text-xs text-lime">Admin</span>}
              </div>
            </div>
            <span className="col-span-4 text-sm text-muted truncate">{user.email}</span>
            <div className="col-span-3 flex justify-end gap-2">
              <button
                onClick={() => onToggleAdmin(user.id, user.is_admin)}
                className="text-xs px-2.5 py-1 rounded-2xl border border-border text-muted hover:text-lime hover:border-lime transition-colors"
              >
                {user.is_admin ? 'Remove admin' : 'Make admin'}
              </button>
              <button
                onClick={() => onDelete(user.id)}
                className="text-xs px-2.5 py-1 rounded-2xl border border-red-900 text-red-500 hover:bg-red-900/20 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function EligibilityTab({ rows }) {
  if (rows.length === 0) return <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted text-sm">No data.</div>
  return (
    <div className="space-y-2">
      {rows.map(r => {
        const lane = getLane(r.lane)
        return (
          <div key={r.user_id} className={`bg-card border rounded-2xl px-5 py-4 grid grid-cols-12 items-center gap-2 ${
            !r.prize_eligible ? 'border-red-800/40' : r.flawless_on_track ? 'border-yellow-400/30' : 'border-border'
          }`}>
            <div className="col-span-4">
              <p className="font-medium text-sm text-white">{r.full_name}</p>
              {r.username && <p className="text-xs text-muted">@{r.username}</p>}
              {lane && r.lane_public && (
                <span className={`text-xs mt-1 inline-block ${lane.text}`}>{lane.emoji} {lane.label}</span>
              )}
            </div>
            <div className="col-span-2 text-center">
              <p className="font-kanit font-bold italic uppercase text-2xl text-white">{r.total_points}</p>
              <p className="text-xs text-muted">points</p>
            </div>
            <div className="col-span-2 text-center">
              <p className={`font-kanit font-bold italic uppercase text-2xl ${r.weeks_missed >= 2 ? 'text-red-400' : r.weeks_missed === 1 ? 'text-yellow-400' : 'text-green-400'}`}>{r.weeks_missed}</p>
              <p className="text-xs text-muted">missed</p>
            </div>
            <div className="col-span-2 text-center">
              <p className={`font-kanit font-bold italic uppercase text-xl ${r.recovery_weeks >= 4 ? 'text-green-400' : 'text-yellow-400'}`}>{r.recovery_weeks}<span className="text-muted text-sm">/4</span></p>
              <p className="text-xs text-muted">recovery</p>
            </div>
            <div className="col-span-2 text-right">
              <span className={`text-xs font-medium px-2 py-1 rounded-full border ${
                !r.prize_eligible ? 'border-red-700 text-red-400 bg-red-900/20' :
                r.flawless_on_track ? 'border-yellow-400/50 text-yellow-400 bg-yellow-400/10' :
                'border-green-700 text-green-400 bg-green-900/20'
              }`}>
                {!r.prize_eligible ? 'OUT' : r.flawless_on_track ? '💎 Flawless' : '✓ Eligible'}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
