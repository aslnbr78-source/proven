const assert = require('node:assert/strict')
const test = require('node:test')

const { _test } = require('./finalTest')

function timestamp(ms) {
  return { toMillis: () => ms }
}

test('final-test start authorization honors teacher grants by access mode', () => {
  const permission = { allowed: true, method: 'teacher' }

  assert.deepEqual(_test.canStartFinalTest(permission, 'teacher'), { ok: true })
  assert.deepEqual(_test.canStartFinalTest(permission, 'either'), { ok: true })
  assert.equal(_test.canStartFinalTest(permission, 'passcode').ok, false)
})

test('final-test start authorization rejects expired passcode permissions', () => {
  const now = 1_000
  const permission = {
    allowed: true,
    method: 'passcode',
    passcodeExpiresAt: timestamp(now - 1),
  }

  assert.deepEqual(_test.canStartFinalTest(permission, 'passcode', now), {
    ok: false,
    reason: 'expired',
  })
})

test('final-test start authorization accepts unexpired passcodes only when enabled', () => {
  const now = 1_000
  const permission = {
    allowed: true,
    method: 'passcode',
    passcodeExpiresAt: timestamp(now + 1),
  }

  assert.deepEqual(_test.canStartFinalTest(permission, 'passcode', now), { ok: true })
  assert.deepEqual(_test.canStartFinalTest(permission, 'either', now), { ok: true })
  assert.equal(_test.canStartFinalTest(permission, 'teacher', now).ok, false)
})

test('effective max attempts prefers student override before test default', () => {
  assert.equal(_test.getEffectiveMaxAttempts({ maxAttempts: 3 }, { maxAttempts: 2 }), 2)
  assert.equal(_test.getEffectiveMaxAttempts({ maxAttempts: 3 }, {}), 3)
  assert.equal(_test.getEffectiveMaxAttempts({}, {}), 1)
})

test('session payload sanitizers reject impossible scores and counters', () => {
  assert.deepEqual(_test.sanitizeScorePayload({ scoreCorrect: 4, scoreTotal: 5 }), {
    scoreCorrect: 4,
    scoreTotal: 5,
  })
  assert.throws(() => _test.sanitizeScorePayload({ scoreCorrect: 6, scoreTotal: 5 }), {
    code: 'invalid-argument',
  })
  assert.throws(() => _test.sanitizeSessionCounters({ tabSwitches: -1 }), {
    code: 'invalid-argument',
  })
})
