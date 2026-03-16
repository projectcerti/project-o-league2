import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useApp } from '../App'
import { getCurrentWeek } from '../utils/points'
import { Avatar } from './Feed'



// Module-level cache — persists between navigations
const _cache = { rows: [], weekRows: {}, lastRefreshed: null }

export default function Leaderboard() {
  const { profile } = useApp()
  const [tab, setTab] = useState('overall')
  const [rows, setRows] = useState(_cache.rows)
  const [weekRows, setWeekRows] = useState({})
  const currentWeek = getCurrentWeek()

  useEffect(() => {
    loadOverall()
    const channel = supabase.channel('leaderboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_submissions' },
        () => loadOverall())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    if (tab !== 'overall' && !_cache.weekRows[tab]) loadWeek(tab)
    else if (tab !== 'overall') setWeekRows(wr => ({ ...wr, [tab]: _cache.weekRows[tab] }))
  }, [tab])

  async function loadOverall() {
    const [{ data: subs }, { data: profiles }] = await Promise.all([
      supabase.from('weekly_submissions').select('user_id, calculated_points, admin_override_points'),
      supabase.from('profiles').select('id, full_name, username, avatar_url'),
    ])
    const pointsMap = {}
    for (const s of subs || []) {
      const pts = s.admin_override_points ?? s.calculated_points ?? 0
      pointsMap[s.user_id] = (pointsMap[s.user_id] || 0) + pts
    }
    const built = (profiles || [])
      .map(p => ({ user_id: p.id, full_name: p.full_name, username: p.username, avatar_url: p.avatar_url, total_points: pointsMap[p.id] || 0 }))
      .sort((a, b) => b.total_points - a.total_points)
      .map((r, i) => ({ ...r, rank: i + 1 }))
    _cache.rows = built
    setRows(built)
  }

  async function loadWeek(weekNum) {
    const [{ data: subs }, { data: profiles }] = await Promise.all([
      supabase.from('weekly_submissions').select('user_id, calculated_points, admin_override_points, status').eq('week_number', weekNum),
      supabase.from('profiles').select('id, full_name, username, avatar_url'),
    ])
    const profileMap = {}
    for (const p of profiles || []) profileMap[p.id] = p
    const built = (subs || [])
      .map(d => ({ user_id: d.user_id, full_name: profileMap[d.user_id]?.full_name || 'Unknown', username: profileMap[d.user_id]?.username, avatar_url: profileMap[d.user_id]?.avatar_url, total_points: d.admin_override_points ?? d.calculated_points ?? 0, status: d.status }))
      .sort((a, b) => b.total_points - a.total_points)
      .map((r, i) => ({ ...r, rank: i + 1 }))
    _cache.weekRows[weekNum] = built
    setWeekRows(wr => ({ ...wr, [weekNum]: built }))
  }

  const displayRows = tab === 'overall' ? rows : (weekRows[tab] || _cache.weekRows[tab] || [])
  const myRow = displayRows.find(r => r.user_id === profile.id)

  return (
    <div className="space-y-4 fade-up">
      <h1 className="font-kanit font-bold italic uppercase text-2xl text-white pt-1">LEADERBOARD</h1>

      {/* My position */}
      {myRow && (
        <div className="bg-lime/10 border border-lime/20 rounded-3xl px-5 py-4 flex items-center justify-between shadow-lime-sm">
          <div className="flex items-center gap-3">
            <span className="font-kanit font-bold italic uppercase text-3xl text-lime">#{myRow.rank}</span>
            <div>
              <p className="font-kanit font-semibold text-sm text-white">YOUR POSITION</p>
              <p className="text-xs text-muted font-dm">{myRow.total_points} pts</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <TabBtn active={tab === 'overall'} onClick={() => setTab('overall')}>🏆 Overall</TabBtn>
        {Array.from({ length: currentWeek }, (_, i) => i + 1).map(w => (
          <TabBtn key={w} active={tab === w} onClick={() => setTab(w)}>Wk {w}</TabBtn>
        ))}
      </div>

      {/* Top 3 podium */}
      {displayRows.length >= 3 && (
        <div className="grid grid-cols-3 gap-2 py-2 items-end">
          {[displayRows[1], displayRows[0], displayRows[2]].map((row, i) => {
            const pos = [2, 1, 3][i]
            return (
              <Link key={row?.user_id} to={`/profile/${row?.username || row?.user_id}`}
                className="flex flex-col items-center gap-1.5 group">
                <Avatar name={row?.full_name} avatarUrl={row?.avatar_url} size={pos === 1 ? 'lg' : 'md'} />
                <span className="text-xl">{pos === 1 ? '🥇' : pos === 2 ? '🥈' : '🥉'}</span>
                <p className="text-xs font-dm font-medium text-center truncate w-full group-hover:text-lime transition-colors">
                  {row?.full_name?.split(' ')[0]}
                </p>
                <p className={`font-kanit font-bold italic uppercase leading-tight text-white ${pos === 1 ? 'text-xl' : 'text-base'}`}>
                  {row?.total_points}<span className="text-muted text-xs"> pts</span>
                </p>
              </Link>
            )
          })}
        </div>
      )}

      {/* Full list */}
      <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-card">
        {displayRows.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm font-dm">Loading…</div>
        ) : (
          <div className="divide-y divide-border/50">
            {displayRows.map((row, idx) => {
              const isMe = row.user_id === profile.id
              return (
                <Link key={row.user_id} to={`/profile/${row.username || row.user_id}`}
                  className={`px-5 py-3.5 flex items-center gap-3 transition-colors ${isMe ? 'bg-lime/5' : 'hover:bg-soft'}`}>
                  <span className={`font-kanit font-bold italic uppercase text-lg w-6 text-center ${
                    idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-400' : idx === 2 ? 'text-amber-600' : 'text-muted'
                  }`}>{idx + 1}</span>
                  <Avatar name={row.full_name} avatarUrl={row.avatar_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-dm font-medium truncate ${isMe ? 'text-lime' : 'text-white'}`}>
                      {row.full_name}{isMe ? ' (you)' : ''}
                    </p>
                    {row.username && <p className="text-xs text-muted font-dm">@{row.username}</p>}
                  </div>
                  <span className="font-kanit font-bold italic uppercase text-xl text-white">{row.total_points}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Points key */}
      <div className="bg-card border border-border rounded-3xl p-4 shadow-card">
        <p className="font-kanit font-semibold text-sm text-white mb-3">POINTS SYSTEM</p>
        <div className="grid grid-cols-1 gap-1.5 text-xs text-muted font-dm">
          <p>💪 Workouts: 1=2pts · 2=4pts · 3+=6pts</p>
          <p>🧘 Recovery: 1+ session = 1pt</p>
          <p>🤝 Social/class: 1+ session = 1pt</p>
          <p>🥗 Nutrition: 5d=1pt · 6–7d=2pts</p>
          <p>⭐ Balanced week (all 4 categories) = +1pt</p>
        </div>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 rounded-2xl text-sm font-dm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
        active ? 'bg-lime text-bg shadow-lime-sm' : 'bg-card border border-border text-muted hover:text-bg'
      }`}>
      {children}
    </button>
  )
}

function formatTime(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
