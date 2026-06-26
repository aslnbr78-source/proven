import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { exitFullscreen, useProctoring } from '../hooks/useProctoring'
import {
  completeFinalTestSession,
  countStudentFinalTestAttempts,
  createFinalTestSession,
  getEffectiveMaxAttempts,
  getFinalTestContent,
  getFinalTestOptions,
  getStudentFinalTestPermission,
  hasAttemptsRemaining,
  isPasscodeAccessExpired,
  submitFinalTestAnswer,
  updateFinalTestSession,
  verifyFinalTestPasscode,
} from '../services/finalTestService'
import { getModuleAiOptions } from '../services/aiInsightsService'
import { recordWrongAnswer } from '../services/skillTracker'
import AIPersonalizedTutor from './AIPersonalizedTutor'
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

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function FinalTestModule({ data, courseId, moduleId, onComplete }) {
  const { user, profile } = useAuth()
  const { markComplete } = useProgress()

  const [phase, setPhase] = useState('loading')
  const [accessMode, setAccessMode] = useState('either')
  const [passcodeInput, setPasscodeInput] = useState('')
  const [accessError, setAccessError] = useState('')
  const [testContent, setTestContent] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [answered, setAnswered] = useState({})
  const [secondsLeft, setSecondsLeft] = useState(data.timeLimit ?? 0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [finished, setFinished] = useState(false)
  const [violationNotice, setViolationNotice] = useState('')
  const [finalScore, setFinalScore] = useState(null)
  const [allowAiAssistant, setAllowAiAssistant] = useState(false)
  const [tutorOpen, setTutorOpen] = useState(false)
  const [submittingAnswer, setSubmittingAnswer] = useState(false)
  const [maxAttempts, setMaxAttempts] = useState(1)
  const [attemptsUsed, setAttemptsUsed] = useState(0)
  const [showReview, setShowReview] = useState(false)
  const [aiOptions, setAiOptions] = useState({
    finalTestHintOnly: true,
    finalTestAllowFullAnswers: false,
  })
  const finishingRef = useRef(false)
  const answeredRef = useRef({})

  useEffect(() => {
    answeredRef.current = answered
  }, [answered])

  const activeData = testContent ?? data

  const shuffledQuestions = useMemo(
    () =>
      (activeData.questions ?? []).map((question) => ({
        ...question,
        shuffledOptions: shuffleArray(
          question.options.map((label, index) => ({ label, originalIndex: index })),
        ),
      })),
    [activeData.questions],
  )

  const question = shuffledQuestions[currentIndex]
  const total = shuffledQuestions.length
  const proctoringActive = phase === 'active' && !finished

  const persistViolation = async (patch) => {
    if (!sessionId) {
      return
    }
    await updateFinalTestSession(courseId, moduleId, sessionId, patch).catch(() => {})
  }

  const { requestFullscreen, getCounters, resetCounters, isFullscreen } = useProctoring({
    enabled: proctoringActive,
    onFullscreenExit: (count) => {
      persistViolation({ fullscreenExits: count })
    },
    onTabSwitch: (count) => {
      setViolationNotice(`Warning: tab switch detected (${count} time${count === 1 ? '' : 's'}).`)
      persistViolation({ tabSwitches: count })
    },
    onCopyAttempt: (count) => {
      setViolationNotice('Copy, paste, and right-click are disabled during this test.')
      persistViolation({ copyAttempts: count })
    },
  })

  const loadUnlockedContent = useCallback(async (nextPhase = 'ready') => {
    setPhase('loading-content')
    const content = await getFinalTestContent({ courseId, moduleId })
    setTestContent(content)
    setSecondsLeft(content.timeLimit ?? 0)
    setPhase(nextPhase)
    return content
  }, [courseId, moduleId])

  useEffect(() => {
    async function loadAccess() {
      if (!user?.uid) {
        setPhase('sign-in')
        return
      }

      try {
        const [options, permission, attemptCount, moduleAi] = await Promise.all([
          getFinalTestOptions(courseId, moduleId),
          getStudentFinalTestPermission(courseId, moduleId, user.uid),
          countStudentFinalTestAttempts(courseId, moduleId, user.uid),
          getModuleAiOptions(courseId, moduleId),
        ])

        const effectiveMax = getEffectiveMaxAttempts(options, permission)
        setAccessMode(options?.accessMode ?? 'either')
        setAllowAiAssistant(Boolean(options?.allowAiAssistant))
        setMaxAttempts(effectiveMax)
        setAttemptsUsed(attemptCount)
        setAiOptions({
          finalTestHintOnly: moduleAi.finalTestHintOnly,
          finalTestAllowFullAnswers: moduleAi.finalTestAllowFullAnswers,
        })

        if (profile?.role === 'teacher' || profile?.role === 'admin') {
          await loadUnlockedContent('ready')
          return
        }

        if (permission?.allowed && !isPasscodeAccessExpired(permission)) {
          if (!hasAttemptsRemaining(attemptCount, effectiveMax)) {
            setAccessError(
              `You have used all ${effectiveMax} attempt${effectiveMax === 1 ? '' : 's'} for this test. Ask your teacher if you need another.`,
            )
            setPhase('exhausted')
            return
          }
          await loadUnlockedContent('ready')
          return
        }

        if (permission?.allowed && isPasscodeAccessExpired(permission)) {
          setAccessError('Your passcode access has expired. Ask your teacher for a new passcode.')
        }

        setPhase('gate')
      } catch (error) {
        setAccessError(error.message || 'Could not check final test access.')
        setPhase('gate')
      }
    }

    loadAccess()
  }, [courseId, loadUnlockedContent, moduleId, profile?.role, user?.uid])

  useEffect(() => {
    if (phase !== 'active' || finished) {
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
      setElapsedSeconds((value) => value + 1)
    }, 1000)

    return () => window.clearInterval(timer)
  }, [phase, finished])

  useEffect(() => {
    if (phase === 'active' && secondsLeft === 0 && !finished && !finishingRef.current) {
      finishTest(answeredRef.current)
    }
  }, [secondsLeft, phase, finished])

  const finishTest = async (finalAnswered) => {
    if (finished || finishingRef.current) {
      return
    }
    finishingRef.current = true

    setFinished(true)
    exitFullscreen()

    const counters = getCounters()
    const correctCount = Object.values(finalAnswered).filter((item) => item.isCorrect).length

    if (sessionId) {
      try {
        const score = await completeFinalTestSession({
          courseId,
          moduleId,
          sessionId,
          elapsedSeconds,
          scoreCorrect: correctCount,
          scoreTotal: total,
          ...counters,
        })
        setFinalScore(score)
      } catch (error) {
        setFinished(false)
        finishingRef.current = false
        setViolationNotice(error.message || 'Could not submit the final test. Try again.')
        return
      }
    }

    markComplete(courseId, moduleId)
    onComplete?.()
    setAttemptsUsed((count) => count + 1)
    setPhase('finished')
  }

  const resetForRetake = () => {
    finishingRef.current = false
    setFinished(false)
    setSessionId(null)
    setCurrentIndex(0)
    setSelectedIndex(null)
    setAnswered({})
    setSecondsLeft(activeData.timeLimit ?? 0)
    setElapsedSeconds(0)
    setViolationNotice('')
    setFinalScore(null)
    setTutorOpen(false)
    setShowReview(false)
    setPhase('ready')
  }

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
    setSelectedIndex(null)
    setShowReview(false)
  }

  const attemptsRemaining = Math.max(0, maxAttempts - attemptsUsed)
  const tutorQuestionContext = question?.prompt ?? activeData.title

  const handlePasscodeSubmit = async (event) => {
    event.preventDefault()
    setAccessError('')

    try {
      const result = await verifyFinalTestPasscode({
        courseId,
        moduleId,
        passcode: passcodeInput,
      })
      if (result.expired) {
        setAccessError('This passcode has expired. Ask your teacher for a new one.')
        return
      }
      if (!result.ok) {
        setAccessError('Incorrect passcode.')
        return
      }

      const [options, permission, attemptCount] = await Promise.all([
        getFinalTestOptions(courseId, moduleId),
        getStudentFinalTestPermission(courseId, moduleId, user.uid),
        countStudentFinalTestAttempts(courseId, moduleId, user.uid),
      ])
      const effectiveMax = getEffectiveMaxAttempts(options, permission)
      setMaxAttempts(effectiveMax)
      setAttemptsUsed(attemptCount)
      setAllowAiAssistant(Boolean(options?.allowAiAssistant))

      if (!hasAttemptsRemaining(attemptCount, effectiveMax)) {
        setAccessError(
          `You have used all ${effectiveMax} attempt${effectiveMax === 1 ? '' : 's'} for this test.`,
        )
        setPhase('exhausted')
        return
      }
      await loadUnlockedContent('ready')
    } catch (error) {
      setAccessError(error.message || 'Could not verify passcode.')
    }
  }

  const beginTest = async () => {
    setAccessError('')
    resetCounters()

    if (!hasAttemptsRemaining(attemptsUsed, maxAttempts)) {
      setAccessError(`You have used all ${maxAttempts} attempt${maxAttempts === 1 ? '' : 's'} for this test.`)
      setPhase('exhausted')
      return
    }

    try {
      await requestFullscreen()
    } catch {
      setAccessError('Fullscreen is required. Allow fullscreen in your browser and try again.')
      return
    }

    try {
      const content = testContent ?? (await loadUnlockedContent('ready'))
      const id = await createFinalTestSession({
        courseId,
        moduleId,
        moduleTitle: content.title,
        uid: user.uid,
        studentEmail: profile?.email ?? user.email,
        studentName: profile?.displayName ?? '',
        timeLimitSeconds: content.timeLimit,
      })
      setSessionId(id)
      setPhase('active')
      setTutorOpen(false)
      setShowReview(false)
    } catch (error) {
      setAccessError(error.message || 'Could not start session.')
      exitFullscreen()
    }
  }

  const submitAnswer = async () => {
    if (!question || !sessionId || selectedIndex === null || answered[question.id]) {
      return
    }

    const chosen = question.shuffledOptions[selectedIndex]
    setSubmittingAnswer(true)

    try {
      const result = await submitFinalTestAnswer({
        courseId,
        moduleId,
        sessionId,
        questionId: question.id,
        selectedOriginalIndex: chosen.originalIndex,
      })
      const selectedOriginalIndex = Number.isInteger(result.selectedOriginalIndex)
        ? result.selectedOriginalIndex
        : chosen.originalIndex
      const storedSelectedIndex = question.shuffledOptions.findIndex(
        (option) => option.originalIndex === selectedOriginalIndex,
      )
      const isCorrect = Boolean(result.isCorrect)

      if (!isCorrect && user?.uid && courseId && moduleId) {
        const wrongOption = question.shuffledOptions[storedSelectedIndex] ?? chosen
        recordWrongAnswer(user.uid, courseId, moduleId, wrongOption.label).catch(() => {})
      }

      setAnswered((previous) => ({
        ...previous,
        [question.id]: {
          isCorrect,
          selectedIndex: storedSelectedIndex >= 0 ? storedSelectedIndex : selectedIndex,
          selectedOriginalIndex,
        },
      }))
    } catch (error) {
      setViolationNotice(error.message || 'Could not submit this answer. Try again.')
    } finally {
      setSubmittingAnswer(false)
    }
  }

  const goNext = () => {
    if (currentIndex < total - 1) {
      setCurrentIndex((index) => index + 1)
      setSelectedIndex(null)
      return
    }

    setShowReview(true)
  }

  const handleResumeFullscreen = async () => {
    try {
      await requestFullscreen()
      setViolationNotice('')
    } catch {
      setViolationNotice('Could not enter fullscreen. Allow it in your browser settings.')
    }
  }

  const result = question ? answered[question.id] : null
  const correctCount = Object.values(answered).filter((item) => item.isCorrect).length
  const contentLocked = proctoringActive && !isFullscreen

  if (phase === 'loading' || phase === 'loading-content') {
    return <p className="text-slate-600">Checking test access…</p>
  }

  if (phase === 'sign-in') {
    return (
      <LessonSection variant="final-test" title="Sign in required">
        <p className="text-slate-700">You must be signed in to take a final test.</p>
      </LessonSection>
    )
  }

  if (phase === 'exhausted') {
    return (
      <LessonSection variant="final-test" title="No attempts remaining">
        <p className="text-slate-700">
          You have used all {maxAttempts} allowed attempt{maxAttempts === 1 ? '' : 's'} for this
          final test.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Contact your teacher if you need additional attempts.
        </p>
        {accessError && (
          <p className="mt-4 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-800">{accessError}</p>
        )}
      </LessonSection>
    )
  }

  if (phase === 'gate') {
    const needsPasscode = accessMode === 'passcode' || accessMode === 'either'
    const needsTeacher = accessMode === 'teacher' || accessMode === 'either'

    return (
      <LessonSection variant="final-test" title="Final test locked">
        <p className="text-slate-700">
          This proctored final test requires permission before you can begin.
        </p>
        <ul className="mt-3 list-inside list-disc text-sm text-slate-600">
          <li>Fullscreen mode required</li>
          <li>Copy, paste, and right-click disabled</li>
          <li>Tab switches and leaving fullscreen are logged</li>
        </ul>

        {needsPasscode && (
          <form onSubmit={handlePasscodeSubmit} className="mt-6 max-w-sm space-y-3">
            <label htmlFor="test-passcode" className="block text-sm font-semibold text-slate-700">
              Enter passcode from your teacher
            </label>
            <input
              id="test-passcode"
              type="password"
              value={passcodeInput}
              onChange={(e) => setPasscodeInput(e.target.value)}
              className="input-modern w-full"
              autoComplete="off"
            />
            <button type="submit" className="btn-primary">
              Unlock with passcode
            </button>
          </form>
        )}

        {needsTeacher && (
          <p className="mt-4 text-sm text-slate-600">
            Or ask your teacher to grant you access from their course view.
          </p>
        )}

        {accessError && (
          <p className="mt-4 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-800">{accessError}</p>
        )}
      </LessonSection>
    )
  }

  if (phase === 'ready') {
    return (
      <LessonSection variant="final-test" title="Ready to begin">
        <p className="text-slate-700">
          Time limit: <strong>{formatTime(activeData.timeLimit ?? 0)}</strong> · {total} questions
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Attempts remaining: <strong>{attemptsRemaining}</strong> of {maxAttempts}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          The test runs in fullscreen. Stay on this tab until you submit.
          {allowAiAssistant && ' The AI tutor will be available inside the test.'}
        </p>
        {accessError && (
          <p className="mt-4 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-800">{accessError}</p>
        )}
        <button type="button" onClick={beginTest} className="btn-primary mt-6">
          Enter fullscreen & begin
        </button>
      </LessonSection>
    )
  }

  if (phase === 'finished') {
    const displayedScoreCorrect = finalScore?.scoreCorrect ?? correctCount
    const displayedScoreTotal = finalScore?.scoreTotal ?? total

    return (
      <LessonSection variant="final-test" title="Final test submitted">
        <p className="text-lg text-slate-800">
          Score: {displayedScoreCorrect} / {displayedScoreTotal}
        </p>
        <p className="mt-2 text-slate-600">Time used: {formatTime(elapsedSeconds)}</p>
        <p className="mt-2 text-sm text-slate-600">
          Attempts used: {attemptsUsed} of {maxAttempts}
        </p>
        <p className="mt-4 text-sm text-slate-500">
          Your teacher can view fullscreen exits and tab switches in Reports.
        </p>
        {attemptsRemaining > 0 && (
          <button type="button" onClick={resetForRetake} className="btn-primary mt-6">
            Take test again ({attemptsRemaining} attempt{attemptsRemaining === 1 ? '' : 's'} left)
          </button>
        )}
      </LessonSection>
    )
  }

  const overlay = phase === 'active'

  if (!question) {
    return (
      <LessonSection variant="final-test" title="Final test unavailable">
        <p className="text-slate-700">
          This final test does not have any available questions. Ask your teacher to publish the
          test again.
        </p>
      </LessonSection>
    )
  }

  return (
    <div
      className={
        overlay
          ? 'calc-aware-overlay fixed inset-0 z-50 overflow-y-auto bg-slate-900/95 p-4 md:p-8'
          : 'relative'
      }
    >
      <div className={overlay ? 'relative mx-auto max-w-3xl' : ''}>
        <div
          className={`lesson-panel lesson-panel-final-test transition ${
            contentLocked ? 'pointer-events-none select-none blur-md' : ''
          }`}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="section-badge section-badge-final-test">🔒 Final Test</span>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-rose-100 px-3 py-1 text-sm font-bold text-rose-900">
                {formatTime(secondsLeft)} left
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                Q {currentIndex + 1}/{total}
              </span>
            </div>
          </div>

          {violationNotice && !contentLocked && (
            <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950">
              {violationNotice}
            </p>
          )}

          {showReview && !contentLocked ? (
            <QuestionReviewPanel
              questions={shuffledQuestions}
              answered={answered}
              currentIndex={currentIndex}
              onSelectQuestion={navigateToQuestion}
              onClose={() => setShowReview(false)}
              onSubmit={() => finishTest(answeredRef.current)}
              submitLabel="Submit final test"
            />
          ) : (
            !finished && (
              <>
                <div className="quiz-nav">
                  <button
                    type="button"
                    onClick={() => navigateToQuestion(currentIndex - 1)}
                    disabled={currentIndex === 0 || contentLocked}
                    className="btn-secondary !py-1.5 !text-sm disabled:opacity-40"
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReview(true)}
                    disabled={contentLocked}
                    className="btn-secondary !py-1.5 !text-sm"
                  >
                    Review
                  </button>
                </div>

                <MathBlock text={question.prompt} className="mt-4 text-lg text-slate-900" />

              <div className="mt-5 space-y-2">
                {question.shuffledOptions.map((option, index) => {
                  const isSelected = selectedIndex === index
                  const showResult = Boolean(result)

                  let optionClass = 'quiz-option'
                  if (showResult && isSelected && result.isCorrect) {
                    optionClass = 'quiz-option quiz-option-correct'
                  } else if (showResult && isSelected && !result.isCorrect) {
                    optionClass = 'quiz-option quiz-option-wrong'
                  } else if (isSelected) {
                    optionClass = 'quiz-option quiz-option-selected'
                  }

                  return (
                    <button
                      key={option.label}
                      type="button"
                      disabled={Boolean(result) || contentLocked || submittingAnswer}
                      onClick={() => setSelectedIndex(index)}
                      className={optionClass}
                    >
                      <MathBlock text={option.label} />
                    </button>
                  )
                })}
              </div>

              {!result && (
                <button
                  type="button"
                  onClick={submitAnswer}
                  disabled={selectedIndex === null || contentLocked || submittingAnswer || !sessionId}
                  className="btn-primary mt-5"
                >
                  {submittingAnswer ? 'Submitting…' : 'Submit answer'}
                </button>
              )}

              {result && (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={contentLocked}
                  className="btn-primary mt-5"
                >
                  {currentIndex < total - 1 ? 'Next question' : 'Review & submit'}
                </button>
              )}
              </>
            )
          )}
        </div>

        {contentLocked && (
          <button
            type="button"
            onClick={handleResumeFullscreen}
            className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center bg-slate-900/60 p-6 backdrop-blur-sm"
          >
            <div className="card-modern max-w-md text-center shadow-2xl">
              <p className="text-lg font-bold text-slate-900">Test paused — fullscreen required</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                You left full screen mode. The test content is hidden until you return.
              </p>
              <p className="mt-4 text-sm font-semibold text-indigo-700">
                Click here to go back to the test in full screen and continue
              </p>
              <span className="btn-primary mt-5 inline-block">Return to full screen</span>
            </div>
          </button>
        )}

        {allowAiAssistant && !contentLocked && (
          <div className="fixed bottom-4 right-4 z-20 flex flex-col items-end gap-2">
            {tutorOpen ? (
              <div className="flex h-[min(24rem,55vh)] w-[min(24rem,92vw)] flex-col overflow-hidden rounded-xl shadow-2xl">
                <div className="flex items-center justify-between border-b border-violet-500/40 bg-slate-900 px-3 py-2">
                  <span className="text-xs font-semibold text-violet-100">AI Tutor</span>
                  <button
                    type="button"
                    onClick={() => setTutorOpen(false)}
                    className="rounded px-2 py-0.5 text-xs text-violet-200 hover:bg-slate-800"
                  >
                    Close
                  </button>
                </div>
                <div className="min-h-0 flex-1">
                  <AIPersonalizedTutor
                    courseId={courseId}
                    moduleId={moduleId}
                    moduleTitle={activeData.title}
                    questionContext={tutorQuestionContext}
                    overlay
                    tutorMode={aiOptions.finalTestHintOnly ? 'hint-only' : 'standard'}
                    allowFullAnswers={aiOptions.finalTestAllowFullAnswers}
                    contextType="final-test"
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setTutorOpen(true)}
                className="rounded-full bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-violet-500"
              >
                Open AI tutor
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default FinalTestModule
