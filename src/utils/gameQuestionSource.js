import { fetchModuleContent } from '../services/contentLoader'
import { flattenModules } from './courseOutline'
import { normalizeRounds } from './mathGameRounds'
import { isGameCatalogOutlineModule } from './moduleImport'

const MAX_AI_GAME_SAMPLES = 12

/**
 * Convert a math-game round into a lesson/worksheet-shaped question.
 * Supports choice, true-false, and input rounds; other kinds return null.
 */
export function normalizeGameRoundToQuestion(round, index = 0) {
  const kind = round?.kind
  if (kind === 'choice' || kind === 'true-false') {
    const choices = Array.isArray(round.choices) ? round.choices : []
    const correctIndex = Math.max(
      0,
      choices.findIndex((choice) => choice.id === round.correctId),
    )
    return {
      id: round.id ?? `game-q${index + 1}`,
      source: 'math-game',
      sourceId: round.id ?? `game-q${index + 1}`,
      type: 'multiple-choice',
      prompt: round.prompt ?? round.question ?? '',
      options: choices.map((choice) => choice.label),
      correctIndex: correctIndex >= 0 ? correctIndex : 0,
      feedbackIfWrong: round.feedbackIfWrong ?? '',
      hints: round.hints ?? [],
      difficulty: round.difficulty,
    }
  }

  if (kind === 'input') {
    const accepted = Array.isArray(round.accept)
      ? round.accept
      : round.answer != null
        ? [round.answer]
        : []
    return {
      id: round.id ?? `game-q${index + 1}`,
      source: 'math-game',
      sourceId: round.id ?? `game-q${index + 1}`,
      type: 'short-answer',
      prompt: round.prompt ?? round.question ?? '',
      answer: accepted[0] ?? '',
      answers: accepted,
      hints: round.hints ?? [],
      difficulty: round.difficulty,
    }
  }

  return null
}

export function extractGameQuestionsFromContent(moduleContent) {
  if (!moduleContent) {
    return []
  }

  const rounds = normalizeRounds(moduleContent.rounds ?? moduleContent.config?.rounds ?? [])
  return rounds.map((round, index) => normalizeGameRoundToQuestion(round, index)).filter(Boolean)
}

/** Outline rows for math-game modules in the same subchapter as moduleId. */
export function findLinkedGamesInSameSubchapter(outline, moduleId) {
  if (!outline || !moduleId) {
    return []
  }

  const modules = flattenModules(outline)
  const current = modules.find((row) => row.id === moduleId)
  if (!current?.subchapterId) {
    return []
  }

  return modules.filter(
    (row) =>
      row.subchapterId === current.subchapterId &&
      row.type === 'math-game' &&
      row.id !== moduleId,
  )
}

/** When scope is a single module, also include sibling games in that subchapter. */
export function expandModuleIdsWithSiblingGames(outline, moduleIds) {
  const next = new Set(moduleIds ?? [])
  if (!outline || next.size === 0) {
    return next
  }

  const modules = flattenModules(outline)
  const selected = modules.filter((row) => next.has(row.id))
  const subchapterIds = new Set(selected.map((row) => row.subchapterId).filter(Boolean))

  for (const row of modules) {
    if (row.type === 'math-game' && subchapterIds.has(row.subchapterId)) {
      next.add(row.id)
    }
  }

  return next
}

function formatChoiceAnswer(question) {
  if (!Array.isArray(question.options) || question.options.length === 0) {
    return ''
  }
  const index = question.correctIndex ?? 0
  const letter = String.fromCharCode(65 + index)
  return `${letter}. ${question.options[index] ?? ''}`
}

function formatQuestionForAi(question, gameTitle, { includeAnswers = true } = {}) {
  const title = gameTitle ? `[${gameTitle}] ` : ''
  const prompt = String(question.prompt ?? '').trim()
  if (!prompt) {
    return ''
  }

  if (question.type === 'multiple-choice' && Array.isArray(question.options)) {
    const choices = question.options
      .map((option, index) => `${String.fromCharCode(65 + index)}) ${option}`)
      .join('; ')
    const answer = includeAnswers ? formatChoiceAnswer(question) : ''
    return `${title}${prompt} | Choices: ${choices}${answer ? ` | Answer: ${answer}` : ''}`
  }

  const answer = includeAnswers
    ? (Array.isArray(question.answers) && question.answers[0]) || question.answer || ''
    : ''
  return `${title}${prompt}${answer ? ` | Answer: ${answer}` : ''}`
}

/**
 * Build a compact text block of linked-game questions for AI prompts.
 * Returns '' when no usable rounds exist (callers keep current behavior).
 */
export function formatGameQuestionsForAiContext(
  samples,
  { maxSamples = MAX_AI_GAME_SAMPLES, includeAnswers = true } = {},
) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return ''
  }

  const lines = samples
    .slice(0, maxSamples)
    .map((item) => formatQuestionForAi(item.question, item.gameTitle, { includeAnswers }))
    .filter(Boolean)

  if (lines.length === 0) {
    return ''
  }

  return [
    'Linked game questions from this section (use as style and topic samples; create NEW problems — do not copy verbatim):',
    ...lines.map((line, index) => `${index + 1}. ${line}`),
  ].join('\n')
}

/**
 * Load rounds from math-game outline modules (catalog or inlined).
 */
export async function loadGameQuestionSamples({
  courseId,
  gameModules,
  maxSamples = MAX_AI_GAME_SAMPLES,
} = {}) {
  if (!courseId || !Array.isArray(gameModules) || gameModules.length === 0) {
    return []
  }

  const samples = []

  for (const gameMeta of gameModules) {
    if (samples.length >= maxSamples) {
      break
    }
    try {
      const content = await fetchModuleContent(courseId, gameMeta.id, {
        contentSource: gameMeta.contentSource,
        moduleType: gameMeta.type ?? 'math-game',
      })
      const questions = extractGameQuestionsFromContent(content)
      for (const question of questions) {
        if (samples.length >= maxSamples) {
          break
        }
        samples.push({
          gameId: gameMeta.id,
          gameTitle: gameMeta.title ?? gameMeta.id,
          question,
        })
      }
    } catch {
      /* skip missing catalog payloads */
    }
  }

  return samples
}

/** Same-subchapter linked games for a lesson/quiz module → AI context string. */
export async function buildLinkedGameAiContext({
  courseId,
  outline,
  moduleId,
  maxSamples = MAX_AI_GAME_SAMPLES,
  includeAnswers = true,
} = {}) {
  const games = findLinkedGamesInSameSubchapter(outline, moduleId)
  if (games.length === 0) {
    return ''
  }

  const samples = await loadGameQuestionSamples({
    courseId,
    gameModules: games,
    maxSamples,
  })
  return formatGameQuestionsForAiContext(samples, { maxSamples, includeAnswers })
}

export function isLinkedGameOutlineModule(module) {
  return module?.type === 'math-game' || isGameCatalogOutlineModule(module)
}
