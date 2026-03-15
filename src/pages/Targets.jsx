import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useApp } from '../App'
import { TOTAL_WEEKS, getCurrentWeek } from '../utils/points'

export default function Targets() {
  const { profile } = useApp()
  const [submissions, setSubmissions] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const currentWeek = getCurrentWeek()

  useEffect(() => {
    async function load() {
      const [{ data: subs }, { data: sess }] = await Promise.all([
        supabase.from('weekly_submissions').select('*').eq('user_id', profile.id).order('week_number'),
        supabase.from('sessions').select('*').eq('user_id', profile.id).order('logged_at'),
      ])
      setSubmissions(subs || [])
      setSessions(sess || [])
      setLoading(false)
    }
    load()
  }, [profile.id])

  // --- Streak calculations ---
  const workoutStreak = calcWeeklyStreak(submissions, w => w.workouts >= 1)
  const recoveryStreak = calcWeeklyStreak(submissions, w => w.recovery_sessions >= 1)
  const nutritionStreak = calcWeeklyStreak(submissions, w => w.nutrition_days >= 5)
  const socialStreak = calcWeeklyStreak(submissions, w => w.social_sessions >= 1)
  const perfectStreak = calcWeeklyStreak(submissions, w => (w.admin_override_points ?? w.calculated_points ?? 0) === 11)

  // --- Totals ---
  const totalWorkouts = sessions.filter(s => s.session_type === 'workout').length
  const totalRecovery = sessions.filter(s => s.session_type === 'recovery').length
  const totalSocial = sessions.filter(s => s.session_type === 'social').length
  const totalMinutes = sessions.reduce((acc, s) => acc + (s.duration_minutes || 0), 0)
  const totalPoints = submissions.reduce((acc, s) => acc + (s.admin_override_points ?? s.calculated_points ?? 0), 0)
  const weeksWithNutrition = submissions.filter(s => s.nutrition_days >= 5).length
  const avgPoints = submissions.length > 0 ? (totalPoints / submissions.length).toFixed(1) : 0
  const bestWeek = submissions.reduce((max, s) => Math.max(max, s.admin_override_points ?? s.calculated_points ?? 0), 0)

  // Session type breakdown
  const workoutTypes = sessions
    .filter(s => s.session_type === 'workout' && s.activity_name)
    .reduce((acc, s) => { acc[s.activity_name] = (acc[s.activity_name] || 0) + 1; return acc }, {})
  const topWorkout = Object.entries(workoutTypes).sort((a, b) => b[1] - a[1])[0]

  // Weekly submission heatmap data
  const weeksLogged = submissions.length
  const weeksRemaining = TOTAL_WEEKS - currentWeek

  if (loading) return (
    <div className="space-y-3 pt-2 animate-pulse">
      {[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-card rounded-3xl" />)}
    </div>
  )

  return (
    <div className="space-y-3 pt-1 fade-up">

      <div className="py-1">
        <p className="text-muted text-xs font-dm">Season 1</p>
        <h1 className="font-kanit font-bold italic uppercase text-2xl text-white">TARGETS</h1>
      </div>

      {/* Streaks */}
      <div className="bg-card border border-border rounded-3xl p-4">
        <p className="font-kanit font-semibold text-sm text-white mb-3">CURRENT STREAKS</p>
        <div className="grid grid-cols-2 gap-2">
          <StreakCard emoji="💪" label="Workout" weeks={workoutStreak.current} best={workoutStreak.best} />
          <StreakCard emoji="🧘" label="Recovery" weeks={recoveryStreak.current} best={recoveryStreak.best} />
          <StreakCard emoji="🥗" label="Nutrition" weeks={nutritionStreak.current} best={nutritionStreak.best} />
          <StreakCard emoji="🤝" label="Social" weeks={socialStreak.current} best={socialStreak.best} />
        </div>
        {perfectStreak.current > 0 && (
          <div className="mt-2 bg-lime/10 border border-lime/20 rounded-2xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="font-kanit font-semibold text-sm text-lime">🌟 Perfect Week Streak</p>
              <p className="text-xs text-muted font-dm mt-0.5">11/11 points weeks in a row</p>
            </div>
            <p className="font-kanit font-bold text-2xl text-lime">{perfectStreak.current}</p>
          </div>
        )}
      </div>

      {/* Session counts */}
      <div className="bg-card border border-border rounded-3xl p-4">
        <p className="font-kanit font-semibold text-sm text-white mb-3">SESSIONS LOGGED</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <CountCard emoji="💪" label="Workouts" value={totalWorkouts} />
          <CountCard emoji="🧘" label="Recovery" value={totalRecovery} />
          <CountCard emoji="🤝" label="Social" value={totalSocial} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-soft rounded-2xl px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-muted font-dm">Total time</p>
            <p className="font-kanit font-semibold text-white text-sm">{formatMins(totalMinutes)}</p>
          </div>
          <div className="bg-soft rounded-2xl px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-muted font-dm">Nutrition wks</p>
            <p className="font-kanit font-semibold text-white text-sm">{weeksWithNutrition}/{TOTAL_WEEKS}</p>
          </div>
        </div>
        {topWorkout && (
          <div className="mt-2 bg-soft rounded-2xl px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-muted font-dm">Favourite workout</p>
            <p className="font-kanit font-semibold text-white text-sm">{topWorkout[0]} <span className="text-muted text-xs">×{topWorkout[1]}</span></p>
          </div>
        )}
      </div>

      {/* Points stats */}
      <div className="bg-card border border-border rounded-3xl p-4">
        <p className="font-kanit font-semibold text-sm text-white mb-3">POINTS</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-soft rounded-2xl p-3 text-center">
            <p className="text-muted text-xs font-dm">Total</p>
            <p className="font-kanit font-semibold text-xl text-lime leading-tight mt-0.5">{totalPoints}</p>
          </div>
          <div className="bg-soft rounded-2xl p-3 text-center">
            <p className="text-muted text-xs font-dm">Average</p>
            <p className="font-kanit font-semibold text-xl text-white leading-tight mt-0.5">{avgPoints}</p>
          </div>
          <div className="bg-soft rounded-2xl p-3 text-center">
            <p className="text-muted text-xs font-dm">Best week</p>
            <p className="font-kanit font-semibold text-xl text-white leading-tight mt-0.5">{bestWeek}</p>
          </div>
        </div>
      </div>

      {/* Weekly submission tracker */}
      <div className="bg-card border border-border rounded-3xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-kanit font-semibold text-sm text-white">SUBMISSION TRACKER</p>
          <p className="text-xs text-muted font-dm">{weeksLogged}/{TOTAL_WEEKS} weeks</p>
        </div>

        {/* Per-category week grid */}
        <div className="space-y-2.5">
          {[
            { label: '💪 Workout', key: 'workouts', check: s => s.workouts >= 1 },
            { label: '🧘 Recovery', key: 'recovery', check: s => s.recovery_sessions >= 1 },
            { label: '🤝 Social', key: 'social', check: s => s.social_sessions >= 1 },
            { label: '🥗 Nutrition', key: 'nutrition', check: s => s.nutrition_days >= 5 },
          ].map(({ label, key, check }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-muted font-dm">{label}</p>
                <p className="text-xs text-muted font-dm">
                  {submissions.filter(check).length}/{TOTAL_WEEKS}
                </p>
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map(w => {
                  const sub = submissions.find(s => s.week_number === w)
                  const done = sub && check(sub)
                  const isCurrent = w === currentWeek
                  const isFuture = w > currentWeek
                  return (
                    <div key={w} className={`flex-1 h-6 rounded-lg transition-all ${
                      isFuture ? 'bg-border opacity-30' :
                      done ? 'bg-lime' :
                      sub ? 'bg-red-900/40 border border-red-800/30' :
                      'bg-soft border border-dashed border-border'
                    }`} title={`Week ${w}`} />
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 mt-3 text-xs text-muted font-dm">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-lime inline-block" /> Done</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-red-900/40 border border-red-800/30 inline-block" /> Missed</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-soft border border-dashed border-border inline-block" /> Not logged</span>
        </div>
      </div>

      {/* Progress toward prize requirements */}
      <div className="bg-card border border-border rounded-3xl p-4">
        <p className="font-kanit font-semibold text-sm text-white mb-3">PRIZE REQUIREMENTS</p>
        <div className="space-y-3">
          {[
            { label: 'Recovery weeks', val: submissions.filter(s => s.recovery_sessions >= 1).length, target: 4 },
            { label: 'Nutrition weeks', val: submissions.filter(s => s.nutrition_days >= 5).length, target: 4 },
            { label: 'Weeks submitted', val: weeksLogged, target: TOTAL_WEEKS },
          ].map(({ label, val, target }) => {
            const pct = Math.min((val / target) * 100, 100)
            const done = val >= target
            return (
              <div key={label}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs text-muted font-dm">{label}</p>
                  <p className={`text-xs font-kanit font-semibold ${done ? 'text-lime' : 'text-white'}`}>{val}/{target}</p>
                </div>
                <div className="w-full h-1.5 bg-soft rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-lime' : 'bg-lime/50'}`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}

function StreakCard({ emoji, label, weeks, best }) {
  return (
    <div className={`bg-soft rounded-2xl p-3 flex items-center gap-3 border ${weeks > 0 ? 'border-lime/20' : 'border-border'}`}>
      <span className="text-xl">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted font-dm">{label}</p>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <p className={`font-kanit font-semibold text-xl leading-none ${weeks > 0 ? 'text-lime' : 'text-white'}`}>{weeks}</p>
          <p className="text-xs text-muted font-dm">wk{weeks !== 1 ? 's' : ''}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xs text-muted font-dm">best</p>
        <p className="font-kanit font-semibold text-sm text-white">{best}</p>
      </div>
    </div>
  )
}

function CountCard({ emoji, label, value }) {
  return (
    <div className="bg-soft rounded-2xl p-3 text-center">
      <p className="text-xl">{emoji}</p>
      <p className="font-kanit font-semibold text-2xl text-white leading-tight mt-1">{value}</p>
      <p className="text-xs text-muted font-dm mt-0.5">{label}</p>
    </div>
  )
}

function calcWeeklyStreak(submissions, checkFn) {
  const currentWeek = getCurrentWeek()
  let current = 0
  let best = 0
  let temp = 0

  // Go week by week
  for (let w = 1; w <= currentWeek; w++) {
    const sub = submissions.find(s => s.week_number === w)
    if (sub && checkFn(sub)) {
      temp++
      best = Math.max(best, temp)
    } else if (w < currentWeek) {
      temp = 0
    }
  }

  // Current streak = consecutive from latest week backwards
  current = 0
  for (let w = currentWeek; w >= 1; w--) {
    const sub = submissions.find(s => s.week_number === w)
    if (sub && checkFn(sub)) current++
    else break
  }

  return { current, best }
}

function formatMins(mins) {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
