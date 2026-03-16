import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useApp } from '../App'
import { getCurrentWeek, getWeekDeadline, getWeekLabel, TOTAL_WEEKS } from '../utils/points'
import { Avatar } from './Feed'
import Feed from './Feed'

export default function Dashboard() {
  const { profile } = useApp()
  const [submissions, setSubmissions] = useState([])
  const [topThree, setTopThree] = useState([])
  const [loading, setLoading] = useState(true)

  const currentWeek = getCurrentWeek()
  const deadline = getWeekDeadline(currentWeek)
  const now = new Date()
  const msLeft = deadline - now
  const hoursLeft = Math.max(0, Math.floor(msLeft / 3600000))
  const isPastDeadline = now > deadline
  const isUrgent = !isPastDeadline && hoursLeft < 6

  useEffect(() => {
    async function load() {
      const [{ data: subs }, { data: lb }] = await Promise.all([
        supabase.from('weekly_submissions').select('*').eq('user_id', profile.id),
        supabase.from('leaderboard_cache').select('*').order('rank').limit(3),
      ])
      setSubmissions(subs || [])
      setTopThree(lb || [])
      setLoading(false)
    }
    load()
  }, [profile.id])

  const totalPoints = submissions.reduce((acc, s) => acc + (s.admin_override_points ?? s.calculated_points ?? 0), 0)
  const thisWeekSub = submissions.find(s => s.week_number === currentWeek)
  const thisWeekPts = thisWeekSub ? (thisWeekSub.admin_override_points ?? thisWeekSub.calculated_points ?? 0) : null

  const weekStart = new Date('2026-03-16')
  weekStart.setDate(weekStart.getDate() + (currentWeek - 1) * 7)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return { d, label: ['M','T','W','T','F','S','S'][i], num: d.getDate() }
  })
  const todayIdx = days.findIndex(d => d.d.toDateString() === now.toDateString())

  if (loading) return (
    <div className="space-y-3 pt-2 animate-pulse">
      {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-card rounded-3xl" />)}
    </div>
  )

  return (
    <div className="space-y-3 pt-1 fade-up">

      {/* Header — Total Points */}
      <div className="flex items-center justify-between py-1">
        <div>
          <p className="text-muted text-xs font-dm">Week {currentWeek}/{TOTAL_WEEKS}</p>
          <h1 className="font-kanit font-bold italic uppercase text-2xl text-white leading-tight">
            Hey, {profile?.full_name?.split(' ')[0]}
          </h1>
        </div>
        <div className="text-right bg-card border border-border rounded-2xl px-4 py-2">
          <p className="font-kanit font-semibold text-2xl text-lime leading-none">{totalPoints}</p>
          <p className="text-muted text-xs font-dm">total pts</p>
        </div>
      </div>

      {/* This Week */}
      <div className="bg-card border border-border rounded-3xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-kanit font-semibold text-sm text-white">THIS WEEK</p>
          <p className="text-xs text-muted font-dm">{getWeekLabel(currentWeek)}</p>
        </div>
        <div className="grid grid-cols-7 gap-1.5 mb-3">
          {days.map((d, i) => (
            <div key={i} className={`flex flex-col items-center py-2 rounded-2xl gap-0.5 transition-all ${
              i === todayIdx ? 'bg-lime' : i < todayIdx ? 'bg-soft' : ''
            }`}>
              <span className={`text-xs font-dm ${i === todayIdx ? 'text-bg font-medium' : 'text-muted'}`}>{d.label}</span>
              <span className={`font-kanit font-semibold text-sm ${i === todayIdx ? 'text-bg' : i < todayIdx ? 'text-white' : 'text-muted'}`}>{d.num}</span>
            </div>
          ))}
        </div>
        <div className={`rounded-2xl border px-3 py-2.5 flex items-center justify-between ${
          isUrgent ? 'border-red-800/40 bg-red-900/10' :
          thisWeekSub?.status === 'approved' ? 'border-lime/15 bg-lime/5' :
          'border-border bg-soft'
        }`}>
          <div>
            <p className="font-kanit font-semibold text-sm text-white">
              {thisWeekSub ? `Week ${currentWeek} · ${thisWeekPts} pts` : `Log week ${currentWeek}`}
            </p>
            <p className="text-xs text-muted font-dm mt-0.5">
              {isPastDeadline ? 'Deadline passed' :
               thisWeekSub ? thisWeekSub.status :
               isUrgent ? `Only ${hoursLeft}h left!` :
               `Due Sunday 8pm · ${hoursLeft}h left`}
            </p>
          </div>
          {!thisWeekSub && !isPastDeadline ? (
            <Link to="/log" className="bg-lime text-bg font-kanit font-semibold text-sm px-4 py-1.5 rounded-xl shadow-lime-sm active:scale-95 transition-all">
              Log
            </Link>
          ) : thisWeekSub ? (
            <span className={`text-xs font-dm px-2.5 py-1 rounded-full border ${
              thisWeekSub.status === 'approved' ? 'border-lime/20 text-lime' :
              thisWeekSub.status === 'rejected' ? 'border-red-800 text-red-400' :
              'border-yellow-800/40 text-yellow-400'
            }`}>
              {thisWeekSub.status === 'approved' ? '✓' : thisWeekSub.status === 'rejected' ? '✗' : '⏳'}
            </span>
          ) : null}
        </div>
      </div>

      {/* Top 3 */}
      {topThree.length > 0 && (
        <div className="bg-card border border-border rounded-3xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-kanit font-semibold text-sm text-white">TOP 3</p>
            <Link to="/leaderboard" className="text-xs text-lime font-dm">View all →</Link>
          </div>
          <div className="space-y-2.5">
            {topThree.map((row, i) => (
              <div key={row.user_id} className="flex items-center gap-3">
                <span className="w-5 font-kanit font-semibold text-sm text-center" style={{ color: ['#FFD700','#C0C0C0','#CD7F32'][i] }}>
                  {['🥇','🥈','🥉'][i]}
                </span>
                <Avatar name={row.full_name} avatarUrl={row.avatar_url} size="sm" />
                <span className={`flex-1 text-sm font-dm truncate ${row.user_id === profile.id ? 'text-lime' : 'text-white'}`}>
                  {row.full_name}{row.user_id === profile.id ? ' (you)' : ''}
                </span>
                <span className="font-kanit font-semibold text-sm text-white">{row.total_points} <span className="text-muted text-xs">pts</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feed */}
      <div>
        <p className="font-kanit font-semibold uppercase text-sm text-white mb-3">FEED</p>
        <Feed embedded={true} />
      </div>

    </div>
  )
}
