const functions = require('firebase-functions')
const admin = require('firebase-admin')
const { evaluatePasscodeAccess, normalizeAccessMode } = require('./finalTestAccess')

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()

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

exports.setFinalTestPasscode = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    await assertTeacher(context.auth?.uid)

    const { courseId, moduleId, passcode, accessMode, passcodeValidMinutes } = data ?? {}
    if (!courseId || !moduleId) {
      throw new functions.https.HttpsError('invalid-argument', 'courseId and moduleId are required')
    }

    const mode = accessMode ?? 'either'
    if (normalizeAccessMode(mode) !== mode) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid accessMode')
    }

    const payload = {
      accessMode: mode,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: context.auth.uid,
    }

    if (mode === 'teacher') {
      payload.passcode = admin.firestore.FieldValue.delete()
      payload.passcodeSet = false
      payload.passcodeExpiresAt = admin.firestore.FieldValue.delete()
    } else if (typeof passcode === 'string' && passcode.trim()) {
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
    const access = evaluatePasscodeAccess(config, passcode)
    if (!access.ok) {
      return access
    }

    const expiresAt = config.passcodeExpiresAt
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
