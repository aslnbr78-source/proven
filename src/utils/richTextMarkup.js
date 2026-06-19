/**
 * Inline markup for lesson JSON strings (works alongside $...$ math).
 *
 * [[kw:slope]]     — vocabulary keyword (indigo pill)
 * [[def:y-intercept]] — definition term (teal)
 * [[imp:Remember this]] — important emphasis (amber)
 * [[note:Teacher tip here]] — note (sky callout inline)
 * [[slope]]        — shorthand for [[kw:slope]]
 */

const MARKUP_REGEX = /\[\[(?:(kw|def|imp|note):)?([^\]|]+)(?:\|([^\]]+))?\]\]/g

export const MARKUP_STYLES = {
  kw: 'rt-kw',
  def: 'rt-def',
  imp: 'rt-imp',
  note: 'rt-note',
}

export function splitRichText(segment) {
  if (!segment) {
    return []
  }

  const parts = []
  let lastIndex = 0
  let match

  MARKUP_REGEX.lastIndex = 0
  while ((match = MARKUP_REGEX.exec(segment)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: 'text', value: segment.slice(lastIndex, match.index) })
    }

    const explicitType = match[1]
    const primary = match[2]?.trim() ?? ''
    const secondary = match[3]?.trim()

    let type = explicitType || 'kw'
    let content = primary

    if (!explicitType && secondary) {
      type = 'def'
      content = primary
    }

    parts.push({
      kind: 'markup',
      type,
      content,
      detail: secondary,
    })

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < segment.length) {
    parts.push({ kind: 'text', value: segment.slice(lastIndex) })
  }

  return parts.length > 0 ? parts : [{ kind: 'text', value: segment }]
}
