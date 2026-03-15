export const LANES = {
  performance: {
    key: 'performance',
    label: 'Performance',
    emoji: '🔥',
    description: 'Already training consistently',
    color: '#FF6B35',
    bg: 'bg-orange/10',
    border: 'border-orange/40',
    text: 'text-orange',
  },
  momentum: {
    key: 'momentum',
    label: 'Momentum',
    emoji: '⚡',
    description: 'Building consistency',
    color: '#FFD60A',
    bg: 'bg-yellow-400/10',
    border: 'border-yellow-400/40',
    text: 'text-yellow-400',
  },
  foundation: {
    key: 'foundation',
    label: 'Foundation',
    emoji: '🧱',
    description: 'Getting back into routine',
    color: '#4DABF7',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/40',
    text: 'text-blue-400',
  },
  return_strong: {
    key: 'return_strong',
    label: 'Return Strong',
    emoji: '💪',
    description: 'Coming back from injury or a break',
    color: '#69DB7C',
    bg: 'bg-green-400/10',
    border: 'border-green-400/40',
    text: 'text-green-400',
  },
}

export function getLane(key) {
  return LANES[key] || null
}

export const LANE_LIST = Object.values(LANES)

// Prize eligibility helpers
export const PRIZE_RULES = {
  maxMissedWeeks: 1,       // miss 2 = out
  minRecoveryWeeks: 4,
  minNutritionWeeks: 4,
  totalWeeks: 6,
}

export function getEligibilityStatus(data) {
  const { weeks_missed, recovery_weeks, nutrition_weeks, current_week } = data
  const needed = Math.min(current_week, PRIZE_RULES.minRecoveryWeeks)
  const issues = []

  if (weeks_missed >= 2) issues.push(`Missed ${weeks_missed} weeks — prize eligibility lost`)
  else if (weeks_missed === 1) issues.push('1 week missed — 1 more and prize eligibility is lost')

  if (recovery_weeks < needed) issues.push(`${recovery_weeks}/${needed} recovery weeks logged`)
  if (nutrition_weeks < needed) issues.push(`${nutrition_weeks}/${needed} nutrition weeks logged`)

  const eligible = weeks_missed < 2
  return { eligible, issues }
}
