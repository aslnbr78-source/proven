import { collectionGroup, getDocs, query, where } from 'firebase/firestore'
import { fetchModuleContent, flattenModules } from './contentLoader'
import { aggregateCourseMisconceptions } from './aiInsightsService'
import { db } from './firebase'
import {
  extractQuestionsFromModule,
  sampleWorksheetQuestions,
  sortQuestionsByWorksheetType,
  buildWorksheetTitle,
  countQuestionsByFormat,
  countQuestionsByDifficulty,
  resolveWorksheetMix,
  WORKSHEET_TYPES,
} from '../utils/worksheetQuestions'
import {
  getModuleIdsForScope,
  getScopeLabel,
  parseScopeKey,
  SCOPE_TYPES,
} from '../utils/insightsScope'
import { expandModuleIdsWithSiblingGames } from '../utils/gameQuestionSource'
import { MIX_MODES } from '../utils/worksheetMixRules'
import {
  describeDifficultyProfile,
  DIFFICULTY_MODES,
  DIFFICULTY_PROFILES,
  resolveWorksheetDifficultyMix,
} from '../utils/worksheetDifficultyRules'

/** Modules that contribute printable worksheet items (lessons, assessments, linked games). */
const QUESTION_SOURCE_MODULE_TYPES = new Set([
  'interactive-lesson',
  'quiz',
  'final-test',
  'adaptive-mastery',
  'math-game',
])

const MODULE_TYPE_RANK = {
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

export async function fetchScopeMastery({ courseId, outline, scope, memberUids = null }) {
  if (!db || !courseId || !outline) {
    return null
  }

  const moduleIds = getModuleIdsForScope(outline, scope)
  const allowed = memberUids?.length ? new Set(memberUids) : null

  try {
    const snap = await getDocs(query(collectionGroup(db, 'skills'), where('courseId', '==', courseId)))
    const values = []

    for (const skillDoc of snap.docs) {
      const uid = skillDoc.ref.parent?.parent?.id
      if (!uid || (allowed && !allowed.has(uid))) {
        continue
      }
      const data = skillDoc.data()
      if (moduleIds.has(data.moduleId)) {
        values.push(Number(data.mastery ?? 0))
      }
    }

    if (!values.length) {
      return null
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length
  } catch {
    return null
  }
}

function resolveModuleIdsForWorksheetScope(outline, scope) {
  let moduleIds = getModuleIdsForScope(outline, scope)
  // Single-module reteach: also pull linked games from the same subchapter (Course Builder + Game).
  if (scope?.type === SCOPE_TYPES.MODULE) {
    moduleIds = expandModuleIdsWithSiblingGames(outline, moduleIds)
  }
  return moduleIds
}

export async function collectQuestionsForScope({
  courseId,
  outline,
  scope,
  worksheetType = WORKSHEET_TYPES.PRACTICE,
  priorityModuleIds = new Set(),
}) {
  const moduleIds = resolveModuleIdsForWorksheetScope(outline, scope)
  const flatModules = flattenModules(outline).filter((row) => moduleIds.has(row.id))
  const orderedModules = [...flatModules].sort((a, b) => {
    const order = MODULE_TYPE_RANK[worksheetType] ?? MODULE_TYPE_RANK[WORKSHEET_TYPES.PRACTICE]
    const rank = (type) => {
      const index = order.indexOf(type)
      return index === -1 ? order.length : index
    }
    return rank(a.type) - rank(b.type)
  })

  const questions = []

  for (const moduleMeta of orderedModules) {
    if (!QUESTION_SOURCE_MODULE_TYPES.has(moduleMeta.type)) {
      continue
    }

    try {
      const content = await fetchModuleContent(courseId, moduleMeta.id, {
        contentSource: moduleMeta.contentSource,
        moduleType: moduleMeta.type,
      })
      questions.push(
        ...extractQuestionsFromModule(content, {
          moduleId: moduleMeta.id,
          moduleTitle: moduleMeta.title,
          moduleType: moduleMeta.type,
          chapterTitle: moduleMeta.chapterTitle,
          subchapterTitle: moduleMeta.subchapterTitle,
          standards: moduleMeta.standards ?? [],
        }),
      )
    } catch {
      /* skip missing module payloads */
    }
  }

  const standardCodes = [...new Set(questions.flatMap((row) => row.standards ?? []))]
  const formatCounts = countQuestionsByFormat(questions)
  const difficultySummary = countQuestionsByDifficulty(questions)

  return {
    questions: sortQuestionsByWorksheetType(questions, worksheetType),
    availableCount: questions.length,
    moduleCount: orderedModules.filter((row) => QUESTION_SOURCE_MODULE_TYPES.has(row.type)).length,
    priorityModuleIds,
    standardCodes,
    formatCounts,
    difficultyCounts: difficultySummary.counts,
    difficultyTaggedCount: difficultySummary.tagged,
  }
}

export async function buildWorksheetFromScope({
  courseId,
  outline,
  scope,
  worksheetType,
  questionCount,
  courseTitle,
  priorityModuleIds = new Set(),
  sourceNote = '',
  includeAnswerKey = true,
  showDifficultyOnPrint = false,
  mixMode = MIX_MODES.DEFAULT,
  customTargets = null,
  difficultyMode = DIFFICULTY_MODES.DEFAULT,
  difficultyProfile = DIFFICULTY_PROFILES.AUTO,
  abilityLevel = null,
  customDifficultyTargets = null,
}) {
  const { questions, availableCount, standardCodes } = await collectQuestionsForScope({
    courseId,
    outline,
    scope,
    worksheetType,
    priorityModuleIds,
  })

  if (availableCount === 0) {
    throw new Error('No questions found for the selected content scope.')
  }

  const sampled = sampleWorksheetQuestions(questions, questionCount, {
    priorityModuleIds,
    worksheetType,
    standardCodes,
    mixMode,
    customTargets,
    difficultyMode,
    difficultyProfile,
    abilityLevel,
    customDifficultyTargets,
  })

  if (sampled.error) {
    throw new Error(sampled.error)
  }

  const scopeLabel = getScopeLabel(outline, scope)
  const mixRatio = resolveWorksheetMix(worksheetType, standardCodes)
  const difficultyRatio = resolveWorksheetDifficultyMix(worksheetType, {
    profile: difficultyProfile,
    abilityLevel,
  })

  const usedStandards = [
    ...new Set(sampled.questions.flatMap((row) => row.standards ?? []).filter(Boolean)),
  ]

  return {
    title: buildWorksheetTitle({ worksheetType, scopeLabel, courseTitle }),
    subtitle: scopeLabel,
    worksheetType,
    courseTitle,
    questions: sampled.questions,
    includeAnswerKey,
    showDifficultyOnPrint,
    sourceNote,
    availableCount,
    selectedCount: sampled.questions.length,
    mixDescription: sampled.mixDescription,
    difficultyDescription: sampled.difficultyDescription,
    difficultyProfileLabel: describeDifficultyProfile(difficultyProfile, abilityLevel),
    mixRatio,
    difficultyRatio,
    mixMode,
    difficultyMode,
    abilityLevel,
    standardCodes: usedStandards,
  }
}

export async function buildWorksheetFromAiReport({
  courseId,
  outline,
  report,
  worksheetType,
  questionCount,
  courseTitle,
  memberUids = null,
  includeAnswerKey = true,
  showDifficultyOnPrint = false,
  mixMode = MIX_MODES.DEFAULT,
  customTargets = null,
  difficultyMode = DIFFICULTY_MODES.DEFAULT,
  difficultyProfile = DIFFICULTY_PROFILES.AUTO,
  customDifficultyTargets = null,
}) {
  const scope = parseScopeKey(report.scopeKey)
  const moduleTitles = Object.fromEntries(flattenModules(outline).map((row) => [row.id, row.title]))

  let priorityModuleIds = new Set()
  try {
    const misconceptions = await aggregateCourseMisconceptions(courseId, moduleTitles, memberUids)
    const scopedModuleIds = getModuleIdsForScope(outline, scope)
    priorityModuleIds = new Set(
      misconceptions
        .filter((row) => scopedModuleIds.has(row.moduleId))
        .sort((a, b) => {
          const aTotal = a.topMisconceptions?.reduce((sum, item) => sum + item.count, 0) ?? 0
          const bTotal = b.topMisconceptions?.reduce((sum, item) => sum + item.count, 0) ?? 0
          return bTotal - aTotal
        })
        .slice(0, 5)
        .map((row) => row.moduleId),
    )
  } catch {
    /* optional weighting */
  }

  const abilityLevel = await fetchScopeMastery({
    courseId,
    outline,
    scope,
    memberUids,
  })

  const reportLabel =
    report.kind === 'student'
      ? `${report.studentName || 'Student'} report`
      : `${report.className || 'Class'} report`

  const masteryNote =
    abilityLevel != null
      ? ` Difficulty mix uses ${Math.round(abilityLevel * 100)}% average mastery in this scope.`
      : ''

  return buildWorksheetFromScope({
    courseId,
    outline,
    scope,
    worksheetType,
    questionCount,
    courseTitle,
    priorityModuleIds,
    includeAnswerKey,
    showDifficultyOnPrint,
    mixMode,
    customTargets,
    difficultyMode,
    difficultyProfile,
    abilityLevel,
    customDifficultyTargets,
    sourceNote: `Based on ${reportLabel} · ${report.scopeLabel ?? 'Whole course'}. Questions prioritize modules with the most missed work in this scope.${masteryNote}`,
  })
}

export async function buildWorksheetFromReteach({
  courseId,
  outline,
  moduleId,
  moduleTitle = '',
  worksheetType,
  questionCount,
  courseTitle,
  includeAnswerKey = true,
  showDifficultyOnPrint = false,
  includeStandardsOnPrint = true,
  mixMode = MIX_MODES.DEFAULT,
  customTargets = null,
  difficultyMode = DIFFICULTY_MODES.DEFAULT,
  difficultyProfile = DIFFICULTY_PROFILES.INTERVENTION,
  customDifficultyTargets = null,
  misconceptionLabel = '',
}) {
  const scope = { type: SCOPE_TYPES.MODULE, moduleId }
  const label = moduleTitle || moduleId
  const misconceptionNote = misconceptionLabel ? ` Top pattern: ${misconceptionLabel}.` : ''

  return buildWorksheetFromScope({
    courseId,
    outline,
    scope,
    worksheetType,
    questionCount,
    courseTitle,
    priorityModuleIds: new Set([moduleId]),
    includeAnswerKey,
    showDifficultyOnPrint,
    mixMode,
    customTargets,
    difficultyMode,
    difficultyProfile,
    customDifficultyTargets,
    sourceNote: `Reteach worksheet prioritizing "${label}".${misconceptionNote}`,
  }).then((worksheet) => ({
    ...worksheet,
    includeStandardsOnPrint,
  }))
}

export async function buildTieredWorksheetsFromReport({
  courseId,
  outline,
  report,
  worksheetType,
  questionCount,
  courseTitle,
  memberUids = null,
  includeAnswerKey = true,
  showDifficultyOnPrint = false,
  includeStandardsOnPrint = true,
  mixMode = MIX_MODES.DEFAULT,
  customTargets = null,
  difficultyMode = DIFFICULTY_MODES.DEFAULT,
  customDifficultyTargets = null,
}) {
  const tiers = [
    { suffix: ' — Support', profile: DIFFICULTY_PROFILES.INTERVENTION },
    { suffix: ' — Core', profile: DIFFICULTY_PROFILES.AUTO },
    { suffix: ' — Stretch', profile: DIFFICULTY_PROFILES.STRETCH },
  ]

  const worksheets = []
  for (const tier of tiers) {
    const worksheet = await buildWorksheetFromAiReport({
      courseId,
      outline,
      report,
      worksheetType,
      questionCount,
      courseTitle,
      memberUids,
      includeAnswerKey,
      showDifficultyOnPrint,
      mixMode,
      customTargets,
      difficultyMode,
      difficultyProfile: tier.profile,
      customDifficultyTargets,
    })
    worksheets.push({
      ...worksheet,
      title: `${worksheet.title}${tier.suffix}`,
      includeStandardsOnPrint,
    })
  }

  return worksheets
}

export function buildScopeFromChapterSelection(chapterId, subchapterId) {
  if (subchapterId) {
    return { type: SCOPE_TYPES.SUBCHAPTER, chapterId, subchapterId }
  }
  if (chapterId) {
    return { type: SCOPE_TYPES.CHAPTER, chapterId }
  }
  return { type: SCOPE_TYPES.COURSE }
}

export { DIFFICULTY_MODES, DIFFICULTY_PROFILES, MIX_MODES, WORKSHEET_TYPES }
