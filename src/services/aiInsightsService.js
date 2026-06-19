import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app, db } from './firebase'

function optionsPath(courseId, moduleId) {
  return doc(db, 'courses', courseId, 'moduleAiOptions', moduleId)
}

export async function getModuleAiOptions(courseId, moduleId) {
  if (!db) {
    return {
      quizHintOnly: true,
      quizAllowFullAnswers: false,
      finalTestHintOnly: true,
      finalTestAllowFullAnswers: false,
    }
  }

  const snap = await getDoc(optionsPath(courseId, moduleId))
  if (!snap.exists()) {
    return {
      quizHintOnly: true,
      quizAllowFullAnswers: false,
      finalTestHintOnly: true,
      finalTestAllowFullAnswers: false,
    }
  }

  const data = snap.data()
  return {
    quizHintOnly: data.quizHintOnly !== false,
    quizAllowFullAnswers: Boolean(data.quizAllowFullAnswers),
    finalTestHintOnly: data.finalTestHintOnly !== false,
    finalTestAllowFullAnswers: Boolean(data.finalTestAllowFullAnswers),
  }
}

export async function saveModuleAiOptions({ courseId, moduleId, patch }) {
  if (!db) {
    throw new Error('Firestore is not configured')
  }

  await setDoc(
    optionsPath(courseId, moduleId),
    {
      ...patch,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

function normalizeWrongAnswer(text) {
  return String(text ?? '')
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/\$+/g, '')
    .trim()
    .toLowerCase()
}

export async function aggregateCourseMisconceptions(courseId, moduleTitles = {}) {
  if (!db || !courseId) {
    return []
  }

  const snap = await getDocs(
    query(collectionGroup(db, 'skills'), where('courseId', '==', courseId)),
  )

  const byModule = new Map()

  for (const skillDoc of snap.docs) {
    const data = skillDoc.data()
    const moduleId = data.moduleId
    if (!moduleId) {
      continue
    }

    if (!byModule.has(moduleId)) {
      byModule.set(moduleId, {
        moduleId,
        moduleTitle: moduleTitles[moduleId] ?? moduleId,
        wrongCounts: new Map(),
        studentCount: 0,
        lowMasteryCount: 0,
      })
    }

    const row = byModule.get(moduleId)
    row.studentCount += 1
    if ((data.mastery ?? 1) < 0.5) {
      row.lowMasteryCount += 1
    }

    for (const wrong of data.wrongAnswers ?? []) {
      const key = normalizeWrongAnswer(wrong) || String(wrong)
      row.wrongCounts.set(key, (row.wrongCounts.get(key) ?? 0) + 1)
    }
  }

  return [...byModule.values()]
    .map((row) => {
      const topMisconceptions = [...row.wrongCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, count]) => ({ label, count }))

      return {
        moduleId: row.moduleId,
        moduleTitle: row.moduleTitle,
        studentCount: row.studentCount,
        lowMasteryCount: row.lowMasteryCount,
        topMisconceptions,
        summary:
          topMisconceptions.length > 0
            ? `Class struggled with: ${topMisconceptions
                .slice(0, 3)
                .map((item) => item.label)
                .join('; ')}`
            : 'No wrong-answer patterns recorded yet.',
      }
    })
    .sort((a, b) => {
      const aTotal = a.topMisconceptions.reduce((sum, item) => sum + item.count, 0)
      const bTotal = b.topMisconceptions.reduce((sum, item) => sum + item.count, 0)
      return bTotal - aTotal
    })
}

function getFns() {
  if (!app) {
    return null
  }
  return getFunctions(app, 'us-central1')
}

function mapActivityTimestamps(rows = []) {
  return rows.map((row) => {
    const millis = row.createdAtMillis
    if (millis) {
      return {
        ...row,
        createdAt: { seconds: Math.floor(millis / 1000) },
      }
    }
    return row
  })
}

export async function fetchCourseTutorInsights(courseId, moduleTitles = {}) {
  const fns = getFns()
  if (!fns || !courseId) {
    return {
      tutorActivity: await listTutorActivity(courseId),
      tutorChallenges: await aggregateTutorChallengesByModule(courseId, moduleTitles),
      reviewQueue: await listTutorReviewQueue(courseId),
    }
  }

  try {
    const callable = httpsCallable(fns, 'getCourseTutorInsights')
    const result = await callable({ courseId, moduleTitles })
    const data = result.data ?? {}
    return {
      tutorActivity: mapActivityTimestamps(data.activity ?? []),
      tutorChallenges: data.tutorChallenges ?? [],
      studentInsights: data.studentInsights ?? [],
      reviewQueue: mapActivityTimestamps(data.reviewQueue ?? []),
    }
  } catch (error) {
    console.warn('getCourseTutorInsights failed, falling back to Firestore client:', error)
    return {
      tutorActivity: await listTutorActivity(courseId),
      tutorChallenges: await aggregateTutorChallengesByModule(courseId, moduleTitles),
      reviewQueue: await listTutorReviewQueue(courseId),
      loadError: error?.message ?? 'Could not load tutor insights',
    }
  }
}

function normalizeQuestion(text) {
  return String(text ?? '')
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/\$+/g, '')
    .trim()
    .toLowerCase()
    .slice(0, 200)
}

export async function listTutorActivity(courseId, { limitCount = 100 } = {}) {
  if (!db || !courseId) {
    return []
  }

  const snap = await getDocs(
    query(
      collection(db, 'courses', courseId, 'tutorActivity'),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    ),
  )

  return snap.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function aggregateTutorChallengesByModule(courseId, moduleTitles = {}) {
  if (!db || !courseId) {
    return []
  }

  const snap = await getDocs(
    query(
      collection(db, 'courses', courseId, 'tutorActivity'),
      orderBy('createdAt', 'desc'),
      limit(500),
    ),
  )

  const byModule = new Map()

  for (const activityDoc of snap.docs) {
    const data = activityDoc.data()
    const moduleId = data.moduleId
    if (!moduleId) {
      continue
    }

    if (!byModule.has(moduleId)) {
      byModule.set(moduleId, {
        moduleId,
        moduleTitle: moduleTitles[moduleId] ?? data.moduleTitle ?? moduleId,
        messageCount: 0,
        answerSeekingCount: 0,
        studentIds: new Set(),
        questionCounts: new Map(),
        contextCounts: { lesson: 0, quiz: 0, 'final-test': 0 },
        recentQuestions: [],
      })
    }

    const row = byModule.get(moduleId)
    row.messageCount += 1
    if (data.answerSeeking) {
      row.answerSeekingCount += 1
    }
    if (data.uid) {
      row.studentIds.add(data.uid)
    }

    const contextType = data.contextType ?? 'lesson'
    row.contextCounts[contextType] = (row.contextCounts[contextType] ?? 0) + 1

    const questionKey = normalizeQuestion(data.studentMessage)
    if (questionKey) {
      row.questionCounts.set(questionKey, (row.questionCounts.get(questionKey) ?? 0) + 1)
    }

    if (row.recentQuestions.length < 5 && data.studentMessage) {
      row.recentQuestions.push(data.studentMessage.trim())
    }
  }

  return [...byModule.values()]
    .map((row) => {
      const topQuestions = [...row.questionCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, count]) => ({ label, count }))

      const contextParts = Object.entries(row.contextCounts)
        .filter(([, count]) => count > 0)
        .map(([type, count]) => `${count} ${type}`)

      return {
        moduleId: row.moduleId,
        moduleTitle: row.moduleTitle,
        messageCount: row.messageCount,
        answerSeekingCount: row.answerSeekingCount,
        studentCount: row.studentIds.size,
        topQuestions,
        contextSummary: contextParts.join(', ') || 'no activity',
        summary:
          topQuestions.length > 0
            ? `Students asked about: ${topQuestions
                .slice(0, 2)
                .map((item) => item.label)
                .join('; ')}`
            : `${row.messageCount} tutor message(s) from ${row.studentIds.size} student(s).`,
      }
    })
    .sort((a, b) => b.messageCount - a.messageCount)
}

export async function listTutorReviewQueue(courseId, status = 'pending') {
  if (!db || !courseId) {
    return []
  }

  const snap = await getDocs(
    query(
      collection(db, 'courses', courseId, 'tutorActivity'),
      where('answerSeeking', '==', true),
      where('reviewStatus', '==', status),
      orderBy('createdAt', 'desc'),
    ),
  )

  return snap.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function updateTutorReviewStatus(courseId, flagId, status) {
  if (!db) {
    return
  }

  await updateDoc(doc(db, 'courses', courseId, 'tutorActivity', flagId), {
    reviewStatus: status,
    reviewedAt: serverTimestamp(),
  })
}

export async function summarizeStudentTutorActivity({
  courseId,
  studentUid,
  moduleTitles = {},
  forceRefresh = false,
}) {
  const fns = getFns()
  if (!fns || !courseId || !studentUid) {
    throw new Error('Cloud Functions are not configured')
  }

  const callable = httpsCallable(fns, 'summarizeStudentTutorActivity')
  const result = await callable({ courseId, studentUid, moduleTitles, forceRefresh })
  return result.data ?? {}
}
