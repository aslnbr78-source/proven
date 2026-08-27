import {
  clampDifficulty,
  DEFAULT_START_DIFFICULTY,
  difficultyLabel,
  masteryToStartDifficulty,
} from './adaptiveEngine'

const MODULE_DEFAULT_DIFFICULTY = {
  'interactive-lesson': 2,
  'math-game': 2,
  quiz: 3,
  'final-test': 4,
  'adaptive-mastery': 3,
}

/**
 * Resolve difficulty 1–5 for any question. Uses explicit tag when present;
 * otherwise infers from module type and position within the module.
 */
export function resolveQuestionDifficulty(question, { moduleType, index = 0, total = 1 } = {}) {
  if (question?.difficulty != null && Number.isFinite(Number(question.difficulty))) {
    return clampDifficulty(question.difficulty)
  }

  const base = MODULE_DEFAULT_DIFFICULTY[moduleType] ?? DEFAULT_START_DIFFICULTY

  if (total > 1) {
    const progress = index / (total - 1)
    const offset = Math.round(progress * 2) - 1
    return clampDifficulty(base + offset)
  }

  return clampDifficulty(base)
}

export function abilityToDifficultyProfile(mastery) {
  if (mastery == null || Number.isNaN(Number(mastery))) {
    return null
  }
  if (mastery < 0.45) {
    return 'intervention'
  }
  if (mastery > 0.75) {
    return 'stretch'
  }
  return 'on-level'
}

export function centeredDifficultyMix(centerLevel) {
  const center = clampDifficulty(centerLevel)
  const weights = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

  for (let level = 1; level <= 5; level += 1) {
    const distance = Math.abs(level - center)
    if (distance === 0) {
      weights[level] = 0.4
    } else if (distance === 1) {
      weights[level] = 0.25
    } else if (distance === 2) {
      weights[level] = 0.08
    } else {
      weights[level] = 0.02
    }
  }

  return normalizeDifficultyMix(weights)
}

export function normalizeDifficultyMix(mix) {
  const total = [1, 2, 3, 4, 5].reduce((sum, level) => sum + Math.max(0, mix[level] ?? 0), 0)
  if (total <= 0) {
    return { 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 }
  }

  return Object.fromEntries(
    [1, 2, 3, 4, 5].map((level) => [level, Math.max(0, mix[level] ?? 0) / total]),
  )
}

export { difficultyLabel, masteryToStartDifficulty }
