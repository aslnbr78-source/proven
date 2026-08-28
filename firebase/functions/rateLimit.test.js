const assert = require('node:assert/strict')
const test = require('node:test')

const { buildRateLimitState } = require('./rateLimit')

test('rate limit increments requests inside the active window', () => {
  assert.deepEqual(
    buildRateLimitState({
      data: {
        count: 2,
        windowStartMillis: 1_000,
      },
      nowMillis: 2_000,
      max: 5,
      windowMs: 10_000,
    }),
    {
      count: 3,
      windowStartMillis: 1_000,
    },
  )
})

test('rate limit blocks once the window cap is reached', () => {
  assert.throws(
    () =>
      buildRateLimitState({
        data: {
          count: 30,
          windowStartMillis: 1_000,
        },
        nowMillis: 2_000,
        max: 30,
        windowMs: 60 * 60 * 1000,
      }),
    (error) => error.code === 'resource-exhausted',
  )
})

test('rate limit starts a new window after the old window expires', () => {
  assert.deepEqual(
    buildRateLimitState({
      data: {
        count: 30,
        windowStartMillis: 1_000,
      },
      nowMillis: 60 * 60 * 1000 + 1_000,
      max: 30,
      windowMs: 60 * 60 * 1000,
    }),
    {
      count: 1,
      windowStartMillis: 60 * 60 * 1000 + 1_000,
    },
  )
})
