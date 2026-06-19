export const MAX_HEARTS = 3

export function calculateXp(hintsUsed) {
  return Math.max(5, 15 - hintsUsed * 5)
}

export const BADGES = {
  'first-lesson': { id: 'first-lesson', label: 'First Steps', description: 'Complete your first module' },
  'five-modules': { id: 'five-modules', label: 'On a Roll', description: 'Complete 5 modules' },
  'streak-3': { id: 'streak-3', label: '3-Day Streak', description: 'Practice 3 days in a row' },
  'streak-7': { id: 'streak-7', label: 'Week Warrior', description: 'Practice 7 days in a row' },
  'quiz-ace': { id: 'quiz-ace', label: 'Quiz Ace', description: 'Complete a quiz' },
  'no-hints': { id: 'no-hints', label: 'No Hints Needed', description: 'Complete a module without hints' },
}

export function getTodayDateString() {
  return new Date().toISOString().slice(0, 10)
}

export function computeStreak(lastActiveDate, currentStreak) {
  if (!lastActiveDate) {
    return 1
  }

  const today = getTodayDateString()
  if (lastActiveDate === today) {
    return currentStreak
  }

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)

  if (lastActiveDate === yesterdayStr) {
    return currentStreak + 1
  }

  return 1
}

export function evaluateBadges(state, { hintsUsed, moduleType }) {
  const earned = new Set(state.badges ?? [])
  const completed = state.modulesCompleted ?? 0

  if (completed >= 1) {
    earned.add('first-lesson')
  }
  if (completed >= 5) {
    earned.add('five-modules')
  }
  if (state.streak >= 3) {
    earned.add('streak-3')
  }
  if (state.streak >= 7) {
    earned.add('streak-7')
  }
  if (moduleType === 'quiz') {
    earned.add('quiz-ace')
  }
  if (hintsUsed === 0) {
    earned.add('no-hints')
  }

  return [...earned]
}

export const defaultGamificationState = () => ({
  xp: 0,
  hearts: MAX_HEARTS,
  streak: 0,
  lastActiveDate: null,
  badges: [],
  modulesCompleted: 0,
})
