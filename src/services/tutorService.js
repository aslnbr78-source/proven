import { getFunctions, httpsCallable } from 'firebase/functions'
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { app, db } from './firebase'
import { getSkillProfile } from './skillTracker'

let functionsInstance = null

function getFns() {
  if (!app) {
    return null
  }
  if (!functionsInstance) {
    // Must match the region where personalizedTutor was deployed (default: us-central1)
    functionsInstance = getFunctions(app, 'us-central1')
  }
  return functionsInstance
}

export async function loadRecentTutorMessages(uid, sessionId, maxMessages = 12) {
  if (!db || !uid || !sessionId) {
    return []
  }

  const messagesRef = collection(db, 'users', uid, 'tutorSessions', sessionId, 'messages')
  const snap = await getDocs(query(messagesRef, orderBy('createdAt', 'desc'), limit(maxMessages)))
  return snap.docs
    .map((item) => item.data())
    .reverse()
}

export async function saveTutorMessage(uid, sessionId, role, content) {
  if (!db || !uid || !sessionId) {
    return
  }

  await addDoc(collection(db, 'users', uid, 'tutorSessions', sessionId, 'messages'), {
    role,
    content,
    createdAt: serverTimestamp(),
  })
}

export async function askPersonalizedTutor({
  uid,
  courseId,
  moduleId,
  moduleTitle,
  studentMessage,
  questionContext,
  sessionId,
  tutorMode = 'standard',
  allowFullAnswers = false,
  contextType = 'lesson',
}) {
  const skill = uid ? await getSkillProfile(uid, courseId, moduleId) : null
  const recentMessages = uid && sessionId ? await loadRecentTutorMessages(uid, sessionId) : []

  const fns = getFns()
  if (fns) {
    try {
      const callable = httpsCallable(fns, 'personalizedTutor')
      const result = await callable({
        courseId,
        moduleId,
        moduleTitle,
        studentMessage,
        questionContext,
        sessionId,
        skill,
        recentMessages,
        tutorMode,
        allowFullAnswers,
        contextType,
      })
      return result.data
    } catch (error) {
      console.error('personalizedTutor call failed:', error)
      return buildLocalTutorFallback({
        error: formatTutorError(error),
        skill,
        studentMessage,
        moduleTitle,
        questionContext,
        tutorMode,
      })
    }
  }

  return buildLocalTutorFallback({
    skill,
    studentMessage,
    moduleTitle,
    questionContext,
    tutorMode,
  })
}

export async function generatePracticeProblems({
  moduleTitle,
  lessonObjective,
  questionContext,
  gameContext,
  count = 5,
}) {
  const fns = getFns()
  if (!fns) {
    throw new Error('Cloud Functions are not configured')
  }

  const callable = httpsCallable(fns, 'generatePractice')
  const result = await callable({
    moduleTitle,
    lessonObjective,
    questionContext,
    gameContext: gameContext || undefined,
    count,
  })
  return result.data?.problems ?? []
}

export async function explainAdaptiveAnswer({
  prompt,
  options,
  correctAnswer,
  selectedAnswer,
  lessonObjective,
  moduleTitle,
}) {
  const fns = getFns()
  if (!fns) {
    throw new Error('Cloud Functions are not configured')
  }

  const callable = httpsCallable(fns, 'explainAdaptiveAnswer')
  const result = await callable({
    prompt,
    options,
    correctAnswer,
    selectedAnswer,
    lessonObjective,
    moduleTitle,
  })
  return result.data?.explanation ?? ''
}

export async function generateAdaptiveQuestion({
  moduleTitle,
  lessonObjective,
  topics,
  difficulty,
  priorResults,
  questionIndex,
}) {
  const fns = getFns()
  if (!fns) {
    throw new Error('Cloud Functions are not configured')
  }

  const callable = httpsCallable(fns, 'generateAdaptiveQuestion')
  const result = await callable({
    moduleTitle,
    lessonObjective,
    topics,
    difficulty,
    priorResults,
    questionIndex,
  })
  return result.data?.question ?? null
}

export async function generateAdaptiveBankItems({
  count = 5,
  difficulty = 3,
  moduleTitle,
  lessonObjective,
  topics,
}) {
  const items = []
  const targetCount = Math.max(1, Math.min(Number(count) || 5, 15))
  const targetDifficulty = Math.max(1, Math.min(Number(difficulty) || 3, 5))

  for (let index = 0; index < targetCount; index += 1) {
    const generated = await generateAdaptiveQuestion({
      moduleTitle,
      lessonObjective,
      topics,
      difficulty: targetDifficulty,
      priorResults: [],
      questionIndex: index + 1,
    })

    if (!generated) {
      continue
    }

    items.push({
      id: `gen-${Date.now()}-${index + 1}`,
      difficulty: targetDifficulty,
      prompt: generated.prompt,
      options: generated.options,
      correctIndex: generated.correctIndex ?? 0,
      feedbackIfWrong: generated.feedbackIfWrong ?? generated.hint ?? '',
    })
  }

  return items
}

function formatTutorError(error) {
  const code = error?.code
  if (code === 'functions/resource-exhausted') {
    return error.message || 'AI rate limit — wait 30 seconds and try again'
  }
  if (code === 'functions/failed-precondition') {
    return error.message || 'AI tutor is not configured correctly'
  }
  if (code === 'functions/unauthenticated') {
    return 'sign in to use the AI tutor'
  }
  return error?.message?.replace(/^FirebaseError:\s*/i, '') || 'service unavailable'
}

function buildLocalTutorFallback({ error, skill, studentMessage, moduleTitle, questionContext, tutorMode }) {
  const misconceptions = skill?.wrongAnswers?.slice(-2) ?? []
  const misconceptionNote =
    misconceptions.length > 0
      ? ` I remember you struggled with: ${misconceptions.join('; ')}.`
      : ''

  const questionNote = questionContext
    ? ` The practice question is: "${questionContext}".`
    : ''

  const hintNote =
    tutorMode === 'hint-only'
      ? ' I can only give hints during this assessment — what step are you stuck on?'
      : ''

  const reply = error
    ? `I couldn't reach the AI tutor right now (${error}).${questionNote}${misconceptionNote}${hintNote} For "${moduleTitle}", what have you tried so far when you said: "${studentMessage}"?`
    : `Let's think about "${moduleTitle}" together.${questionNote}${misconceptionNote}${hintNote} What reasoning led you to: "${studentMessage}"?`

  return {
    reply,
    deployed: false,
  }
}
