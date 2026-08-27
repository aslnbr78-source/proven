import { useState } from 'react'
import { generatePracticeProblems } from '../services/tutorService'
import LessonSection from './LessonSection'
import MathBlock from './MathBlock'

function PracticeGenerator({ moduleTitle, lessonObjective, questionContext }) {
  const [problems, setProblems] = useState([])
  const [revealed, setRevealed] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleGenerate = async () => {
    setLoading(true)
    setError('')
    setRevealed({})
    try {
      const generated = await generatePracticeProblems({
        moduleTitle,
        lessonObjective,
        questionContext,
        count: 5,
      })
      setProblems(generated)
    } catch (err) {
      setError(err.message || 'Could not generate practice problems.')
      setProblems([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <LessonSection variant="practice" title="Extra practice (AI)">
      <p className="text-sm text-slate-600">
        Generate five more problems like this lesson. These are for practice only — not graded.
      </p>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="btn-primary mt-4"
      >
        {loading ? 'Generating…' : 'Generate 5 practice problems'}
      </button>

      {error && (
        <p className="mt-3 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</p>
      )}

      {problems.length > 0 && (
        <ol className="mt-5 space-y-4">
          {problems.map((problem, index) => (
            <li key={problem.id} className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
              <p className="text-xs font-bold text-violet-800">Problem {index + 1}</p>
              <MathBlock text={problem.prompt} className="mt-2 text-slate-900" />
              {problem.hint && (
                <p className="mt-2 text-xs text-slate-600">
                  Hint: <MathBlock text={problem.hint} className="inline" />
                </p>
              )}
              <button
                type="button"
                onClick={() =>
                  setRevealed((previous) => ({ ...previous, [problem.id]: !previous[problem.id] }))
                }
                className="btn-secondary mt-3 !py-1 !text-xs"
              >
                {revealed[problem.id] ? 'Hide answer' : 'Show answer'}
              </button>
              {revealed[problem.id] && (
                <p className="mt-2 text-sm font-medium text-emerald-800">
                  Answer: <MathBlock text={problem.answer} className="inline" />
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </LessonSection>
  )
}

export default PracticeGenerator
