import { useEffect, useState } from 'react'
import { getModuleAiOptions, saveModuleAiOptions } from '../services/aiInsightsService'

function QuizAiControl({ courseId, moduleId, moduleTitle }) {
  const [quizHintOnly, setQuizHintOnly] = useState(true)
  const [quizAllowFullAnswers, setQuizAllowFullAnswers] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getModuleAiOptions(courseId, moduleId).then((options) => {
      setQuizHintOnly(options.quizHintOnly)
      setQuizAllowFullAnswers(options.quizAllowFullAnswers)
    })
  }, [courseId, moduleId])

  const handleSave = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      await saveModuleAiOptions({
        courseId,
        moduleId,
        patch: { quizHintOnly, quizAllowFullAnswers },
      })
      setMessage('Quiz AI settings saved.')
    } catch (error) {
      setMessage(error.message || 'Could not save settings.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card-modern !p-4">
      <h3 className="font-bold text-amber-900">Quiz AI controls</h3>
      <p className="mt-1 text-xs text-slate-600">{moduleTitle}</p>

      {message && (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{message}</p>
      )}

      <form onSubmit={handleSave} className="mt-4 space-y-3">
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <input
            type="checkbox"
            checked={quizHintOnly}
            onChange={(e) => setQuizHintOnly(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-xs leading-relaxed text-slate-700">
            <span className="font-semibold text-slate-900">Hint-only mode during quiz</span>
            <span className="mt-0.5 block text-slate-500">
              AI tutor gives Socratic hints only — no final answers while the quiz is active.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <input
            type="checkbox"
            checked={quizAllowFullAnswers}
            onChange={(e) => setQuizAllowFullAnswers(e.target.checked)}
            disabled={!quizHintOnly}
            className="mt-0.5"
          />
          <span className="text-xs leading-relaxed text-slate-700">
            <span className="font-semibold text-slate-900">Allow full AI explanations</span>
            <span className="mt-0.5 block text-slate-500">
              Override hint-only and allow complete explanations (not recommended for graded quizzes).
            </span>
          </span>
        </label>

        <button type="submit" disabled={busy} className="btn-primary !py-1.5 !text-xs">
          Save AI settings
        </button>
      </form>
    </div>
  )
}

export default QuizAiControl
