import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useGamification } from '../context/GamificationContext'
import { recordMasteryGain, recordWrongAnswer } from '../services/skillTracker'
import LessonSection from './LessonSection'
import MathBlock from './MathBlock'
import MathText from './MathText'
import PracticeGenerator from './PracticeGenerator'
import {
  getAcceptedAnswers,
  isFillBlankQuestion,
  matchesAcceptedAnswer,
} from '../utils/answerCheck'

function HintList({ hints, hintLevel }) {
  if (hintLevel === 0) {
    return null
  }

  return (
    <div className="mt-4 space-y-2">
      {hints.slice(0, hintLevel).map((hint, index) => (
        <p key={hint} className="hint-bubble">
          <span className="font-semibold">Hint {index + 1}: </span>
          <MathBlock text={hint} className="inline" />
        </p>
      ))}
    </div>
  )
}

function QuestionActions({ hintLevel, hintCount, solved, onHint, disabled, submitLabel = 'Check answer' }) {
  return (
    <div className="flex flex-wrap gap-3">
      <button type="submit" disabled={solved || disabled} className="btn-primary">
        {submitLabel}
      </button>
      {hintLevel < hintCount && !solved && !disabled && (
        <button type="button" onClick={onHint} className="btn-secondary">
          Hint {hintLevel + 1}
        </button>
      )}
    </div>
  )
}

function ShortAnswerQuestion({ question, solved, disabled, onSolve, onWrong, onHint }) {
  const [answer, setAnswer] = useState('')
  const [hintLevel, setHintLevel] = useState(0)
  const [feedback, setFeedback] = useState('')

  const checkAnswer = (event) => {
    event.preventDefault()
    if (disabled) {
      return
    }

    const accepted = getAcceptedAnswers(question)
    if (matchesAcceptedAnswer(answer, accepted)) {
      setFeedback('Correct! Great work.')
      onSolve()
    } else {
      setFeedback('Not quite. Try again or use a hint.')
      onWrong?.(answer)
    }
  }

  const handleHint = () => {
    onHint?.()
    setHintLevel((level) => level + 1)
  }

  return (
    <>
      <div className="mt-2 text-lg leading-relaxed text-slate-800">
        <MathBlock text={question.prompt} />
      </div>
      <form onSubmit={checkAnswer} className="mt-5 space-y-4">
        <input
          type="text"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          disabled={solved || disabled}
          placeholder="Your answer"
          className="input-modern w-full max-w-sm"
        />
        <QuestionActions
          hintLevel={hintLevel}
          hintCount={question.hints.length}
          solved={solved}
          disabled={disabled}
          onHint={handleHint}
        />
      </form>
      <HintList hints={question.hints} hintLevel={hintLevel} />
      {feedback && (
        <p
          className={`mt-4 rounded-xl px-4 py-2 text-sm font-semibold ${
            feedback.startsWith('Correct')
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-rose-100 text-rose-800'
          }`}
          role="status"
        >
          {feedback}
        </p>
      )}
    </>
  )
}

function FillBlankQuestion({ question, solved, disabled, onSolve, onWrong, onHint }) {
  const blankCount = question.blanks.length
  const [values, setValues] = useState(() => Array(blankCount).fill(''))
  const [hintLevel, setHintLevel] = useState(0)
  const [feedback, setFeedback] = useState('')

  const segments = question.prompt.split('___')

  const checkAnswer = (event) => {
    event.preventDefault()
    if (disabled) {
      return
    }

    const allCorrect = question.blanks.every((blank, index) =>
      matchesAcceptedAnswer(values[index], blank.accept),
    )

    if (allCorrect) {
      setFeedback('Correct! Great work.')
      onSolve()
    } else {
      setFeedback('Not quite. Check each blank and try again.')
      onWrong?.(values.join(', '))
    }
  }

  const handleHint = () => {
    onHint?.()
    setHintLevel((level) => level + 1)
  }

  const updateBlank = (index, value) => {
    setValues((previous) => previous.map((item, i) => (i === index ? value : item)))
  }

  return (
    <>
      <form onSubmit={checkAnswer} className="mt-2 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-lg leading-relaxed text-slate-800">
          {segments.map((segment, index) => (
            <span key={`segment-${index}`} className="contents">
              {segment && <MathText text={segment} />}
              {index < blankCount && (
                <input
                  type="text"
                  value={values[index]}
                  onChange={(event) => updateBlank(index, event.target.value)}
                  disabled={solved || disabled}
                  aria-label={`Blank ${index + 1}`}
                  className="input-modern w-28 text-center"
                />
              )}
            </span>
          ))}
        </div>
        <QuestionActions
          hintLevel={hintLevel}
          hintCount={question.hints.length}
          solved={solved}
          disabled={disabled}
          onHint={handleHint}
        />
      </form>
      <HintList hints={question.hints} hintLevel={hintLevel} />
      {feedback && (
        <p
          className={`mt-4 rounded-xl px-4 py-2 text-sm font-semibold ${
            feedback.startsWith('Correct')
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-rose-100 text-rose-800'
          }`}
          role="status"
        >
          {feedback}
        </p>
      )}
    </>
  )
}

function InteractiveLesson({ data, courseId, moduleId, onComplete }) {
  const { user } = useAuth()
  const { canPlay, resetModuleHints, recordHint, recordWrong, awardModuleComplete } = useGamification()
  const [solved, setSolved] = useState(false)
  const [xpEarned, setXpEarned] = useState(null)
  const question = data.question
  const useFillBlank = isFillBlankQuestion(question)

  useEffect(() => {
    resetModuleHints()
  }, [data.id, resetModuleHints])

  const handleWrong = (attempt) => {
    recordWrong()
    if (user?.uid && courseId && moduleId) {
      recordWrongAnswer(user.uid, courseId, moduleId, attempt).catch(() => {})
    }
  }

  const handleSolve = () => {
    setSolved(true)
    const isFirstCompletion = onComplete?.() ?? true
    if (!isFirstCompletion) {
      return
    }

    const xp = awardModuleComplete('interactive-lesson')
    setXpEarned(xp)
    if (user?.uid && courseId && moduleId) {
      recordMasteryGain(user.uid, courseId, moduleId).catch(() => {})
    }
  }

  const questionProps = {
    question,
    solved,
    disabled: !canPlay,
    onSolve: handleSolve,
    onWrong: handleWrong,
    onHint: recordHint,
  }

  return (
    <div className="space-y-6">
      {!canPlay && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          You&apos;re out of hearts for today. Come back tomorrow or review the explanation and
          example above.
        </p>
      )}

      <LessonSection variant="explanation">
        <div className="leading-relaxed text-slate-700">
          <MathBlock text={data.explanation} />
        </div>
      </LessonSection>

      <LessonSection variant="example">
        <div className="text-slate-800">
          <MathBlock text={data.example.prompt} />
        </div>
        <ol className="mt-5 list-decimal space-y-3 pl-5 text-slate-700 marker:font-semibold marker:text-emerald-600">
          {data.example.steps.map((step) => (
            <li key={step}>
              <MathText text={step} />
            </li>
          ))}
        </ol>
      </LessonSection>

      <LessonSection variant="question">
        {useFillBlank ? (
          <FillBlankQuestion {...questionProps} />
        ) : (
          <ShortAnswerQuestion {...questionProps} />
        )}
        {xpEarned !== null && (
          <p className="mt-4 text-sm font-bold text-amber-700">+{xpEarned} XP earned!</p>
        )}
      </LessonSection>

      <PracticeGenerator
        moduleTitle={data.title}
        lessonObjective={data.title}
        questionContext={question?.prompt ?? data.explanation?.[0] ?? data.title}
      />
    </div>
  )
}

export default InteractiveLesson
