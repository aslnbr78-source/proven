const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { buildSystemInstruction, detectAnswerSeeking } = require('./aiTutorShared')
require('./adminInit')

const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash']
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// API key in firebase/functions/.env as GOOGLE_AI_API_KEY

function normalizeApiKey(key) {
  return (key ?? '').trim().replace(/^["']|["']$/g, '')
}

function resolveGeminiApiKey() {
  const apiKey = normalizeApiKey(process.env.GOOGLE_AI_API_KEY)
  const issue = validateGeminiKey(apiKey)
  if (issue) {
    throw new HttpsError('failed-precondition', issue)
  }
  return { apiKey, suffix: apiKey.slice(-4) }
}

function validateGeminiKey(key) {
  if (!key) {
    return (
      'Gemini API key is missing. Add GOOGLE_AI_API_KEY to firebase/functions/.env ' +
      '(copy .env.example) and redeploy.'
    )
  }
  if (key === 'GEMINI_API_KEY' || key === 'GOOGLE_AI_API_KEY' || key.includes('your_key')) {
    return 'You entered the variable name, not the actual API key. Get one at https://aistudio.google.com/apikey'
  }
  const isLegacyKey = key.startsWith('AIza')
  const isAuthKey = key.startsWith('AQ.')
  if (!isLegacyKey && !isAuthKey) {
    return (
      'Unrecognized Gemini API key format. Keys from AI Studio start with AIza or AQ. ' +
      'Do not use VITE_FIREBASE_API_KEY from Firebase Console.'
    )
  }
  return null
}

function toGeminiRole(role) {
  return role === 'assistant' || role === 'model' ? 'model' : 'user'
}

function formatGeminiHistory(recentMessages, studentMessage) {
  const contents = (recentMessages ?? [])
    .slice(-10)
    .filter((message) => message.content?.trim())
    .map((message) => ({
      role: toGeminiRole(message.role),
      parts: [{ text: message.content.trim() }],
    }))

  contents.push({
    role: 'user',
    parts: [{ text: studentMessage.trim() }],
  })

  while (contents.length > 0 && contents[0].role === 'model') {
    contents.shift()
  }

  return normalizeAlternatingContents(contents)
}

function normalizeAlternatingContents(contents) {
  const normalized = []

  for (const item of contents) {
    const last = normalized[normalized.length - 1]
    if (last && last.role === item.role) {
      last.parts[0].text += `\n\n${item.parts[0].text}`
    } else {
      normalized.push({
        role: item.role,
        parts: [{ text: item.parts[0].text }],
      })
    }
  }

  return normalized
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseRetryDelayMs(body, fallbackMs) {
  const message = body?.error?.message ?? ''
  const secondsMatch = message.match(/retry in ([\d.]+)s/i)
  if (secondsMatch) {
    return Math.ceil(parseFloat(secondsMatch[1]) * 1000) + 500
  }
  return fallbackMs
}

function isBillingError(message) {
  return /prepayment|billing|credits are depleted|payment method|go to ai studio/i.test(message ?? '')
}

function isDailyQuotaError(message) {
  return /PerDay|per day|daily/i.test(message ?? '')
}

function isRetryableStatus(status, message) {
  if (status === 429 && isBillingError(message)) {
    return false
  }
  return status === 429 || status === 408 || status === 503 || status >= 500
}

async function fetchWithRetry(url, options, maxAttempts = 3) {
  let lastError = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, options)
      const body = await response.json().catch(() => ({}))

      if (response.ok) {
        return body
      }

      const error = new Error(body?.error?.message || `Gemini HTTP ${response.status}`)
      error.status = response.status
      error.body = body
      lastError = error

      const errorMessage = body?.error?.message ?? ''
      if (!isRetryableStatus(response.status, errorMessage) || attempt === maxAttempts - 1) {
        throw error
      }

      const delayMs = parseRetryDelayMs(body, 3000 * (attempt + 1))
      console.warn(`Gemini HTTP ${response.status}, retry ${attempt + 2}/${maxAttempts} in ${delayMs}ms`)
      await sleep(delayMs)
    } catch (error) {
      lastError = error
      if (error.status && !isRetryableStatus(error.status, error.message)) {
        throw error
      }
      if (attempt === maxAttempts - 1) {
        throw error
      }
      const delayMs = 3000 * (attempt + 1)
      console.warn(`Gemini network error, retry ${attempt + 2}/${maxAttempts} in ${delayMs}ms`)
      await sleep(delayMs)
    }
  }

  throw lastError ?? new Error('Gemini request failed.')
}

function extractReplyText(data) {
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  const text = parts
    .map((part) => part.text ?? '')
    .join('')
    .trim()
  return text || null
}

async function callGeminiRest({ apiKey, model, systemInstruction, contents }) {
  const url = `${GEMINI_BASE}/${model}:generateContent`

  const payload = {
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 512,
    },
  }

  const data = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  })

  return extractReplyText(data)
}

function isTeacherRole(role) {
  return role === 'teacher' || role === 'admin'
}

function validateCourseId(courseId) {
  if (courseId == null || courseId === '') {
    return null
  }

  if (typeof courseId !== 'string' || !courseId.trim() || courseId.includes('/')) {
    throw new HttpsError('invalid-argument', 'courseId must be a valid course id.')
  }

  return courseId.trim()
}

async function loadTutorAccess(db, uid, courseId) {
  const normalizedCourseId = validateCourseId(courseId)
  const userPromise = db.doc(`users/${uid}`).get()

  if (!normalizedCourseId) {
    const userSnap = await userPromise
    return {
      userSnap,
      courseId: null,
      canLogActivity: false,
    }
  }

  const [userSnap, courseSnap] = await Promise.all([
    userPromise,
    db.doc(`courses/${normalizedCourseId}`).get(),
  ])
  const role = userSnap.data()?.role
  const course = courseSnap.data() ?? {}

  if (courseSnap.exists && !isTeacherRole(role) && course.published !== true) {
    throw new HttpsError('permission-denied', 'You do not have access to this course.')
  }

  return {
    userSnap,
    courseId: normalizedCourseId,
    canLogActivity: true,
  }
}

async function generateTutorReply({ apiKey, systemInstruction, contents }) {
  let lastError = null

  for (const model of GEMINI_MODELS) {
    try {
      const reply = await callGeminiRest({ apiKey, model, systemInstruction, contents })
      if (reply) {
        return reply
      }
    } catch (error) {
      lastError = error
      if (error.status === 404) {
        console.warn(`Model ${model} unavailable, trying next.`)
        continue
      }
      throw error
    }
  }

  throw lastError ?? new Error('No response from Gemini.')
}

exports.personalizedTutor = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in to use the tutor.')
  }

  const {
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
  } = request.data ?? {}

  if (!studentMessage?.trim()) {
    throw new HttpsError('invalid-argument', 'studentMessage is required.')
  }

  const db = getFirestore()
  const access = await loadTutorAccess(db, uid, courseId)
  const userSnap = access.userSnap
  const displayName = userSnap.data()?.displayName || userSnap.data()?.email

  const answerSeekingFlagged = detectAnswerSeeking(studentMessage)
  if (access.canLogActivity) {
    try {
      await db.collection(`courses/${access.courseId}/tutorActivity`).add({
        uid,
        studentEmail: userSnap.data()?.email ?? '',
        studentName: displayName ?? '',
        moduleId: moduleId ?? '',
        moduleTitle: moduleTitle ?? '',
        sessionId: sessionId ?? '',
        studentMessage: studentMessage.trim(),
        questionContext: (questionContext ?? '').slice(0, 500),
        contextType: contextType ?? 'lesson',
        tutorMode: tutorMode ?? 'standard',
        answerSeeking: answerSeekingFlagged,
        reviewStatus: answerSeekingFlagged ? 'pending' : 'none',
        createdAt: FieldValue.serverTimestamp(),
      })
    } catch (writeError) {
      console.error('tutorActivity write failed:', writeError?.message ?? writeError)
    }
  } else {
    console.warn('personalizedTutor: missing courseId — tutor message not logged for insights')
  }

  let activeSkill = skill
  if (!activeSkill && access.courseId && moduleId) {
    const skillSnap = await db.doc(`users/${uid}/skills/${access.courseId}__${moduleId}`).get()
    activeSkill = skillSnap.exists ? skillSnap.data() : null
  }

  const systemInstruction = buildSystemInstruction({
    moduleTitle: moduleTitle || 'this lesson',
    questionContext,
    skill: activeSkill,
    displayName,
    tutorMode: tutorMode ?? 'standard',
    allowFullAnswers: Boolean(allowFullAnswers),
    contextType: contextType ?? 'lesson',
  })

  const contents = formatGeminiHistory(recentMessages, studentMessage.trim())
  const { apiKey, suffix } = resolveGeminiApiKey()

  let reply = null
  try {
    reply = await generateTutorReply({ apiKey, systemInstruction, contents })
  } catch (error) {
    console.warn(
      `Gemini REST failed (key ends ...${suffix}): ${error?.message?.slice(0, 240)}`,
    )
    throw toHttpsError(error)
  }

  if (!reply) {
    throw toHttpsError(new Error('No response from Gemini.'))
  }

  if (sessionId) {
    const sessionRef = db.doc(`users/${uid}/tutorSessions/${sessionId}`)
    await sessionRef.set(
      {
        courseId: access.courseId ?? null,
        moduleId: moduleId ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  }

  return { reply, deployed: true, answerSeekingFlagged }
})

function toHttpsError(error) {
  const status = error?.status ?? error?.statusCode
  const message = error?.message ?? 'Tutor request failed.'

  if (isBillingError(message)) {
    throw new HttpsError(
      'failed-precondition',
      'Google AI Studio prepayment credits are depleted for this project. Add credits at https://aistudio.google.com/apikey or create a new API key in a fresh project.',
    )
  }

  if (status === 429 || /quota|rate limit|too many requests/i.test(message)) {
    if (isDailyQuotaError(message)) {
      throw new HttpsError(
        'resource-exhausted',
        'Daily Gemini limit reached (20/day on free tier). Try again tomorrow or enable billing in Google AI Studio.',
      )
    }
    throw new HttpsError(
      'resource-exhausted',
      'Gemini rate limit hit (too many requests per minute). Wait 30 seconds and try again.',
    )
  }

  if (status === 400) {
    throw new HttpsError('invalid-argument', 'Could not format the tutor conversation for Gemini.')
  }

  if (status === 401 || status === 403 || /api key/i.test(message)) {
    throw new HttpsError(
      'failed-precondition',
      'Gemini API key is invalid. Update GOOGLE_AI_API_KEY in firebase/functions/.env and redeploy.',
    )
  }

  if (status === 404 || /not found/i.test(message)) {
    throw new HttpsError('failed-precondition', 'The configured Gemini model is unavailable.')
  }

  console.error('personalizedTutor Gemini error:', message)
  throw new HttpsError('internal', 'The AI tutor hit an unexpected error. Please try again.')
}

exports._test = {
  isTeacherRole,
  loadTutorAccess,
  validateCourseId,
}
