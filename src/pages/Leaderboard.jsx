import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useApp } from '../App'
import { getCurrentWeek, TOTAL_WEEKS } from '../utils/points'
import { Avatar } from './Feed'

function RankedAvatar({ name, avatarUrl, rank, size = 'sm', animated = false }) {
  const [flames, setFlames] = useState(false)

  function handleClick() {
    if (rank !== 1) return
    setFlames(true)
    setTimeout(() => setFlames(false), 1500)
  }

  return (
    <div className="relative cursor-pointer" onClick={handleClick}>
      <Avatar name={name} avatarUrl={avatarUrl} size={size} />
      {rank === 1 && flames && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center animate-ping-once">
          <div className="absolute inset-0 rounded-2xl overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i} className="flame-particle" style={{
                position: 'absolute',
                left: `${10 + i * 10}%`,
                bottom: 0,
                fontSize: `${12 + Math.random() * 8}px`,
                animation: `flameRise ${0.6 + Math.random() * 0.9}s ease-out forwards`,
                animationDelay: `${i * 0.08}s`,
              }}>🔥</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Leaderboard() {
  const { profile } = useApp()
  const [tab, setTab] = useState('overall')
  const [rows, setRows] = useState([])
  const [weekRows, setWeekRows] = useState([])
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [loading, setLoading] = useState(true)
  const currentWeek = getCurrentWeek()

  useEffect(() => {
    // Real-time: reload when weekly_submissions changes (live points)
    const channel = supabase.channel('leaderboard-live')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'weekly_submissions'
      }, () => { if (tab === 'overall') loadOverall() })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    if (tab === 'overall') {
      loadOverall()
    } else {
      loadWeek(tab)
    }
  }, [tab])

  async function loadOverall() {
    setLoading(true)
    // Read directly from weekly_submissions — always live, no cache delay
    const [{ data: subs }, { data: profiles }] = await Promise.all([
      supabase.from('weekly_submissions').select('user_id, calculated_points, admin_override_points'),
      supabase.from('profiles').select('id, full_name, username, avatar_url'),
    ])

    // Sum points per user
    const pointsMap = {}
    for (const s of subs || []) {
      const pts = s.admin_override_points ?? s.calculated_points ?? 0
      pointsMap[s.user_id] = (pointsMap[s.user_id] || 0) + pts
    }

    // Build rows with profile info, sorted by points
    const built = (profiles || [])
      .map(p => ({
        user_id: p.id,
        full_name: p.full_name,
        username: p.username,
        avatar_url: p.avatar_url,
        total_points: pointsMap[p.id] || 0,
      }))
      .sort((a, b) => b.total_points - a.total_points)
      .map((r, i) => ({ ...r, rank: i + 1 }))

    setRows(built)
    setLastRefreshed(new Date().toISOString())
    setLoading(false)
  }

  async function loadWeek(weekNum) {
    setLoading(true)
    setWeekRows([])
    const { data, error } = await supabase
      .from('weekly_submissions')
      .select('user_id, calculated_points, admin_override_points, status, profiles(id, full_name, username, avatar_url)')
      .eq('week_number', weekNum)

    if (error) { console.error(error); setLoading(false); return }

    const built = (data || [])
      .map(d => ({
        user_id: d.user_id,
        full_name: d.profiles?.full_name || 'Unknown',
        username: d.profiles?.username,
        avatar_url: d.profiles?.avatar_url,
        total_points: d.admin_override_points ?? d.calculated_points ?? 0,
        status: d.status,
      }))
      .sort((a, b) => b.total_points - a.total_points)
      .map((r, i) => ({ ...r, rank: i + 1 }))

    setWeekRows(built)
    setLoading(false)
  }

  const displayRows = tab === 'overall' ? rows : weekRows
  const myRow = displayRows.find(r => r.user_id === profile.id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-1">
        <h1 className="font-kanit font-bold italic uppercase text-2xl text-white">LEADERBOARD</h1>
        {lastRefreshed && tab === 'overall' && (
          <p className="text-xs text-muted font-dm">Updated {formatTime(lastRefreshed)}</p>
        )}
      </div>

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
          {tab === 'overall' && myRow.previous_rank > 0 && myRow.rank !== myRow.previous_rank && (
            <span className={`text-sm font-kanit font-semibold ${myRow.rank < myRow.previous_rank ? 'text-lime' : 'text-red-400'}`}>
              {myRow.rank < myRow.previous_rank ? `↑${myRow.previous_rank - myRow.rank}` : `↓${myRow.rank - myRow.previous_rank}`}
            </span>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <TabBtn active={tab === 'overall'} onClick={() => setTab('overall')}>🏆 Overall</TabBtn>
        {Array.from({ length: currentWeek }, (_, i) => i + 1).map(w => (
          <TabBtn key={w} active={tab === w} onClick={() => setTab(w)}>Wk {w}</TabBtn>
        ))}
      </div>

      {/* Top 3 podium — clean, no boxes */}
      {!loading && displayRows.length >= 3 && (
        <div className="grid grid-cols-3 gap-2 py-2">
          {[displayRows[1], displayRows[0], displayRows[2]].map((row, i) => {
            const pos = [2, 1, 3][i]
            const heightClass = ['mt-4', 'mt-0', 'mt-8'][i]
            return (
              <Link key={row?.user_id} to={`/profile/${row?.username || row?.user_id}`}
                className={`flex flex-col items-center gap-1.5 group ${heightClass}`}>
                <RankedAvatar name={row?.full_name} avatarUrl={row?.avatar_url} rank={pos} size={pos === 1 ? 'lg' : 'md'} />
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
        {loading ? (
          <div className="p-5 space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-soft rounded-2xl animate-pulse" />)}
          </div>
        ) : displayRows.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm font-dm">No data yet.</div>
        ) : (
          <div className="divide-y divide-border/50">
            {displayRows.map((row, idx) => {
              const isMe = row.user_id === profile.id
              const rankChange = tab === 'overall' && row.previous_rank > 0 ? row.previous_rank - row.rank : 0
              return (
                <Link key={row.user_id} to={`/profile/${row.username || row.user_id}`}
                  className={`px-5 py-3.5 flex items-center gap-3 transition-colors ${isMe ? 'bg-lime/5' : 'hover:bg-soft'}`}>
                  <span className={`font-kanit font-bold italic uppercase text-lg w-6 text-center ${
                    idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-400' : idx === 2 ? 'text-amber-600' : 'text-muted'
                  }`}>{idx + 1}</span>
                  <RankedAvatar name={row.full_name} avatarUrl={row.avatar_url} rank={row.rank} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-dm font-medium truncate ${isMe ? 'text-lime' : 'text-white'}`}>
                      {row.full_name}{isMe ? ' (you)' : ''}
                    </p>
                    {row.username && <p className="text-xs text-muted font-dm">@{row.username}</p>}
                  </div>
                  {rankChange !== 0 && (
                    <span className={`text-xs font-kanit font-semibold ${rankChange > 0 ? 'text-lime' : 'text-red-400'}`}>
                      {rankChange > 0 ? `↑${rankChange}` : `↓${Math.abs(rankChange)}`}
                    </span>
                  )}
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
