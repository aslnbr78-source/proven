const functions = require('firebase-functions')
const admin = require('firebase-admin')

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()

const BUNDLED_FINAL_TESTS = {
  'algebra-1/chapter-1-final': {
    type: 'final-test',
    id: 'chapter-1-final',
    title: 'Chapter 1 Final Test (Demo)',
    timeLimit: 300,
    questions: [
      {
        id: 'ft-q1',
        prompt: 'What is the [[kw:slope]] of the line $y = 3x - 2$?',
        options: ['$3$', '$-2$', '$2$', '$-3$'],
        correctIndex: 0,
        feedbackIfWrong: 'In $y = mx + b$, the slope is the coefficient of $x$, which is $3$.',
      },
      {
        id: 'ft-q2',
        prompt: 'What is the [[kw:y-intercept]] of $y = 3x - 2$?',
        options: ['$-2$', '$3$', '$2$', '$0$'],
        correctIndex: 0,
        feedbackIfWrong: 'The y-intercept is the constant term $b$, which is $-2$.',
      },
      {
        id: 'ft-q3',
        prompt: 'The equation $y = -4x + 7$ has a negative [[kw:slope]].',
        options: ['True', 'False'],
        correctIndex: 0,
        feedbackIfWrong: 'The coefficient of $x$ is $-4$, so the slope is negative.',
      },
      {
        id: 'ft-q4',
        prompt: 'Which equation is in [[kw:slope-intercept form]]?',
        options: ['$y = 2x + 5$', '$2x + y = 8$', '$x = 4$', '$y^2 = x$'],
        correctIndex: 0,
        feedbackIfWrong: 'Slope-intercept form is $y = mx + b$.',
      },
      {
        id: 'ft-q5',
        prompt: 'What is the [[kw:slope]] of $y = -4x + 7$?',
        options: ['$-4$', '$4$', '$7$', '$-7$'],
        correctIndex: 0,
        feedbackIfWrong: 'The coefficient of $x$ is $-4$.',
      },
    ],
  },
}

function requireId(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new functions.https.HttpsError('invalid-argument', `${fieldName} is required`)
  }

  return value.trim()
}

function bundledKey(courseId, moduleId) {
  return `${courseId}/${moduleId}`
}

async function getUserRole(uid) {
  const userSnap = await db.doc(`users/${uid}`).get()
  return userSnap.data()?.role ?? null
}

async function assertTeacher(uid) {
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required')
  }

  const role = await getUserRole(uid)
  if (role !== 'teacher' && role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Teacher access required')
  }
}

function moduleRef(courseId, moduleId) {
  return db.doc(`courses/${courseId}/modules/${moduleId}`)
}

function configRef(courseId, moduleId) {
  return db.doc(`courses/${courseId}/finalTests/${moduleId}`)
}

function optionsRef(courseId, moduleId) {
  return db.doc(`courses/${courseId}/finalTestOptions/${moduleId}`)
}

function permissionRef(courseId, moduleId, uid) {
  return db.doc(`courses/${courseId}/finalTests/${moduleId}/permissions/${uid}`)
}

function sessionRef(courseId, moduleId, sessionId) {
  return db.doc(`courses/${courseId}/finalTests/${moduleId}/sessions/${sessionId}`)
}

function stripAnswerFields(moduleData) {
  return {
    ...moduleData,
    questions: (moduleData.questions ?? []).map((question) => {
      const sanitized = { ...question }
      delete sanitized.correctIndex
      delete sanitized.feedbackIfWrong
      return sanitized
    }),
  }
}

function normalizeAnswerKey(questions) {
  if (!Array.isArray(questions)) {
    return null
  }

  const entries = questions
    .filter((question) => question?.id && typeof question.correctIndex === 'number')
    .map((question) => [question.id, { correctIndex: question.correctIndex }])

  return entries.length > 0 ? new Map(entries) : null
}

function timestampExpired(value) {
  return Boolean(value?.toMillis && value.toMillis() <= Date.now())
}

async function getFinalTestOptions(courseId, moduleId) {
  const snap = await optionsRef(courseId, moduleId).get()
  const data = snap.data() ?? {}
  const maxAttempts = Number(data.maxAttempts)

  return {
    accessMode: data.accessMode ?? 'either',
    allowAiAssistant: Boolean(data.allowAiAssistant),
    maxAttempts: Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : 1,
  }
}

function getEffectiveMaxAttempts(options, permission) {
  const studentLimit = Number(permission?.maxAttempts)
  if (Number.isFinite(studentLimit) && studentLimit > 0) {
    return studentLimit
  }

  return options.maxAttempts
}

async function countStudentFinalTestAttempts(courseId, moduleId, uid) {
  const snap = await db
    .collection(`courses/${courseId}/finalTests/${moduleId}/sessions`)
    .where('uid', '==', uid)
    .get()

  return snap.size
}

async function assertFinalTestPermission(courseId, moduleId, uid) {
  const role = await getUserRole(uid)
  if (role === 'teacher' || role === 'admin') {
    return { teacher: true, permission: null, options: await getFinalTestOptions(courseId, moduleId) }
  }

  const permissionSnap = await permissionRef(courseId, moduleId, uid).get()
  const permission = permissionSnap.data()
  if (!permission?.allowed || timestampExpired(permission.passcodeExpiresAt)) {
    throw new functions.https.HttpsError('permission-denied', 'Final test access required')
  }

  return { teacher: false, permission, options: await getFinalTestOptions(courseId, moduleId) }
}

async function assertAttemptsRemaining(courseId, moduleId, uid, access) {
  if (access.teacher) {
    return
  }

  const attemptCount = await countStudentFinalTestAttempts(courseId, moduleId, uid)
  const maxAttempts = getEffectiveMaxAttempts(access.options, access.permission)
  if (attemptCount >= maxAttempts) {
    throw new functions.https.HttpsError('resource-exhausted', 'No final test attempts remaining')
  }
}

async function getFinalTestModule(courseId, moduleId) {
  const moduleSnap = await moduleRef(courseId, moduleId).get()
  if (moduleSnap.exists) {
    const moduleData = moduleSnap.data()
    if (Array.isArray(moduleData.questions) && moduleData.questions.length > 0) {
      return moduleData
    }
  }

  return BUNDLED_FINAL_TESTS[bundledKey(courseId, moduleId)] ?? null
}

async function getAnswerKey(courseId, moduleId) {
  const configSnap = await configRef(courseId, moduleId).get()
  const storedKey = normalizeAnswerKey(configSnap.data()?.answerKey?.questions)
  if (storedKey) {
    return storedKey
  }

  const bundled = normalizeAnswerKey(BUNDLED_FINAL_TESTS[bundledKey(courseId, moduleId)]?.questions)
  if (bundled) {
    return bundled
  }

  const legacyModule = await getFinalTestModule(courseId, moduleId)
  const legacyKey = normalizeAnswerKey(legacyModule?.questions)
  if (legacyKey) {
    return legacyKey
  }

  throw new functions.https.HttpsError('failed-precondition', 'Final test answer key is not configured')
}

exports.setFinalTestPasscode = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    await assertTeacher(context.auth?.uid)

    const { courseId, moduleId, passcode, accessMode, passcodeValidMinutes } = data ?? {}
    if (!courseId || !moduleId) {
      throw new functions.https.HttpsError('invalid-argument', 'courseId and moduleId are required')
    }

    const mode = accessMode ?? 'either'
    if (!['passcode', 'teacher', 'either'].includes(mode)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid accessMode')
    }

    const payload = {
      accessMode: mode,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: context.auth.uid,
    }

    if (typeof passcode === 'string' && passcode.trim()) {
      const minutes = Number(passcodeValidMinutes)
      if (!Number.isFinite(minutes) || minutes <= 0) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'passcodeValidMinutes must be a positive number when setting a passcode',
        )
      }

      payload.passcode = passcode.trim()
      payload.passcodeSet = true
      payload.passcodeExpiresAt = admin.firestore.Timestamp.fromMillis(
        Date.now() + minutes * 60 * 1000,
      )
    }

    await configRef(courseId, moduleId).set(payload, { merge: true })

    return { ok: true }
  })

exports.verifyFinalTestPasscode = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Sign in required')
    }

    const { courseId, moduleId, passcode } = data ?? {}
    if (!courseId || !moduleId || !passcode) {
      throw new functions.https.HttpsError('invalid-argument', 'courseId, moduleId, and passcode are required')
    }

    const configSnap = await configRef(courseId, moduleId).get()
    const config = configSnap.data() ?? {}
    const stored = config.passcode
    if (!stored || stored !== String(passcode).trim()) {
      return { ok: false, reason: 'invalid' }
    }

    const expiresAt = config.passcodeExpiresAt
    if (expiresAt?.toMillis && expiresAt.toMillis() <= Date.now()) {
      return { ok: false, reason: 'expired' }
    }

    await permissionRef(courseId, moduleId, context.auth.uid).set(
      {
        allowed: true,
        method: 'passcode',
        grantedAt: admin.firestore.FieldValue.serverTimestamp(),
        passcodeExpiresAt: expiresAt ?? null,
      },
      { merge: true },
    )

    return { ok: true }
  })

exports.getFinalTestContent = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid
    if (!uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Sign in required')
    }

    const courseId = requireId(data?.courseId, 'courseId')
    const moduleId = requireId(data?.moduleId, 'moduleId')
    const access = await assertFinalTestPermission(courseId, moduleId, uid)
    await assertAttemptsRemaining(courseId, moduleId, uid, access)

    const moduleData = await getFinalTestModule(courseId, moduleId)
    if (!moduleData || moduleData.type !== 'final-test') {
      throw new functions.https.HttpsError('not-found', 'Final test not found')
    }

    return stripAnswerFields(moduleData)
  })

exports.submitFinalTestAnswer = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid
    if (!uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Sign in required')
    }

    const courseId = requireId(data?.courseId, 'courseId')
    const moduleId = requireId(data?.moduleId, 'moduleId')
    const sessionId = requireId(data?.sessionId, 'sessionId')
    const questionId = requireId(data?.questionId, 'questionId')
    const selectedOriginalIndex = Number(data?.selectedOriginalIndex)
    if (!Number.isInteger(selectedOriginalIndex) || selectedOriginalIndex < 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'selectedOriginalIndex must be a non-negative integer',
      )
    }

    await assertFinalTestPermission(courseId, moduleId, uid)
    const answerKey = await getAnswerKey(courseId, moduleId)
    const expected = answerKey.get(questionId)
    if (!expected) {
      throw new functions.https.HttpsError('not-found', 'Question not found')
    }

    const result = await db.runTransaction(async (transaction) => {
      const ref = sessionRef(courseId, moduleId, sessionId)
      const snap = await transaction.get(ref)
      const session = snap.data()
      if (!snap.exists || session?.uid !== uid) {
        throw new functions.https.HttpsError('permission-denied', 'Session not found')
      }
      if (session.status !== 'in-progress') {
        throw new functions.https.HttpsError('failed-precondition', 'Session is not active')
      }

      const previousAnswers = session.answers ?? {}
      const previous = previousAnswers[questionId]
      if (previous) {
        return {
          isCorrect: Boolean(previous.isCorrect),
          selectedOriginalIndex: previous.selectedOriginalIndex,
        }
      }

      const isCorrect = selectedOriginalIndex === expected.correctIndex
      const storedAnswer = {
        isCorrect,
        selectedOriginalIndex,
        answeredAt: admin.firestore.Timestamp.now(),
      }

      transaction.update(ref, {
        answers: {
          ...previousAnswers,
          [questionId]: storedAnswer,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      return {
        isCorrect,
        selectedOriginalIndex,
      }
    })

    return result
  })

exports.completeFinalTestSession = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid
    if (!uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Sign in required')
    }

    const courseId = requireId(data?.courseId, 'courseId')
    const moduleId = requireId(data?.moduleId, 'moduleId')
    const sessionId = requireId(data?.sessionId, 'sessionId')
    const elapsedSeconds = Number(data?.elapsedSeconds) || 0
    const fullscreenExits = Number(data?.fullscreenExits) || 0
    const tabSwitches = Number(data?.tabSwitches) || 0
    const copyAttempts = Number(data?.copyAttempts) || 0
    const answerKey = await getAnswerKey(courseId, moduleId)

    const result = await db.runTransaction(async (transaction) => {
      const ref = sessionRef(courseId, moduleId, sessionId)
      const snap = await transaction.get(ref)
      const session = snap.data()
      if (!snap.exists || session?.uid !== uid) {
        throw new functions.https.HttpsError('permission-denied', 'Session not found')
      }

      if (session.status === 'completed') {
        return {
          scoreCorrect: Number(session.scoreCorrect) || 0,
          scoreTotal: Number(session.scoreTotal) || answerKey.size,
        }
      }

      if (session.status !== 'in-progress') {
        throw new functions.https.HttpsError('failed-precondition', 'Session is not active')
      }

      const answers = session.answers ?? {}
      const scoreCorrect = Object.values(answers).filter((answer) => answer?.isCorrect).length
      const scoreTotal = answerKey.size

      transaction.update(ref, {
        endedAt: admin.firestore.FieldValue.serverTimestamp(),
        elapsedSeconds,
        scoreCorrect,
        scoreTotal,
        fullscreenExits,
        tabSwitches,
        copyAttempts,
        status: 'completed',
      })

      return { scoreCorrect, scoreTotal }
    })

    return result
  })
