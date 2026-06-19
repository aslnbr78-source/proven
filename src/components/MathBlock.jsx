import MathText from './MathText'

function MathBlock({ text, className = '' }) {
  if (Array.isArray(text)) {
    return (
      <div className={`space-y-3 ${className}`}>
        {text.map((paragraph) => (
          <MathText key={paragraph} text={paragraph} />
        ))}
      </div>
    )
  }

  return (
    <div className={className}>
      <MathText text={text} />
    </div>
  )
}

export default MathBlock
