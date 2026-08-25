import MathBlock from './MathBlock'

function stripMarkup(text) {
  return String(text ?? '')
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/\$+/g, '')
    .trim()
}

function QuestionReviewPanel({
  questions,
  answered,
  currentIndex,
  onSelectQuestion,
  onClose,
  onSubmit,
  submitLabel = 'Submit',
  submitDisabled = false,
  submitDisabledMessage,
}) {
  const answeredCount = questions.filter((item) => answered[item.id]).length
  const unansweredCount = questions.length - answeredCount

  return (
    <div className="review-panel">
      <div className="review-panel-header">
        <div>
          <h3 className="review-panel-title">Review your answers</h3>
          <p className="review-panel-subtitle">
            {answeredCount} answered · {unansweredCount} unanswered — tap a question to change it
          </p>
        </div>
        <button type="button" onClick={onClose} className="review-panel-close">
          ✕
        </button>
      </div>

      <ul className="review-panel-list">
        {questions.map((item, index) => {
          const isAnswered = Boolean(answered[item.id])
          const isCurrent = index === currentIndex
          const preview = stripMarkup(item.prompt)

          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelectQuestion(index)}
                className={`review-panel-item ${isCurrent ? 'review-panel-item-current' : ''}`}
              >
                <span className="review-panel-item-num">Q{index + 1}</span>
                <span className="review-panel-item-body">
                  <span className="review-panel-item-preview">
                    {preview ? <MathBlock text={preview.slice(0, 120)} /> : `Question ${index + 1}`}
                  </span>
                  <span
                    className={`review-panel-status ${
                      isAnswered ? 'review-panel-status-done' : 'review-panel-status-open'
                    }`}
                  >
                    {isAnswered ? 'Answered' : 'Unanswered'}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="review-panel-actions">
        <button type="button" onClick={onClose} className="btn-secondary">
          Back to test
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitDisabled}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
      {submitDisabled && submitDisabledMessage && (
        <p className="mt-3 text-sm font-medium text-rose-700">{submitDisabledMessage}</p>
      )}
    </div>
  )
}

export default QuestionReviewPanel
