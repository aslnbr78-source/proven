const functions = require('firebase-functions')
const admin = require('firebase-admin')

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()
const MIN_PASSCODE_LENGTH = 6
const MAX_FAILED_PASSCODE_ATTEMPTS = 5
const PASSCODE_LOCKOUT_MS = 15 * 60 * 1000

function normalizePasscode(passcode) {
  return String(passcode ?? '').trim()
}

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

function passcodeAttemptRef(courseId, moduleId, uid) {
  return db.doc(`courses/${courseId}/finalTests/${moduleId}/passcodeAttempts/${uid}`)
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

    const trimmedPasscode = normalizePasscode(passcode)
    if (trimmedPasscode) {
      if (trimmedPasscode.length < MIN_PASSCODE_LENGTH) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          `Passcode must be at least ${MIN_PASSCODE_LENGTH} characters`,
        )
      }

      const minutes = Number(passcodeValidMinutes)
      if (!Number.isFinite(minutes) || minutes <= 0) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'passcodeValidMinutes must be a positive number when setting a passcode',
        )
      }

      payload.passcode = trimmedPasscode
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
    const submittedPasscode = normalizePasscode(passcode)
    if (!courseId || !moduleId || !submittedPasscode) {
      throw new functions.https.HttpsError('invalid-argument', 'courseId, moduleId, and passcode are required')
    }

    return db.runTransaction(async (transaction) => {
      const now = Date.now()
      const configDoc = configRef(courseId, moduleId)
      const attemptDoc = passcodeAttemptRef(courseId, moduleId, context.auth.uid)
      const permissionDoc = permissionRef(courseId, moduleId, context.auth.uid)

      const [configSnap, attemptSnap] = await Promise.all([
        transaction.get(configDoc),
        transaction.get(attemptDoc),
      ])

      const attempt = attemptSnap.data() ?? {}
      const lockedUntilMillis = attempt.lockedUntil?.toMillis?.() ?? 0
      if (lockedUntilMillis > now) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          'Too many incorrect passcode attempts. Try again later.',
        )
      }

      const config = configSnap.data() ?? {}
      const stored = config.passcode
      if (!stored || stored !== submittedPasscode) {
        const failedCount =
          lockedUntilMillis > 0 && lockedUntilMillis <= now ? 1 : Number(attempt.failedCount ?? 0) + 1
        const shouldLock = failedCount >= MAX_FAILED_PASSCODE_ATTEMPTS
        transaction.set(attemptDoc, {
          failedCount,
          lastFailedAt: admin.firestore.FieldValue.serverTimestamp(),
          lockedUntil: shouldLock
            ? admin.firestore.Timestamp.fromMillis(now + PASSCODE_LOCKOUT_MS)
            : null,
        })
        return { ok: false, reason: 'invalid' }
      }

      const expiresAt = config.passcodeExpiresAt
      if (expiresAt?.toMillis && expiresAt.toMillis() <= now) {
        return { ok: false, reason: 'expired' }
      }

      transaction.delete(attemptDoc)
      transaction.set(
        permissionDoc,
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
  })
