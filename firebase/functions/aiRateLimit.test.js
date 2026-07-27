const assert = require('node:assert/strict')
const test = require('node:test')

const { buildRateLimitState } = require('./aiRateLimit')

test('rate limit blocks requests inside the per-user cooldown', () => {
  assert.throws(
    () =>
      buildRateLimitState({
        data: {
          count: 1,
          lastRequestMillis: 10_000,
          windowStartMillis: 10_000,
        },
        nowMillis: 12_000,
        minIntervalMs: 5_000,
        dailyLimit: 120,
      }),
    (error) => error.code === 'resource-exhausted',
  )
})

test('rate limit blocks requests after the daily cap is reached', () => {
  assert.throws(
    () =>
      buildRateLimitState({
        data: {
          count: 30,
          lastRequestMillis: 1_000,
          windowStartMillis: 1_000,
        },
        nowMillis: 60_000,
        minIntervalMs: 5_000,
        dailyLimit: 30,
      }),
    (error) => error.code === 'resource-exhausted',
  )
})

test('rate limit resets the daily count after the window expires', () => {
  const nextState = buildRateLimitState({
    data: {
      count: 30,
      lastRequestMillis: 1_000,
      windowStartMillis: 1_000,
    },
    nowMillis: 24 * 60 * 60 * 1000 + 2_000,
    minIntervalMs: 5_000,
    dailyLimit: 30,
  })

  assert.deepEqual(nextState, {
    count: 1,
    lastRequestMillis: 24 * 60 * 60 * 1000 + 2_000,
    windowStartMillis: 24 * 60 * 60 * 1000 + 2_000,
  })
})

test('rate limit increments allowed requests in the active daily window', () => {
  const nextState = buildRateLimitState({
    data: {
      count: 8,
      lastRequestMillis: 1_000,
      windowStartMillis: 1_000,
    },
    nowMillis: 10_000,
    minIntervalMs: 5_000,
    dailyLimit: 30,
  })

  assert.deepEqual(nextState, {
    count: 9,
    lastRequestMillis: 10_000,
    windowStartMillis: 1_000,
  })
})
