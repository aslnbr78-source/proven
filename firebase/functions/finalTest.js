const functions = require('firebase-functions')
const admin = require('firebase-admin')

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()

const ACCESS_MODES = new Set(['passcode', 'teacher', 'either'])
const SESSION_COUNTER_FIELDS = ['elapsedSeconds', 'fullscreenExits', 'tabSwitches', 'copyAttempts']

async function assertTeacher(uid) {
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required')
  }

  const userSnap = await db.doc(`users/${uid}`).get()
  const role = userSnap.data()?.role
  if (role !== 'teacher' && role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Teacher access required')
  }
}

function configRef(courseId, moduleId) {
  return db.doc(`courses/${courseId}/finalTests/${moduleId}`)
}

function permissionRef(courseId, moduleId, uid) {
  return db.doc(`courses/${courseId}/finalTests/${moduleId}/permissions/${uid}`)
}

function optionsRef(courseId, moduleId) {
  return db.doc(`courses/${courseId}/finalTestOptions/${moduleId}`)
}

function sessionsRef(courseId, moduleId) {
  return db.collection(`courses/${courseId}/finalTests/${moduleId}/sessions`)
}

function sessionRef(courseId, moduleId, sessionId) {
  return db.doc(`courses/${courseId}/finalTests/${moduleId}/sessions/${sessionId}`)
}

function requireSignedIn(context) {
  const uid = context.auth?.uid
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required')
  }
  return uid
}

function requireCourseAndModule(courseId, moduleId) {
  if (!courseId || !moduleId) {
    throw new functions.https.HttpsError('invalid-argument', 'courseId and moduleId are required')
  }
}

function timestampMillis(value) {
  if (!value) {
    return null
  }
  if (typeof value.toMillis === 'function') {
    return value.toMillis()
  }
  if (typeof value.seconds === 'number') {
    return value.seconds * 1000
  }
  if (value instanceof Date) {
    return value.getTime()
  }
  if (typeof value === 'number') {
    return value
  }
  return null
}

function getAccessMode(options = {}, config = {}) {
  const mode = options.accessMode ?? config.accessMode ?? 'either'
  return ACCESS_MODES.has(mode) ? mode : 'either'
}

function getEffectiveMaxAttempts(options = {}, permission = {}) {
  const studentLimit = Number(permission.maxAttempts)
  if (Number.isFinite(studentLimit) && studentLimit > 0) {
    return Math.floor(studentLimit)
  }

  const globalLimit = Number(options.maxAttempts)
  if (Number.isFinite(globalLimit) && globalLimit > 0) {
    return Math.floor(globalLimit)
  }

  return 1
}

function canStartFinalTest(permission = {}, accessMode = 'either', now = Date.now()) {
  if (!permission.allowed) {
    return { ok: false, reason: 'missing-permission' }
  }

  if (permission.method === 'teacher') {
    return accessMode === 'teacher' || accessMode === 'either'
      ? { ok: true }
      : { ok: false, reason: 'teacher-grant-disabled' }
  }

  if (permission.method === 'passcode') {
    if (accessMode !== 'passcode' && accessMode !== 'either') {
      return { ok: false, reason: 'passcode-disabled' }
    }

    const expiresAtMillis = timestampMillis(permission.passcodeExpiresAt)
    if (expiresAtMillis != null && expiresAtMillis <= now) {
      return { ok: false, reason: 'expired' }
    }

    return { ok: true }
  }

  return { ok: false, reason: 'unknown-permission-method' }
}

function sanitizeText(value) {
  return typeof value === 'string' ? value.slice(0, 500) : ''
}

function sanitizeNonNegativeInteger(value, fieldName, { required = false } = {}) {
  if (value == null && !required) {
    return null
  }

  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) {
    throw new functions.https.HttpsError('invalid-argument', `${fieldName} must be a non-negative number`)
  }

  return Math.floor(number)
}

function sanitizeSessionCounters(data = {}) {
  const payload = {}
  SESSION_COUNTER_FIELDS.forEach((field) => {
    if (data[field] != null) {
      payload[field] = sanitizeNonNegativeInteger(data[field], field)
    }
  })
  return payload
}

function sanitizeScorePayload(data = {}) {
  const scoreCorrect = sanitizeNonNegativeInteger(data.scoreCorrect, 'scoreCorrect', { required: true })
  const scoreTotal = sanitizeNonNegativeInteger(data.scoreTotal, 'scoreTotal', { required: true })

  if (scoreTotal <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'scoreTotal must be greater than zero')
  }
  if (scoreCorrect > scoreTotal) {
    throw new functions.https.HttpsError('invalid-argument', 'scoreCorrect cannot exceed scoreTotal')
  }

  return { scoreCorrect, scoreTotal }
}

async function getStudentIdentity(uid, token = {}) {
  const userSnap = await db.doc(`users/${uid}`).get()
  const profile = userSnap.data() ?? {}

  return {
    studentEmail: profile.email || token.email || '',
    studentName: profile.displayName || token.name || '',
  }
}

async function assertSessionOwner(courseId, moduleId, sessionId, uid) {
  if (!sessionId) {
    throw new functions.https.HttpsError('invalid-argument', 'sessionId is required')
  }

  const ref = sessionRef(courseId, moduleId, sessionId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Final test session not found')
  }

  const session = snap.data() ?? {}
  if (session.uid !== uid) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot update another student session')
  }
  if (session.status !== 'in-progress') {
    throw new functions.https.HttpsError('failed-precondition', 'Final test session is not in progress')
  }

  return ref
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

exports.startFinalTestSession = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const uid = requireSignedIn(context)
    const { courseId, moduleId } = data ?? {}
    requireCourseAndModule(courseId, moduleId)

    const [configSnap, optionsSnap, permissionSnap] = await Promise.all([
      configRef(courseId, moduleId).get(),
      optionsRef(courseId, moduleId).get(),
      permissionRef(courseId, moduleId, uid).get(),
    ])

    const config = configSnap.data() ?? {}
    const options = optionsSnap.data() ?? {}
    const permission = permissionSnap.data() ?? {}
    const access = canStartFinalTest(permission, getAccessMode(options, config))
    if (!access.ok) {
      throw new functions.https.HttpsError('permission-denied', 'Final test access is not active', {
        reason: access.reason,
      })
    }

    const maxAttempts = getEffectiveMaxAttempts(options, permission)
    const attemptsSnap = await sessionsRef(courseId, moduleId).where('uid', '==', uid).get()
    if (attemptsSnap.size >= maxAttempts) {
      throw new functions.https.HttpsError('resource-exhausted', 'No final test attempts remaining')
    }

    const identity = await getStudentIdentity(uid, context.auth?.token)
    const timeLimitSeconds = sanitizeNonNegativeInteger(data.timeLimitSeconds, 'timeLimitSeconds')
    const ref = await sessionsRef(courseId, moduleId).add({
      uid,
      ...identity,
      courseId,
      moduleId,
      moduleTitle: sanitizeText(data.moduleTitle),
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      endedAt: null,
      timeLimitSeconds,
      elapsedSeconds: 0,
      fullscreenExits: 0,
      tabSwitches: 0,
      copyAttempts: 0,
      scoreCorrect: null,
      scoreTotal: null,
      status: 'in-progress',
    })

    return { ok: true, sessionId: ref.id }
  })

exports.updateFinalTestSession = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const uid = requireSignedIn(context)
    const { courseId, moduleId, sessionId, patch } = data ?? {}
    requireCourseAndModule(courseId, moduleId)

    const payload = sanitizeSessionCounters(patch)
    if (Object.keys(payload).length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'No valid session fields provided')
    }

    const ref = await assertSessionOwner(courseId, moduleId, sessionId, uid)
    await ref.set(payload, { merge: true })

    return { ok: true }
  })

exports.completeFinalTestSession = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const uid = requireSignedIn(context)
    const { courseId, moduleId, sessionId } = data ?? {}
    requireCourseAndModule(courseId, moduleId)

    const score = sanitizeScorePayload(data)
    const counters = sanitizeSessionCounters(data)
    const ref = await assertSessionOwner(courseId, moduleId, sessionId, uid)
    await ref.set(
      {
        ...counters,
        ...score,
        endedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'completed',
      },
      { merge: true },
    )

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

exports._test = {
  canStartFinalTest,
  getEffectiveMaxAttempts,
  sanitizeScorePayload,
  sanitizeSessionCounters,
  timestampMillis,
}
