import katex from 'katex'
import { MARKUP_STYLES, splitRichText } from '../utils/richTextMarkup'

const MATH_REGEX = /(\$\$[\s\S]+?\$\$|\$(?:\\.|[^$\\])+\$)/g

function renderMath(expression, displayMode) {
  return katex.renderToString(expression, { displayMode, throwOnError: false })
}

function MarkupSpan({ type, content, detail }) {
  const className = MARKUP_STYLES[type] ?? MARKUP_STYLES.kw

  if (type === 'def' && detail) {
    return (
      <span className={className} title={detail}>
        {content}
        <span className="rt-def-detail"> — {detail}</span>
      </span>
    )
  }

  return <span className={className}>{content}</span>
}

function renderPlainSegment(segment, keyPrefix) {
  return splitRichText(segment).map((part, index) => {
    if (part.kind === 'text') {
      return <span key={`${keyPrefix}-t-${index}`}>{part.value}</span>
    }
    return (
      <MarkupSpan
        key={`${keyPrefix}-m-${index}`}
        type={part.type}
        content={part.content}
        detail={part.detail}
      />
    )
  })
}

function MathText({ text, className = '' }) {
  const parts = text.split(MATH_REGEX)

  return (
    <p className={className || undefined}>
      {parts.map((part, index) => {
        if (part.startsWith('$$') && part.endsWith('$$')) {
          const html = renderMath(part.slice(2, -2).trim(), true)
          return (
            <span
              key={index}
              className="math-display my-3 block overflow-x-auto rounded-lg bg-slate-900/5 px-4 py-3"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )
        }

        if (part.startsWith('$') && part.endsWith('$')) {
          const html = renderMath(part.slice(1, -1).trim(), false)
          return (
            <span
              key={index}
              className="math-inline"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )
        }

        return <span key={index}>{renderPlainSegment(part, `p${index}`)}</span>
      })}
    </p>
  )
}

export default MathText
