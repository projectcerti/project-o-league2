import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useApp } from '../App'
import { getCurrentWeek, getWeekLabel, TOTAL_WEEKS, breakdownPoints } from '../utils/points'

export default function MyStats() {
  const { profile } = useApp()
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const currentWeek = getCurrentWeek()

  useEffect(() => {
    supabase.from('weekly_submissions').select('*').eq('user_id', profile.id)
      .then(({ data }) => { setSubmissions(data || []); setLoading(false) })
  }, [profile.id])

  const totalPoints = submissions.reduce((acc, s) => acc + (s.admin_override_points ?? s.calculated_points ?? 0), 0)
  const maxPossible = currentWeek * 11
  const approvedWeeks = submissions.filter(s => s.status === 'approved').length
  const allWeeksClean = submissions.length === currentWeek && submissions.every(s => s.status !== 'rejected')

  if (loading) return <div className="space-y-4 animate-pulse">{[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-card rounded-2xl" />)}</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-kanit font-bold italic uppercase text-4xl tracking-tight">MY STATS</h1>
        <p className="text-muted text-sm">{profile?.full_name}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Total Points" value={totalPoints} sub={`of ${maxPossible} possible`} />
        <Card label="Weeks Submitted" value={`${submissions.length}/${TOTAL_WEEKS}`} />
        <Card label="Weeks Approved" value={approvedWeeks} />
        <Card label="Flawless Track" value={allWeeksClean ? '🔥 Yes' : '⚠️ No'} isText />
      </div>

      {/* Flawless bonus banner */}
      {allWeeksClean && submissions.length > 0 && (
        <div className="bg-gold/10 border border-gold/30 rounded-2xl px-5 py-4">
          <p className="font-kanit font-bold italic uppercase text-xl text-gold">🏆 FLAWLESS BONUS ON TRACK</p>
          <p className="text-sm text-muted mt-0.5">
            Keep submitting before the Sunday 8pm deadline every week to secure the £50 flawless bonus.
          </p>
        </div>
      )}

      {/* Weekly breakdown */}
      <div className="space-y-3">
        <h2 className="font-kanit font-bold italic uppercase text-xl tracking-tight">WEEK BY WEEK</h2>
        {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map(w => {
          const sub = submissions.find(s => s.week_number === w)
          const pts = sub ? (sub.admin_override_points ?? sub.calculated_points ?? 0) : null
          const bd = sub ? breakdownPoints(sub) : null
          const isFuture = w > currentWeek

          return (
            <div
              key={w}
              className={`bg-card border rounded-2xl p-5 ${
                isFuture ? 'border-border opacity-40' :
                !sub ? 'border-dashed border-border' :
                sub.status === 'approved' ? 'border-green-800/60' :
                sub.status === 'rejected' ? 'border-red-800/60' :
                'border-border'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-kanit font-bold italic uppercase text-lg text-lime">WEEK {w}</span>
                    {sub && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                        sub.status === 'approved' ? 'border-green-700 text-green-400 bg-green-900/20' :
                        sub.status === 'rejected' ? 'border-red-700 text-red-400 bg-red-900/20' :
                        'border-yellow-700 text-yellow-400 bg-yellow-900/20'
                      }`}>
                        {sub.status === 'approved' ? '✓ Approved' : sub.status === 'rejected' ? '✗ Rejected' : '⏳ Pending'}
                      </span>
                    )}
                  </div>
                  <p className="text-muted text-xs mt-0.5">{getWeekLabel(w)}</p>
                </div>
                <div className="text-right">
                  {pts !== null ? (
                    <>
                      <span className="font-kanit font-bold italic uppercase text-3xl text-white">{pts}</span>
                      <span className="text-muted text-sm">/11</span>
                      {sub?.admin_override_points !== null && sub?.admin_override_points !== undefined && (
                        <p className="text-xs text-lime mt-0.5">Admin override</p>
                      )}
                    </>
                  ) : isFuture ? (
                    <span className="text-muted text-sm">Upcoming</span>
                  ) : (
                    <span className="text-muted text-sm">Not submitted</span>
                  )}
                </div>
              </div>

              {sub && bd && (
                <div className="grid grid-cols-5 gap-2 text-center text-xs">
                  {[
                    { label: '💪', val: `${sub.workouts}x`, pts: bd.workout_pts },
                    { label: '🧘', val: `${sub.recovery_sessions}x`, pts: bd.recovery_pts },
                    { label: '🤝', val: `${sub.social_sessions}x`, pts: bd.social_pts },
                    { label: '🥗', val: `${sub.nutrition_days}d`, pts: bd.nutrition_pts },
                    { label: '⭐', val: 'Bonus', pts: bd.bonus_pts },
                  ].map(({ label, val, pts: p }) => (
                    <div key={label} className="bg-bg rounded-2xl py-2">
                      <div>{label}</div>
                      <div className="text-muted">{val}</div>
                      <div className={`font-kanit font-bold italic uppercase text-base ${p > 0 ? 'text-lime' : 'text-border'}`}>+{p}</div>
                    </div>
                  ))}
                </div>
              )}

              {sub?.notes && (
                <p className="text-muted text-xs mt-3 italic">"{sub.notes}"</p>
              )}

              {sub?.proof_urls?.length > 0 && (
                <div className="flex gap-2 mt-3">
                  {sub.proof_urls.map(url => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt="proof" className="w-14 h-14 rounded-2xl object-cover border border-border hover:border-lime transition-colors" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Card({ label, value, sub, isText }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-xs text-muted uppercase tracking-wider">{label}</p>
      <p className={`font-kanit font-bold italic uppercase mt-1 ${isText ? 'text-xl text-white' : 'text-3xl text-white'}`}>{value}</p>
      {sub && <p className="text-muted text-xs mt-0.5">{sub}</p>}
    </div>
  )
}
