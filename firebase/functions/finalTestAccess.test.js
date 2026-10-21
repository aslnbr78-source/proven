/* global require */

const assert = require('node:assert/strict')
const test = require('node:test')
const { evaluatePasscodeAccess, normalizeAccessMode } = require('./finalTestAccess')

test('normalizes missing or unknown access modes to either', () => {
  assert.equal(normalizeAccessMode(undefined), 'either')
  assert.equal(normalizeAccessMode('unexpected'), 'either')
  assert.equal(normalizeAccessMode('teacher'), 'teacher')
})

test('grants access for a matching active passcode outside teacher-only mode', () => {
  const result = evaluatePasscodeAccess(
    {
      accessMode: 'passcode',
      passcode: '123456',
      passcodeExpiresAt: { toMillis: () => 2000 },
    },
    '123456',
    1000,
  )

  assert.deepEqual(result, { ok: true })
})

test('rejects a stale passcode when access mode is teacher-only', () => {
  const result = evaluatePasscodeAccess(
    {
      accessMode: 'teacher',
      passcode: '123456',
      passcodeExpiresAt: { toMillis: () => 2000 },
    },
    '123456',
    1000,
  )

  assert.deepEqual(result, { ok: false, reason: 'disabled' })
})

test('rejects expired passcodes', () => {
  const result = evaluatePasscodeAccess(
    {
      accessMode: 'either',
      passcode: '123456',
      passcodeExpiresAt: { toMillis: () => 1000 },
    },
    '123456',
    1000,
  )

  assert.deepEqual(result, { ok: false, reason: 'expired' })
})
