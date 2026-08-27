import { MODULE_KIND_LABELS } from './courseEditor'
import { prepareMathGameModule } from './mathGameRounds'

const MODULE_TYPES = [
  'interactive-lesson',
  'quiz',
  'flashcard',
  'final-test',
  'adaptive-practice',
  'adaptive-mastery',
  'math-game',
]

/** Outline modules with this contentSource load from the Games catalog, not courses/.../modules. */
export const GAME_CATALOG_CONTENT_SOURCE = 'game-catalog'

const TYPE_ALIASES = {
  lesson: 'interactive-lesson',
  'interactive lesson': 'interactive-lesson',
  'interactive-lesson': 'interactive-lesson',
  'fill-blank': 'interactive-lesson',
  'fill-in-the-blank': 'interactive-lesson',
  quiz: 'quiz',
  flashcard: 'flashcard',
  flashcards: 'flashcard',
  cards: 'flashcard',
  'final-test': 'final-test',
  finaltest: 'final-test',
  'final test': 'final-test',
  test: 'final-test',
  'adaptive-practice': 'adaptive-practice',
  'ai-practice': 'adaptive-practice',
  'adaptive-mastery': 'adaptive-mastery',
  'mastery-check': 'adaptive-mastery',
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

const DEFAULT_FINAL_TEST_TIME_LIMIT = 1800

export function looksLikeFinalTestModule(module) {
  if (!Array.isArray(module?.questions) || module.questions.length === 0) {
    return false
  }

  const id = String(module.id ?? '').toLowerCase()
  const title = String(module.title ?? '').toLowerCase()

  const idLooksFinal =
    /final(-test)?$/.test(id) ||
    /-final-test$/.test(id) ||
    /^ch\d{1,2}-final/.test(id) ||
    /chapter-\d{1,2}-final(?:-test)?$/.test(id)

  const titleLooksFinal =
    /\bfinal\s+test\b/.test(title) ||
    /\bchapter\s+\d{1,2}\s+final\b/.test(title)

  const hasTimeLimit = typeof module.timeLimit === 'number' && module.timeLimit >= 60

  return idLooksFinal || titleLooksFinal || (titleLooksFinal && hasTimeLimit)
}

export function prepareFinalTestModule(module) {
  const prepared = { ...module, type: 'final-test' }

  if (typeof prepared.timeLimit !== 'number' || prepared.timeLimit < 60) {
    prepared.timeLimit = DEFAULT_FINAL_TEST_TIME_LIMIT
  }

  if (Array.isArray(prepared.questions)) {
    prepared.questions = prepared.questions.map((question) => {
      if (!question || typeof question !== 'object') {
        return question
      }
      const rest = { ...question }
      delete rest.hints
      return rest
    })
  }

  return prepared
}

export function prepareModuleForImport(moduleData, requestedKind = null) {
  const normalized = normalizeImportedModule(moduleData)
  if (!normalized || typeof normalized !== 'object' || normalized.__courseOutline) {
    return normalized
  }

  let module = { ...normalized }

  if (requestedKind && isSupportedModuleType(requestedKind)) {
    module.type = requestedKind
  } else if (module.type === 'quiz' && looksLikeFinalTestModule(module)) {
    module.type = 'final-test'
  }

  if (module.type === 'final-test') {
    module = prepareFinalTestModule(module)
  }

  return module
}

export function normalizeImportedModule(raw, { requestedKind = null } = {}) {
  if (!raw || typeof raw !== 'object') {
    return raw
  }

  if (Array.isArray(raw.chapters)) {
    return { __courseOutline: true, ...raw }
  }

  const unwrapped = raw.module ?? raw.lesson ?? raw.content ?? raw

  if (!unwrapped || typeof unwrapped !== 'object') {
    return unwrapped
  }

  if (Array.isArray(unwrapped.chapters)) {
    return { __courseOutline: true, ...unwrapped }
  }

  const normalized = { ...unwrapped }

  if (!isNonEmptyString(normalized.title) && isNonEmptyString(normalized.name)) {
    normalized.title = normalized.name.trim()
  }

  if (!isNonEmptyString(normalized.id) && isNonEmptyString(normalized.slug)) {
    normalized.id = normalized.slug.trim()
  }

  const rawType = String(normalized.type ?? 'interactive-lesson').toLowerCase().trim()
  normalized.type = TYPE_ALIASES[rawType] ?? rawType

  if (requestedKind && isSupportedModuleType(requestedKind)) {
    normalized.type = requestedKind
  } else if (normalized.type === 'quiz' && looksLikeFinalTestModule(normalized)) {
    normalized.type = 'final-test'
  }

  if (normalized.type === 'final-test') {
    return prepareFinalTestModule(normalized)
  }

  if (normalized.type === 'math-game') {
    return prepareMathGameModule(normalized)
  }

  return normalized
}

export function summarizeModule(module) {
  if (!module?.type) {
    return ''
  }

  switch (module.type) {
    case 'interactive-lesson': {
      if (Array.isArray(module.blocks) && module.blocks.length > 0) {
        const blockLabel = `${module.blocks.length} learning block${module.blocks.length === 1 ? '' : 's'}`
        if (module.blocks.length > 1) {
          return `${blockLabel} · block navigation`
        }
        return blockLabel
      }
      const exampleCount = module.examples?.length ?? (module.example ? 1 : 0)
      const questionCount = module.questions?.length ?? (module.question ? 1 : 0)
      const parts = []
      if (exampleCount) {
        parts.push(`${exampleCount} example${exampleCount === 1 ? '' : 's'}`)
      }
      if (questionCount) {
        parts.push(`${questionCount} question${questionCount === 1 ? '' : 's'}`)
      }
      if (module.presenterNotes?.length) {
        parts.push('presenter notes')
      }
      return parts.join(' · ') || 'Interactive lesson'
    }
    case 'quiz': {
      const count = module.questions?.length ?? 0
      const time = module.timeLimit ? `${Math.round(module.timeLimit / 60)} min limit` : null
      return [count ? `${count} questions` : 'Quiz', time].filter(Boolean).join(' · ')
    }
    case 'flashcard': {
      const count = module.cards?.length ?? 0
      return count ? `${count} cards` : 'Flashcards'
    }
    case 'final-test': {
      const count = module.questions?.length ?? 0
      const time = module.timeLimit ? `${Math.round(module.timeLimit / 60)} min limit` : null
      return [count ? `${count} questions` : 'Final test', time].filter(Boolean).join(' · ')
    }
    case 'adaptive-practice': {
      const count = module.questionCount ?? 8
      return `AI practice · ${count} questions`
    }
    case 'adaptive-mastery': {
      const count = module.questionCount ?? 10
      const bank = module.bank?.length ?? 0
      return `Mastery · ${count} from bank of ${bank}`
    }
    case 'math-game': {
      const count = module.rounds?.length ?? module.config?.rounds?.length ?? 0
      const game = module.game ?? module.config?.game ?? 'game'
      return count ? `${game} · ${count} rounds` : game
    }
    default:
      return MODULE_KIND_LABELS[module.type] ?? module.type
  }
}

/**
 * Outline sidebar entry for a module.
 * @param {object} moduleData - module JSON body
 * @param {{ menuTitle?: string }} [options] - when updating an existing row, pass the
 *   current outline `.title` so a Course Builder rename is not overwritten by JSON `title`
 */
export function buildOutlineModuleEntry(moduleData, { menuTitle } = {}) {
  const preserved = String(menuTitle ?? '').trim()
  const entry = {
    id: moduleData.id,
    type: moduleData.type,
    title: preserved || moduleData.title,
    summary: summarizeModule(moduleData),
  }
  if (Array.isArray(moduleData.standards) && moduleData.standards.length > 0) {
    entry.standards = moduleData.standards
  }
  if (moduleData.contentSource === GAME_CATALOG_CONTENT_SOURCE) {
    entry.contentSource = GAME_CATALOG_CONTENT_SOURCE
  }
  return entry
}

/** Outline pointer to a shared Games catalog body (no lesson module JSON). */
export function buildGameCatalogOutlineEntry(gameMeta) {
  const title = gameMeta?.title ?? gameMeta?.id ?? 'Math game'
  const chapterHint = gameMeta?.chapterHint ? String(gameMeta.chapterHint).trim() : ''
  return {
    id: gameMeta.id,
    type: 'math-game',
    title,
    summary: chapterHint
      ? `Math game · linked from Games catalog · ${chapterHint}`
      : 'Math game · linked from Games catalog',
    contentSource: GAME_CATALOG_CONTENT_SOURCE,
  }
}

export function isGameCatalogOutlineModule(module) {
  return (
    module?.type === 'math-game' && module?.contentSource === GAME_CATALOG_CONTENT_SOURCE
  )
}

export function applyModuleToOutline(outline, moduleData) {
  if (!outline?.chapters?.length) {
    return { error: 'Course outline has no chapters yet.' }
  }

  let found = false

  const chapters = outline.chapters.map((chapter) => ({
    ...chapter,
    subchapters: chapter.subchapters.map((subchapter) => ({
      ...subchapter,
      modules: (subchapter.modules ?? []).map((module) => {
        if (module.id === moduleData.id) {
          found = true
          // Keep the sidebar/menu title the teacher edited; only fill type/summary/etc.
          return { ...module, ...buildOutlineModuleEntry(moduleData, { menuTitle: module.title }) }
        }
        return module
      }),
    })),
  }))

  const entry = buildOutlineModuleEntry(moduleData)

  if (found) {
    return { outline: { ...outline, chapters }, action: 'updated' }
  }

  const firstSubchapter = chapters[0]?.subchapters?.[0]
  if (!firstSubchapter) {
    return { error: 'Add a section to the course outline before importing a new lesson.' }
  }

  const nextChapters = chapters.map((chapter, chapterIndex) => {
    if (chapterIndex !== 0) {
      return chapter
    }
    return {
      ...chapter,
      subchapters: chapter.subchapters.map((subchapter, subchapterIndex) => {
        if (subchapterIndex !== 0) {
          return subchapter
        }
        return {
          ...subchapter,
          modules: [...(subchapter.modules ?? []), entry],
        }
      }),
    }
  })

  return { outline: { ...outline, chapters: nextChapters }, action: 'added' }
}

export function isSupportedModuleType(type) {
  return MODULE_TYPES.includes(type)
}

export { MODULE_TYPES }
