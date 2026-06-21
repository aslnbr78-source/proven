function normalizeAccessMode(accessMode) {
  return ['passcode', 'teacher', 'either'].includes(accessMode) ? accessMode : 'either'
}

function evaluatePasscodeAccess(config = {}, passcode, now = Date.now()) {
  if (normalizeAccessMode(config.accessMode) === 'teacher') {
    return { ok: false, reason: 'disabled' }
  }

  const stored = config.passcode
  if (!stored || stored !== String(passcode).trim()) {
    return { ok: false, reason: 'invalid' }
  }

  const expiresAt = config.passcodeExpiresAt
  if (expiresAt?.toMillis && expiresAt.toMillis() <= now) {
    return { ok: false, reason: 'expired' }
  }

  return { ok: true }
}

module.exports = {
  evaluatePasscodeAccess,
  normalizeAccessMode,
}
