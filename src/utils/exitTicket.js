import { getAcceptedAnswers, isFillBlankQuestion, matchesAcceptedAnswer } from './answerCheck'
import {
  ASSESSMENT_QUESTION_TYPES,
  gradeAssessmentResponse,
  prepareAssessmentQuestions,
  resolveAssessmentQuestionType,
} from './assessmentQuestions'
import { getLessonQuestions, getQuestionId } from './lessonContent'
import { getLessonBlocks } from './lessonSchema'
import { getModulePracticeQuestions } from './liveLessonFlow'
import { normalizeGameRoundToQuestion } from './gameQuestionSource'
import { normalizeRounds } from './mathGameRounds'

export const EXIT_TICKET_SECONDS = 60
export const EXIT_TICKET_ITEM_COUNT = 2
export const EXIT_TICKET_KIND = 'exit-ticket'

export const EXIT_TICKET_BANDS = {
  READY: 'ready',
  SHAKY: 'shaky',
  LOST: 'lost',
}

export function bandFromScore(scoreCorrect, scoreTotal = EXIT_TICKET_ITEM_COUNT, submitted = true) {
  if (!submitted) {
    return EXIT_TICKET_BANDS.LOST
  }
  const total = Math.max(Number(scoreTotal) || EXIT_TICKET_ITEM_COUNT, 1)
  const correct = Math.max(0, Math.min(Number(scoreCorrect) || 0, total))
  if (correct >= total) {
    return EXIT_TICKET_BANDS.READY
  }
  if (correct >= 1) {
    return EXIT_TICKET_BANDS.SHAKY
  }
  return EXIT_TICKET_BANDS.LOST
}

export function exitTicketBandLabel(band) {
  if (band === EXIT_TICKET_BANDS.READY) return 'Ready'
  if (band === EXIT_TICKET_BANDS.SHAKY) return 'Shaky'
  return 'Lost'
}

export function moduleSupportsExitTicket(module) {
  if (!module) return false
  const type = module.type
  if (type === 'final-test' || type === 'flashcard') return false
  return collectExitTicketPool(module).length > 0
}

function shuffleArray(items) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function cloneQuestion(question) {
  return JSON.parse(JSON.stringify(question))
}

function isQuizLikeQuestion(question) {
  if (!question) return false
  const type = resolveAssessmentQuestionType(question)
  return (
    type === ASSESSMENT_QUESTION_TYPES.MULTIPLE_CHOICE ||
    type === ASSESSMENT_QUESTION_TYPES.SHORT_ANSWER ||
    type === ASSESSMENT_QUESTION_TYPES.FILL_BLANK ||
    Array.isArray(question.options) ||
    getAcceptedAnswers(question).length > 0 ||
    isFillBlankQuestion(question)
  )
}

function normalizeLessonItem(question, index, source) {
  return {
    ...cloneQuestion(question),
    id: getQuestionId(question, index),
    source,
    sourceId: getQuestionId(question, index),
  }
}

/** Prefer quiz / assessment items; fall back to lesson practice; then game input/choice. */
export function collectExitTicketPool(module) {
  if (!module) return []

  if (module.type === 'quiz' && Array.isArray(module.questions)) {
    return module.questions
      .filter(isQuizLikeQuestion)
      .map((question, index) => normalizeLessonItem(question, index, 'quiz'))
  }

  if (module.type === 'math-game') {
    const rounds = normalizeRounds(module.rounds ?? module.config?.rounds ?? [])
    return rounds
      .map((round, index) => normalizeGameRoundToQuestion(round, index))
      .filter(Boolean)
  }

  if (module.type === 'interactive-lesson' || !module.type) {
    const quizShaped = []
    const practice = []
    const blocks = getLessonBlocks(module)
    const questions =
      blocks.length > 0 ? getModulePracticeQuestions(module) : getLessonQuestions(module)

    questions.forEach((question, index) => {
      const item = normalizeLessonItem(question, index, 'lesson')
      if (Array.isArray(question.options) && question.options.length >= 2) {
        quizShaped.push({ ...item, source: 'quiz-like' })
      } else {
        practice.push(item)
      }
    })

    const seen = new Set()
    const preferred = []
    for (const item of [...quizShaped, ...practice]) {
      const key = String(item.id)
      if (seen.has(key)) continue
      seen.add(key)
      preferred.push(item)
    }
    return preferred
  }

  if (Array.isArray(module.questions)) {
    return module.questions
      .filter(isQuizLikeQuestion)
      .map((question, index) => normalizeLessonItem(question, index, module.type || 'module'))
  }

  return []
}

/**
 * Lightly modify when safe: shuffle MC options. Numeric stem rewrites are
 * disabled because the answer often cannot be recomputed generically.
 */
export function lightlyModifyExitItem(item) {
  const next = cloneQuestion(item)
  next.modified = false

  const type = resolveAssessmentQuestionType(next)

  if (type === ASSESSMENT_QUESTION_TYPES.MULTIPLE_CHOICE && Array.isArray(next.options)) {
    const prepared = prepareAssessmentQuestions([next])[0]
    next.shuffledOptions = prepared.shuffledOptions
    next.modified = true
    return next
  }

  if (
    type === ASSESSMENT_QUESTION_TYPES.SHORT_ANSWER ||
    type === ASSESSMENT_QUESTION_TYPES.FILL_BLANK
  ) {
    const swapped = trySwapSimpleNumbers(next)
    if (swapped) {
      return swapped
    }
  }

  return next
}

function trySwapSimpleNumbers(_question) {
  // Do not rewrite numeric stems unless the answer can be recomputed. A token
  // replacement like "2 + 3" -> "3 + 3" silently leaves answer keys stale.
  return null
}

export function pickExitTicketItems(module, count = EXIT_TICKET_ITEM_COUNT) {
  const pool = collectExitTicketPool(module)
  if (pool.length === 0) {
    return []
  }

  const selected = shuffleArray(pool).slice(0, Math.min(count, pool.length))
  return selected.map((item, index) => {
    const modified = lightlyModifyExitItem(item)
    return {
      ...modified,
      exitIndex: index,
      exitItemId: `exit-ticket::${index}`,
    }
  })
}

function sanitizeShuffledOptions(options) {
  if (!Array.isArray(options)) {
    return null
  }
  return options.map(({ correct: _correct, isCorrect: _isCorrect, ...option }) => option)
}

function sanitizeBlanks(blanks) {
  if (!Array.isArray(blanks)) {
    return null
  }
  return blanks.map(({ accept: _accept, ...blank }) => blank)
}

export function serializeExitTicketItems(items = [], { includeAnswers = true } = {}) {
  return items.map((item) => {
    const serialized = {
      exitItemId: item.exitItemId,
      exitIndex: item.exitIndex,
      source: item.source,
      sourceId: item.sourceId,
      id: item.id,
      type: item.type,
      prompt: item.prompt,
      options: item.options ?? null,
      correctIndex: item.correctIndex ?? null,
      shuffledOptions: item.shuffledOptions ?? null,
      answer: item.answer ?? null,
      answers: item.answers ?? null,
      blanks: item.blanks ?? null,
      modified: Boolean(item.modified),
      modification: item.modification ?? null,
    }

    if (includeAnswers) {
      return serialized
    }

    return {
      ...serialized,
      correctIndex: null,
      shuffledOptions: sanitizeShuffledOptions(serialized.shuffledOptions),
      answer: null,
      answers: null,
      blanks: sanitizeBlanks(serialized.blanks),
    }
  })
}

export function serializeExitTicketAnswerKey(items = []) {
  return items.map((item) => ({
    exitItemId: item.exitItemId,
    source: item.source,
    sourceId: item.sourceId,
    id: item.id,
    type: item.type,
    correctIndex: item.correctIndex ?? null,
    shuffledOptions: item.shuffledOptions ?? null,
    answer: item.answer ?? null,
    answers: item.answers ?? null,
    blanks: item.blanks ?? null,
  }))
}

export function gradeExitTicketAnswer(item, payload) {
  if (!item) {
    return { isCorrect: false, selectedLabel: '' }
  }

  const type = resolveAssessmentQuestionType(item)

  if (type === ASSESSMENT_QUESTION_TYPES.MULTIPLE_CHOICE) {
    const response = {
      selectedIndex: payload?.selectedIndex,
      selectedOriginalIndex: payload?.selectedOriginalIndex,
    }
    const isCorrect = gradeAssessmentResponse(item, response)
    const label =
      item.shuffledOptions?.[payload?.selectedIndex]?.label ??
      item.options?.[payload?.selectedOriginalIndex] ??
      String(payload?.selectedLabel ?? '')
    return { isCorrect, selectedLabel: label }
  }

  if (type === ASSESSMENT_QUESTION_TYPES.FILL_BLANK) {
    const values = payload?.blankValues ?? []
    const isCorrect = gradeAssessmentResponse(item, { blankValues: values })
    return { isCorrect, selectedLabel: values.join(', ') }
  }

  const typed = String(payload?.typedAnswer ?? payload?.attempt ?? '')
  const accepted = getAcceptedAnswers(item)
  const isCorrect =
    accepted.length > 0
      ? matchesAcceptedAnswer(typed, accepted)
      : gradeAssessmentResponse(item, { typedAnswer: typed })
  return { isCorrect, selectedLabel: typed }
}

export function buildExitTicketResult(items, answersByItemId, { elapsedSec = 0, submitted = true } = {}) {
  const answers = (items ?? []).map((item) => {
    const payload = answersByItemId?.[item.exitItemId] ?? null
    if (!payload) {
      return {
        questionId: item.exitItemId,
        sourceId: item.sourceId,
        prompt: item.prompt,
        type: item.type,
        correct: false,
        attempt: '',
        unanswered: true,
      }
    }
    const graded = gradeExitTicketAnswer(item, payload)
    return {
      questionId: item.exitItemId,
      sourceId: item.sourceId,
      prompt: item.prompt,
      type: item.type,
      correct: graded.isCorrect,
      attempt: graded.selectedLabel,
      unanswered: false,
    }
  })

  const scoreCorrect = answers.filter((row) => row.correct).length
  const scoreTotal = Math.max(answers.length, 1)
  const band = bandFromScore(scoreCorrect, scoreTotal, submitted)

  return {
    kind: EXIT_TICKET_KIND,
    itemIds: (items ?? []).map((item) => item.exitItemId),
    sourceIds: (items ?? []).map((item) => item.sourceId),
    answers,
    scoreCorrect,
    scoreTotal,
    band,
    elapsedSec: Math.max(0, Math.floor(Number(elapsedSec) || 0)),
    submitted: Boolean(submitted),
    completedAt: new Date().toISOString(),
  }
}

export function seenExitTicketStorageKey(uid, courseId, moduleId) {
  return `provenmath-exit-ticket:${uid || 'guest'}:${courseId}:${moduleId}`
}

export function hasSeenExitTicket(uid, courseId, moduleId) {
  try {
    return localStorage.getItem(seenExitTicketStorageKey(uid, courseId, moduleId)) === '1'
  } catch {
    return false
  }
}

export function markExitTicketSeen(uid, courseId, moduleId) {
  try {
    localStorage.setItem(seenExitTicketStorageKey(uid, courseId, moduleId), '1')
  } catch {
    /* ignore */
  }
}

export function aggregateExitTicketHeat(presenceRows = [], responseRows = [], itemCount = 2) {
  const byUid = new Map()

  for (const row of presenceRows) {
    if (!row?.uid) continue
    byUid.set(row.uid, {
      uid: row.uid,
      displayName: row.displayName || row.email || 'Student',
      band: EXIT_TICKET_BANDS.LOST,
      scoreCorrect: 0,
      scoreTotal: itemCount,
      submitted: false,
    })
  }

  for (const row of responseRows) {
    if (!row?.uid) continue
    if (row.questionId !== 'exit-ticket' && row.kind !== EXIT_TICKET_KIND) {
      continue
    }
    const scoreCorrect = Number(row.scoreCorrect ?? 0)
    const scoreTotal = Number(row.scoreTotal ?? itemCount) || itemCount
    const band = row.band || bandFromScore(scoreCorrect, scoreTotal, true)
    byUid.set(row.uid, {
      uid: row.uid,
      displayName: row.displayName || row.email || byUid.get(row.uid)?.displayName || 'Student',
      band,
      scoreCorrect,
      scoreTotal,
      submitted: true,
    })
  }

  const students = [...byUid.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  )

  const counts = {
    ready: students.filter((s) => s.band === EXIT_TICKET_BANDS.READY).length,
    shaky: students.filter((s) => s.band === EXIT_TICKET_BANDS.SHAKY).length,
    lost: students.filter((s) => s.band === EXIT_TICKET_BANDS.LOST).length,
  }

  return { students, counts }
}
