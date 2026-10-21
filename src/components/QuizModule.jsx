import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useGamification } from '../context/GamificationContext'
import { recordMasteryGain, recordWrongAnswer } from '../services/skillTracker'
import LessonSection from './LessonSection'
import MathBlock from './MathBlock'
import QuestionReviewPanel from './QuestionReviewPanel'

function shuffleArray(items) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function QuizModule({ data, courseId, moduleId, onComplete }) {
  const { user } = useAuth()
  const uid = user?.uid
  const { canPlay, resetModuleHints, recordHint, recordWrong, awardModuleComplete } = useGamification()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [hintLevel, setHintLevel] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [answered, setAnswered] = useState({})
  const [secondsLeft, setSecondsLeft] = useState(data.timeLimit ?? null)
  const [finished, setFinished] = useState(false)
  const [xpEarned, setXpEarned] = useState(null)
  const [showReview, setShowReview] = useState(false)
  const completionRecordedRef = useRef(false)

  useEffect(() => {
    completionRecordedRef.current = false
    resetModuleHints()
  }, [data.id, moduleId, resetModuleHints])

  const shuffledQuestions = useMemo(
    () =>
      data.questions.map((question) => ({
        ...question,
        shuffledOptions: shuffleArray(
          question.options.map((label, index) => ({ label, originalIndex: index })),
        ),
      })),
    [data.questions],
  )

  const question = shuffledQuestions[currentIndex]
  const total = shuffledQuestions.length

  const finishQuiz = useCallback(() => {
    if (completionRecordedRef.current) {
      return
    }
    completionRecordedRef.current = true
    setShowReview(false)
    setFinished(true)
    const xp = awardModuleComplete('quiz')
    setXpEarned(xp)
    if (uid && courseId && moduleId) {
      recordMasteryGain(uid, courseId, moduleId).catch(() => {})
    }
    onComplete?.()
  }, [awardModuleComplete, courseId, moduleId, onComplete, uid])

  useEffect(() => {
    if (!data.timeLimit || finished) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          window.clearInterval(timer)
          return 0
        }
        return value - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [data.timeLimit, finished])

  useEffect(() => {
    if (data.timeLimit && secondsLeft === 0 && !finished) {
      finishQuiz()
    }
  }, [data.timeLimit, finishQuiz, finished, secondsLeft])

  const navigateToQuestion = (index) => {
    if (index < 0 || index >= total) {
      return
    }

    const targetId = shuffledQuestions[index].id
    setAnswered((previous) => {
      const next = { ...previous }
      delete next[targetId]
      return next
    })
    setCurrentIndex(index)
    setHintLevel(0)
    setSelectedIndex(null)
    setShowReview(false)
  }

  const submitAnswer = () => {
    if (selectedIndex === null || answered[question.id]) {
      return
    }

    const chosen = question.shuffledOptions[selectedIndex]
    const isCorrect = chosen.originalIndex === question.correctIndex

    if (!isCorrect) {
      recordWrong()
      if (uid && courseId && moduleId) {
        recordWrongAnswer(uid, courseId, moduleId, chosen.label).catch(() => {})
      }
    }

    setAnswered((previous) => ({
      ...previous,
      [question.id]: { isCorrect, selectedIndex },
    }))
  }

  const goNext = () => {
    if (currentIndex < total - 1) {
      setCurrentIndex((index) => index + 1)
      setHintLevel(0)
      setSelectedIndex(null)
      return
    }

    setShowReview(true)
  }

  const result = answered[question.id]
  const correctCount = Object.values(answered).filter((item) => item.isCorrect).length

  if (finished) {
    return (
      <LessonSection variant="quiz" title="Quiz complete">
        <p className="text-lg text-slate-700">
          You answered {correctCount} of {total} correctly.
          {data.timeLimit ? ` Time remaining: ${secondsLeft}s.` : ''}
        </p>
        {xpEarned !== null && (
          <p className="mt-3 text-sm font-bold text-amber-700">+{xpEarned} XP earned!</p>
        )}
      </LessonSection>
    )
  }

  if (!canPlay) {
    return (
      <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
        You&apos;re out of hearts for today. Come back tomorrow to continue this quiz.
      </p>
    )
  }

  if (showReview) {
    return (
      <LessonSection variant="quiz" title="Review before submit">
        <QuestionReviewPanel
          questions={shuffledQuestions}
          answered={answered}
          currentIndex={currentIndex}
          onSelectQuestion={navigateToQuestion}
          onClose={() => setShowReview(false)}
          onSubmit={finishQuiz}
          submitLabel="Submit quiz"
        />
      </LessonSection>
    )
  }

  return (
    <LessonSection variant="quiz">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-600">
          Question {currentIndex + 1} of {total}
        </p>
        {data.timeLimit && (
          <p className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">
            {secondsLeft}s left
          </p>
        )}
      </div>

      <div className="quiz-nav">
        <button
          type="button"
          onClick={() => navigateToQuestion(currentIndex - 1)}
          disabled={currentIndex === 0}
          className="btn-secondary !py-1.5 !text-sm disabled:opacity-40"
        >
          ← Previous
        </button>
        <button
          type="button"
          onClick={() => setShowReview(true)}
          className="btn-secondary !py-1.5 !text-sm"
        >
          Review
        </button>
      </div>

      <div className="mt-5">
        <MathBlock text={question.prompt} className="text-lg text-slate-900" />
      </div>

      <div className="mt-5 space-y-2">
        {question.shuffledOptions.map((option, index) => {
          const isSelected = selectedIndex === index
          const showResult = Boolean(result)
          const isCorrectOption = option.originalIndex === question.correctIndex

          let optionClass = 'quiz-option'
          if (showResult && isSelected && result.isCorrect) {
            optionClass = 'quiz-option quiz-option-correct'
          } else if (showResult && isSelected && !result.isCorrect) {
            optionClass = 'quiz-option quiz-option-wrong'
          } else if (showResult && isCorrectOption) {
            optionClass = 'quiz-option quiz-option-reveal'
          } else if (isSelected) {
            optionClass = 'quiz-option quiz-option-selected'
          }

          return (
            <button
              key={option.label}
              type="button"
              disabled={Boolean(result)}
              onClick={() => setSelectedIndex(index)}
              className={optionClass}
            >
              <MathBlock text={option.label} />
            </button>
          )
        })}
      </div>

      {!result && (
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={submitAnswer}
            disabled={selectedIndex === null}
            className="btn-primary"
          >
            Submit
          </button>
          {hintLevel < question.hints.length && (
            <button
              type="button"
              onClick={() => {
                recordHint()
                setHintLevel((level) => level + 1)
              }}
              className="btn-secondary"
            >
              Hint {hintLevel + 1}
            </button>
          )}
        </div>
      )}

      {hintLevel > 0 && !result && (
        <div className="mt-4 space-y-2">
          {question.hints.slice(0, hintLevel).map((hint, index) => (
            <p key={hint} className="hint-bubble">
              <span className="font-semibold">Hint {index + 1}: </span>
              <MathBlock text={hint} className="inline" />
            </p>
          ))}
        </div>
      )}

      {result && !result.isCorrect && (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <MathBlock text={question.feedbackIfWrong} />
        </p>
      )}

      {result && (
        <button type="button" onClick={goNext} className="btn-primary mt-5">
          {currentIndex < total - 1 ? 'Next question' : 'Review & submit'}
        </button>
      )}
    </LessonSection>
  )
}

export default QuizModule
