import LivePracticeReport from './LivePracticeReport'
import RevealExample from './RevealExample'
import SevenStepLesson from './SevenStepLesson'
import { useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import LessonSection from './LessonSection'
import MathBlock from './MathBlock'
import PracticeGenerator from './PracticeGenerator'
import { PracticeQuestionItem } from './lesson/LessonPracticeQuestions'
import { useLessonPractice } from '../hooks/useLessonPractice'
import { getLessonExamples, getLessonQuestions, getQuestionId } from '../utils/lessonContent'
import { isSevenStepLesson } from '../utils/lessonSchema'
import { LIVE_PHASES } from '../utils/liveLessonFlow'

function InteractiveLesson(props) {
  if (isSevenStepLesson(props.data)) {
    return <SevenStepLesson {...props} />
  }

  return <ClassicInteractiveLesson {...props} />
}

function ClassicInteractiveLesson({
  data,
  courseId,
  moduleId,
  outline,
  onComplete,
  livePhase = null,
  isLiveLessonSync = false,
  isTeacherLiveView = false,
  canSubmitLivePractice = false,
  onBindFinalize = null,
}) {
  const { user } = useAuth()

  const examples = useMemo(() => getLessonExamples(data), [data])
  const questions = useMemo(() => getLessonQuestions(data), [data])

  const {
    solvedMap,
    xpEarned,
    recordHint,
    handleWrong,
    handleQuestionSolve,
    handleLiveAttempt,
    finalizeLesson,
    askTeacherBaseProps,
    practiceQuestionKey,
  } = useLessonPractice({
    data,
    courseId,
    moduleId,
    questions,
    onComplete,
    livePhase,
    isLiveLessonSync,
    canSubmitLivePractice,
  })

  useEffect(() => {
    if (!onBindFinalize) {
      return undefined
    }
    if (isLiveLessonSync) {
      onBindFinalize(null)
      return () => onBindFinalize(null)
    }
    onBindFinalize(finalizeLesson)
    return () => onBindFinalize(null)
  }, [finalizeLesson, isLiveLessonSync, onBindFinalize])

  const showLessonContent = !isLiveLessonSync || livePhase === LIVE_PHASES.CONTENT
  const showSummary =
    isLiveLessonSync &&
    (livePhase === LIVE_PHASES.BLOCK_SUMMARY || livePhase === LIVE_PHASES.MODULE_SUMMARY)

  return (
    <div className="space-y-6">
      {showLessonContent && (
        <>
          <LessonSection variant="explanation">
            <div className="leading-relaxed text-slate-700">
              <MathBlock text={data.explanation} />
            </div>
          </LessonSection>

          {examples.length > 0 && (
            <LessonSection variant="example" title={examples.length > 1 ? 'Worked examples' : undefined}>
              <div className="space-y-8">
                {examples.map((example, index) => (
                  <RevealExample
                    key={example.title ?? example.prompt ?? index}
                    example={example}
                    index={index}
                    total={examples.length}
                  />
                ))}
              </div>
            </LessonSection>
          )}

          {questions.length > 0 && (
            <LessonSection variant="question" title={questions.length > 1 ? 'Practice questions' : undefined}>
              <div className="space-y-8">
                {questions.map((question, index) => {
                  const questionId = getQuestionId(question, index)
                  const solved = Boolean(solvedMap[questionId])

                  return (
                    <PracticeQuestionItem
                      key={`${practiceQuestionKey}-${questionId}`}
                      question={question}
                      questionId={questionId}
                      index={index}
                      total={questions.length}
                      solved={solved}
                      onSolve={() => handleQuestionSolve(questionId)}
                      onWrong={(attempt) => handleWrong(attempt, questionId)}
                      onHint={recordHint}
                      onLiveAttempt={
                        canSubmitLivePractice
                          ? (attempt, isCorrect) => handleLiveAttempt(questionId, attempt, isCorrect)
                          : undefined
                      }
                      showAskTeacher={!isLiveLessonSync}
                      askTeacherProps={askTeacherBaseProps}
                      practiceKey={`${practiceQuestionKey}-${questionId}`}
                    />
                  )
                })}
              </div>
              {xpEarned !== null && !isLiveLessonSync && (
                <p className="mt-6 text-sm font-bold text-amber-700">+{xpEarned} XP earned!</p>
              )}
            </LessonSection>
          )}
        </>
      )}

      {showSummary && (
        <LivePracticeReport
          courseId={courseId}
          moduleId={moduleId}
          questions={questions}
          teacherView={isTeacherLiveView}
          studentUid={user?.uid}
          title={livePhase === LIVE_PHASES.MODULE_SUMMARY ? 'Lesson summary' : 'Practice results'}
          subtitle="Live answers from this session."
        />
      )}

      {!isLiveLessonSync && (
        <PracticeGenerator
          moduleTitle={data.title}
          lessonObjective={data.title}
          questionContext={questions[0]?.prompt ?? data.explanation?.[0] ?? data.title}
          courseId={courseId}
          moduleId={moduleId}
          outline={outline}
        />
      )}
    </div>
  )
}

export default InteractiveLesson
