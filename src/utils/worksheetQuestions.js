import { extractGameQuestionsFromContent } from './gameQuestionSource'
import { getLessonQuestions } from './lessonContent'
import { difficultyLabel, resolveQuestionDifficulty } from './questionDifficulty'
import {
  describeMixTargets,
  DISPLAY_FORMATS,
  MIX_MODES,
  nativeDisplayFormat,
  resolveMixTargets,
} from './worksheetMixRules'
import {
  describeDifficultyTargets,
  difficultyTargetsToLevels,
  DIFFICULTY_MODES,
  resolveDifficultyTargets,
} from './worksheetDifficultyRules'

export const WORKSHEET_TYPES = {
  PRACTICE: 'practice',
  QUIZ: 'quiz',
  TEST: 'test',
}

export const WORKSHEET_TYPE_LABELS = {
  [WORKSHEET_TYPES.PRACTICE]: 'Practice',
  [WORKSHEET_TYPES.QUIZ]: 'Quiz',
  [WORKSHEET_TYPES.TEST]: 'Test',
}

const MODULE_TYPE_ORDER = {
  [WORKSHEET_TYPES.PRACTICE]: [
    'interactive-lesson',
    'math-game',
    'adaptive-mastery',
    'quiz',
    'final-test',
  ],
  [WORKSHEET_TYPES.QUIZ]: [
    'quiz',
    'interactive-lesson',
    'math-game',
    'adaptive-mastery',
    'final-test',
  ],
  [WORKSHEET_TYPES.TEST]: [
    'final-test',
    'quiz',
    'adaptive-mastery',
    'interactive-lesson',
    'math-game',
  ],
}

const QUESTION_MODULE_TYPES = new Set([
  'interactive-lesson',
  'quiz',
  'final-test',
  'adaptive-mastery',
  'math-game',
])

export function stripContentMarkup(text) {
  return String(text ?? '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[kw:([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .trim()
}

function inferQuestionType(question) {
  if (Array.isArray(question.options) && question.options.length > 0) {
    return 'multiple-choice'
  }
  if (question.type === 'fill-blank' || question.prompt?.includes('___')) {
    return 'fill-blank'
  }
  return question.type ?? 'short-answer'
}

function formatAnswer(question) {
  const type = inferQuestionType(question)

  if (type === 'multiple-choice' && Array.isArray(question.options)) {
    const index = question.correctIndex ?? 0
    const letter = String.fromCharCode(65 + index)
    return `${letter}. ${stripContentMarkup(question.options[index] ?? '')}`
  }

  if (type === 'fill-blank' && Array.isArray(question.blanks)) {
    return question.blanks
      .map((blank) => (blank.accept ?? []).join(' / '))
      .filter(Boolean)
      .join('; ')
  }

  if (Array.isArray(question.answers) && question.answers.length > 0) {
    return question.answers.map(stripContentMarkup).join(' / ')
  }

  if (type === 'multiple-choice' && Array.isArray(question.options)) {
    return stripContentMarkup(question.options[question.correctIndex ?? 0] ?? '')
  }

  return ''
}

export function normalizeWorksheetQuestion(question, moduleMeta, index, totalInModule = 1) {
  const type = inferQuestionType(question)
  const difficulty = resolveQuestionDifficulty(question, {
    moduleType: moduleMeta.moduleType,
    index,
    total: totalInModule,
  })

  return {
    id: question.id ?? `${moduleMeta.moduleId}-q${index + 1}`,
    prompt: stripContentMarkup(question.prompt),
    type,
    displayFormat: nativeDisplayFormat({ type, prompt: stripContentMarkup(question.prompt) }),
    options: (question.options ?? []).map(stripContentMarkup),
    correctIndex: question.correctIndex ?? 0,
    answer: formatAnswer(question),
    difficulty,
    difficultyLabel: difficultyLabel(difficulty),
    difficultyTagged: question.difficulty != null && Number.isFinite(Number(question.difficulty)),
    moduleId: moduleMeta.moduleId,
    moduleTitle: moduleMeta.moduleTitle,
    moduleType: moduleMeta.moduleType,
    chapterTitle: moduleMeta.chapterTitle,
    subchapterTitle: moduleMeta.subchapterTitle,
    standards: moduleMeta.standards ?? [],
  }
}

export function extractQuestionsFromModule(moduleContent, moduleMeta) {
  if (!moduleContent || !QUESTION_MODULE_TYPES.has(moduleMeta.moduleType)) {
    return []
  }

  const rows = []

  if (moduleMeta.moduleType === 'math-game') {
    const gameQuestions = extractGameQuestionsFromContent(moduleContent, {
      moduleId: moduleMeta.moduleId,
      namespaceIds: true,
    })
    gameQuestions.forEach((question, index) => {
      rows.push(normalizeWorksheetQuestion(question, moduleMeta, index, gameQuestions.length))
    })
    return rows
  }

  if (moduleMeta.moduleType === 'adaptive-mastery' && Array.isArray(moduleContent.bank)) {
    const total = moduleContent.bank.length
    moduleContent.bank.forEach((question, index) => {
      rows.push(normalizeWorksheetQuestion(question, moduleMeta, index, total))
    })
    return rows
  }

  const lessonQuestions = getLessonQuestions(moduleContent)
  lessonQuestions.forEach((question, index) => {
    rows.push(normalizeWorksheetQuestion(question, moduleMeta, index, lessonQuestions.length))
  })

  return rows
}

function moduleTypeRank(moduleType, worksheetType) {
  const order = MODULE_TYPE_ORDER[worksheetType] ?? MODULE_TYPE_ORDER[WORKSHEET_TYPES.PRACTICE]
  const index = order.indexOf(moduleType)
  return index === -1 ? order.length : index
}

export function sortQuestionsByWorksheetType(questions, worksheetType) {
  return [...questions].sort((a, b) => {
    const rankDiff = moduleTypeRank(a.moduleType, worksheetType) - moduleTypeRank(b.moduleType, worksheetType)
    if (rankDiff !== 0) {
      return rankDiff
    }
    return a.moduleTitle.localeCompare(b.moduleTitle)
  })
}

function shuffleArray(items) {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }
  return next
}

function prioritizePool(questions, priorityModuleIds) {
  return [
    ...shuffleArray(questions.filter((row) => priorityModuleIds.has(row.moduleId))),
    ...shuffleArray(questions.filter((row) => !priorityModuleIds.has(row.moduleId))),
  ]
}

function mcqCorrectAnswer(question) {
  return stripContentMarkup(question.options?.[question.correctIndex ?? 0] ?? question.answer ?? '')
}

export function convertMcqToProblemSolving(question) {
  let prompt = question.prompt
    .replace(/^What is (the )?/i, 'Find the ')
    .replace(/^Which (equation|expression|line|value|graph)/i, 'Determine the $1')
    .replace(/^Solve for \$?x\$?:?\s*/i, 'Solve for $x$. ')
    .replace(/\?\s*$/, '. Show your work.')

  if (!/show your work/i.test(prompt)) {
    prompt = `${prompt.replace(/\.\s*$/, '')}. Explain your reasoning.`
  }

  return {
    ...question,
    displayFormat: DISPLAY_FORMATS.PROBLEM_SOLVING,
    type: 'short-answer',
    prompt,
    answer: mcqCorrectAnswer(question),
    transformedFrom: DISPLAY_FORMATS.MULTIPLE_CHOICE,
  }
}

export function convertMcqToFillBlank(question) {
  const answer = mcqCorrectAnswer(question)
  let prompt = question.prompt

  if (/^What is (the )?/i.test(prompt)) {
    const topic = prompt
      .replace(/^What is (the )?/i, '')
      .replace(/\?\s*$/, '')
      .trim()
    prompt = `${topic.charAt(0).toUpperCase()}${topic.slice(1)} is ___.`
  } else if (/^Which/i.test(prompt)) {
    prompt = prompt.replace(/\?\s*$/, '. Record your answer: ___.')
  } else if (/^Solve/i.test(prompt)) {
    prompt = prompt.includes('___')
      ? prompt
      : prompt.replace(/\?\s*$/, ' The solution is $x =$ ___.')
  } else if (!prompt.includes('___')) {
    prompt = prompt.replace(/\?\s*$/, ' Answer: ___.')
  }

  return {
    ...question,
    displayFormat: DISPLAY_FORMATS.FILL_BLANK,
    type: 'fill-blank',
    prompt,
    answer,
    transformedFrom: DISPLAY_FORMATS.MULTIPLE_CHOICE,
  }
}

function applyDisplayFormat(question, format) {
  if (format === DISPLAY_FORMATS.MULTIPLE_CHOICE) {
    return {
      ...question,
      displayFormat: DISPLAY_FORMATS.MULTIPLE_CHOICE,
      type: 'multiple-choice',
    }
  }

  if (format === DISPLAY_FORMATS.FILL_BLANK) {
    if (question.type === 'fill-blank' || question.prompt.includes('___')) {
      return { ...question, displayFormat: DISPLAY_FORMATS.FILL_BLANK, type: 'fill-blank' }
    }
    if (question.type === 'multiple-choice') {
      return convertMcqToFillBlank(question)
    }
    const prompt = question.prompt.includes('___')
      ? question.prompt
      : `${question.prompt.replace(/\.\s*$/, '')} Answer: ___.`
    return {
      ...question,
      displayFormat: DISPLAY_FORMATS.FILL_BLANK,
      type: 'fill-blank',
      prompt,
    }
  }

  if (question.type === 'multiple-choice') {
    return convertMcqToProblemSolving(question)
  }

  return {
    ...question,
    displayFormat: DISPLAY_FORMATS.PROBLEM_SOLVING,
    type: 'short-answer',
  }
}

function pickFromPool(pool, seen, format, difficulty, { allowTransform = true } = {}) {
  const available = pool.filter((question) => !seen.has(question.id))
  const tiers = [
    (question) => nativeDisplayFormat(question) === format && question.difficulty === difficulty,
    (question) => question.difficulty === difficulty,
    (question) =>
      nativeDisplayFormat(question) === format &&
      Math.abs(question.difficulty - difficulty) === 1,
    (question) => Math.abs(question.difficulty - difficulty) === 1,
    (question) => nativeDisplayFormat(question) === format,
    () => true,
  ]

  for (const match of tiers) {
    const candidates = available.filter(match)
    if (candidates.length === 0) {
      continue
    }

    const picked = candidates[Math.floor(Math.random() * candidates.length)]
    seen.add(picked.id)
    const formatted = applyDisplayFormat(picked, format)
    return {
      ...formatted,
      difficulty: picked.difficulty,
      difficultyLabel: picked.difficultyLabel ?? difficultyLabel(picked.difficulty),
      difficultyTagged: picked.difficultyTagged,
    }
  }

  if (!allowTransform) {
    return null
  }

  for (const question of available) {
    if (question.type !== 'multiple-choice') {
      continue
    }
    seen.add(question.id)
    const formatted = applyDisplayFormat(question, format)
    return {
      ...formatted,
      difficulty: question.difficulty,
      difficultyLabel: question.difficultyLabel ?? difficultyLabel(question.difficulty),
      difficultyTagged: question.difficultyTagged,
    }
  }

  return null
}

export function countQuestionsByDifficulty(questions) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let tagged = 0

  for (const question of questions) {
    counts[question.difficulty] = (counts[question.difficulty] ?? 0) + 1
    if (question.difficultyTagged) {
      tagged += 1
    }
  }

  return { counts, tagged, total: questions.length }
}

export function countQuestionsByFormat(questions) {
  const counts = {
    [DISPLAY_FORMATS.MULTIPLE_CHOICE]: 0,
    [DISPLAY_FORMATS.PROBLEM_SOLVING]: 0,
    [DISPLAY_FORMATS.FILL_BLANK]: 0,
  }

  for (const question of questions) {
    counts[nativeDisplayFormat(question)] += 1
  }

  return counts
}

export function sampleWorksheetQuestions(
  questions,
  count,
  {
    priorityModuleIds = new Set(),
    worksheetType = WORKSHEET_TYPES.QUIZ,
    standardCodes = [],
    customTargets = null,
    mixMode = MIX_MODES.DEFAULT,
    difficultyMode = DIFFICULTY_MODES.DEFAULT,
    difficultyProfile = 'on-level',
    abilityLevel = null,
    customDifficultyTargets = null,
  } = {},
) {
  const pool = prioritizePool(sortQuestionsByWorksheetType(questions, worksheetType), priorityModuleIds)

  if (pool.length === 0) {
    return {
      questions: [],
      mix: null,
      mixDescription: '',
      difficultyMix: null,
      difficultyDescription: '',
      total: 0,
      error: 'No questions found in scope.',
    }
  }

  const resolved = resolveMixTargets({
    mode: mixMode,
    totalCount: count,
    customTargets,
    worksheetType,
    standardCodes,
    poolSize: pool.length,
  })

  if (!resolved.targets) {
    return {
      questions: [],
      mix: null,
      mixDescription: '',
      difficultyMix: null,
      difficultyDescription: '',
      total: 0,
      error: resolved.error,
    }
  }

  const targets = resolved.targets
  const targetTotal = targets.multipleChoice + targets.problemSolving + targets.fillBlank

  const resolvedDifficulty = resolveDifficultyTargets({
    mode: difficultyMode,
    totalCount: targetTotal,
    customTargets: customDifficultyTargets,
    worksheetType,
    profile: difficultyProfile,
    abilityLevel,
    poolSize: pool.length,
  })

  if (!resolvedDifficulty.targets) {
    return {
      questions: [],
      mix: null,
      mixDescription: '',
      difficultyMix: null,
      difficultyDescription: '',
      total: 0,
      error: resolvedDifficulty.error,
    }
  }

  const difficultyTargets = resolvedDifficulty.targets
  const seen = new Set()
  const selected = []

  const formatSlots = shuffleArray([
    ...Array.from({ length: targets.multipleChoice }, () => DISPLAY_FORMATS.MULTIPLE_CHOICE),
    ...Array.from({ length: targets.problemSolving }, () => DISPLAY_FORMATS.PROBLEM_SOLVING),
    ...Array.from({ length: targets.fillBlank }, () => DISPLAY_FORMATS.FILL_BLANK),
  ])
  const difficultySlots = shuffleArray(difficultyTargetsToLevels(difficultyTargets))

  for (let index = 0; index < formatSlots.length; index += 1) {
    const format = formatSlots[index]
    const difficulty = difficultySlots[index] ?? difficultySlots[index % difficultySlots.length] ?? 3
    const picked = pickFromPool(pool, seen, format, difficulty)
    if (picked) {
      selected.push(picked)
    }
  }

  for (const question of pool) {
    if (selected.length >= targetTotal || seen.has(question.id)) {
      continue
    }
    seen.add(question.id)
    const formatted = applyDisplayFormat(question, nativeDisplayFormat(question))
    selected.push({
      ...formatted,
      difficulty: question.difficulty,
      difficultyLabel: question.difficultyLabel ?? difficultyLabel(question.difficulty),
      difficultyTagged: question.difficultyTagged,
    })
  }

  return {
    questions: shuffleArray(selected),
    mix: targets,
    mixDescription: describeMixTargets(targets),
    difficultyMix: difficultyTargets,
    difficultyDescription: describeDifficultyTargets(difficultyTargets),
    total: selected.length,
    error: null,
  }
}

export function buildWorksheetTitle({ worksheetType, scopeLabel, courseTitle }) {
  const typeLabel = WORKSHEET_TYPE_LABELS[worksheetType] ?? 'Worksheet'
  const scope = scopeLabel && scopeLabel !== 'Whole course' ? scopeLabel : courseTitle
  return `${scope} — ${typeLabel} Worksheet`
}

export {
  describeMixTargets,
  DISPLAY_FORMATS,
  MIX_MODES,
  resolveWorksheetMix,
  WORKSHEET_FORMAT_OPTIONS,
} from './worksheetMixRules'
export {
  computeDifficultyTargets,
  describeDifficultyProfile,
  describeDifficultyTargets,
  DIFFICULTY_LEVEL_OPTIONS,
  DIFFICULTY_MODES,
  DIFFICULTY_PROFILE_OPTIONS,
  DIFFICULTY_PROFILES,
  resolveWorksheetDifficultyMix,
  sanitizeCustomDifficultyTargets,
} from './worksheetDifficultyRules'
