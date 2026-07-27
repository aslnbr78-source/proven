const { HttpsError } = require('firebase-functions/v2/https')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const DAY_MS = 24 * 60 * 60 * 1000

function buildRateLimitState({
  data = {},
  nowMillis,
  minIntervalMs,
  dailyLimit,
}) {
  const lastRequestMillis = Number(data.lastRequestMillis) || 0
  if (lastRequestMillis > 0 && nowMillis - lastRequestMillis < minIntervalMs) {
    const retryAfterSeconds = Math.max(1, Math.ceil((minIntervalMs - (nowMillis - lastRequestMillis)) / 1000))
    throw new HttpsError(
      'resource-exhausted',
      `Too many AI requests. Try again in ${retryAfterSeconds} seconds.`,
    )
  }

  const storedWindowStart = Number(data.windowStartMillis) || 0
  const windowStartMillis =
    storedWindowStart > 0 && nowMillis - storedWindowStart < DAY_MS ? storedWindowStart : nowMillis
  const currentCount = windowStartMillis === storedWindowStart ? Number(data.count) || 0 : 0

  if (currentCount >= dailyLimit) {
    throw new HttpsError('resource-exhausted', 'Daily AI request limit reached. Try again tomorrow.')
  }

  return {
    count: currentCount + 1,
    lastRequestMillis: nowMillis,
    windowStartMillis,
  }
}

async function enforceAiRateLimit({
  uid,
  key,
  minIntervalMs,
  dailyLimit,
  nowMillis = Date.now(),
}) {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }

  const db = getFirestore()
  const ref = db.doc(`users/${uid}/rateLimits/${key}`)

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref)
    const nextState = buildRateLimitState({
      data: snap.exists ? snap.data() : {},
      nowMillis,
      minIntervalMs,
      dailyLimit,
    })

    transaction.set(
      ref,
      {
        ...nextState,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  })
}

module.exports = {
  buildRateLimitState,
  enforceAiRateLimit,
}
