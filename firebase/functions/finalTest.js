const functions = require('firebase-functions')
const admin = require('firebase-admin')

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
