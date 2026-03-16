export const CHALLENGE_START = new Date('2026-03-16T00:00:00')
export const TOTAL_WEEKS = 6

export function getCurrentWeek() {
  const now = new Date()
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const diff = Math.floor((now - CHALLENGE_START) / msPerWeek)
  return Math.min(Math.max(diff + 1, 1), TOTAL_WEEKS)
}

export function getWeekLabel(weekNum) {
  const start = new Date(CHALLENGE_START)
  start.setDate(start.getDate() + (weekNum - 1) * 7)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${fmt(start)} – ${fmt(end)}`
}

export function getWeekDeadline(weekNum) {
  const d = new Date(CHALLENGE_START)
  d.setDate(d.getDate() + weekNum * 7 - 1) // Sunday of that week
  d.setHours(20, 0, 0, 0)
  return d
}

export function calculatePoints({ workouts, recovery_sessions, social_sessions, nutrition_days }) {
  let pts = 0

  // Workouts (max 6)
  if (workouts >= 3) pts += 6
  else if (workouts === 2) pts += 4
  else if (workouts === 1) pts += 2

  // Recovery (max 1)
  if (recovery_sessions >= 1) pts += 1

  // Social (max 1)
  if (social_sessions >= 1) pts += 1

  // Nutrition (max 2) — counts days where goal was met
  if (nutrition_days >= 6) pts += 2
  else if (nutrition_days >= 5) pts += 1

  // Balanced week bonus (max 1)
  const balanced = workouts >= 1 && recovery_sessions >= 1 && social_sessions >= 1 && nutrition_days >= 5
  if (balanced) pts += 1

  return Math.min(pts, 11)
}

export function breakdownPoints({ workouts, recovery_sessions, social_sessions, nutrition_days }) {
  const workout_pts = workouts >= 3 ? 6 : workouts === 2 ? 4 : workouts === 1 ? 2 : 0
  const recovery_pts = recovery_sessions >= 1 ? 1 : 0
  const social_pts = social_sessions >= 1 ? 1 : 0
  const nutrition_pts = nutrition_days >= 6 ? 2 : nutrition_days >= 5 ? 1 : 0
  const balanced = workouts >= 1 && recovery_sessions >= 1 && social_sessions >= 1 && nutrition_days >= 5
  const bonus_pts = balanced ? 1 : 0
  return { workout_pts, recovery_pts, social_pts, nutrition_pts, bonus_pts }
}

export function getMedalColor(rank) {
  if (rank === 1) return 'text-yellow-400'
  if (rank === 2) return 'text-gray-300'
  if (rank === 3) return 'text-amber-600'
  return 'text-muted'
}

export function getMedalEmoji(rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}
