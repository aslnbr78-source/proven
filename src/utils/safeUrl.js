const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:'])

export function getSafeExternalUrl(value) {
  const candidate = String(value ?? '').trim()
  if (!candidate) {
    return null
  }

  try {
    const parsed = new URL(candidate)
    return SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol) ? parsed.href : null
  } catch {
    return null
  }
}

export function isSafeExternalUrl(value) {
  return Boolean(getSafeExternalUrl(value))
}
