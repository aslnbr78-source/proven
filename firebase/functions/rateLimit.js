const { HttpsError } = require('firebase-functions/v2/https')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

function toPositiveInteger(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback
}

function buildRateLimitState({
  data = {},
  nowMillis = Date.now(),
  max,
  windowMs,
}) {
  const limit = toPositiveInteger(max, 1)
  const duration = toPositiveInteger(windowMs, 60 * 60 * 1000)
  const storedWindowStart = Number(data.windowStartMillis) || 0
  const activeWindow =
    storedWindowStart > 0 && nowMillis - storedWindowStart < duration
  const windowStartMillis = activeWindow ? storedWindowStart : nowMillis
  const currentCount = activeWindow ? Number(data.count) || 0 : 0

  if (currentCount >= limit) {
    throw new HttpsError(
      'resource-exhausted',
      'Too many AI practice requests. Try again later.',
    )
  }

  return {
    count: currentCount + 1,
    windowStartMillis,
  }
}

async function assertRateLimit(key, options = {}) {
  if (!key) {
    throw new HttpsError('invalid-argument', 'Rate limit key is required.')
  }

  const safeKey = encodeURIComponent(String(key))
  const ref = getFirestore().doc(`rateLimits/${safeKey}`)

  await getFirestore().runTransaction(async (transaction) => {
    const snap = await transaction.get(ref)
    const nextState = buildRateLimitState({
      data: snap.exists ? snap.data() : {},
      max: options.max,
      windowMs: options.windowMs,
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
  assertRateLimit,
  buildRateLimitState,
}
