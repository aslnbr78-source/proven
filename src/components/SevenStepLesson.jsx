import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import LivePracticeReport from './LivePracticeReport'
import PracticeGenerator from './PracticeGenerator'
import LessonBlockNav from './lesson/LessonBlockNav'
import LessonBlockSection from './lesson/LessonBlockSection'
import { useLessonPractice } from '../hooks/useLessonPractice'
import {
  getLessonBlocks,
  isBlockPracticeComplete,
  shouldUseBlockNavigation,
} from '../utils/lessonSchema'
import {
  getModulePracticeQuestions,
  getQuestionsForBlock,
  LIVE_PHASES,
} from '../utils/liveLessonFlow'

function SevenStepLesson({
  data,
  courseId,
  moduleId,
  outline,
  onComplete,
  livePhase = null,
  liveBlockIndex = 0,
  isLiveLessonSync = false,
  isTeacherLiveView = false,
  canSubmitLivePractice = false,
  onAdvanceToNextModule,
  hasNextModule = false,
  nextModuleTitle,
  onBindFinalize = null,
}) {
  const { user } = useAuth()
  const blocks = useMemo(() => getLessonBlocks(data), [data])
  const questions = useMemo(() => getModulePracticeQuestions(data), [data])
  const useBlockNav = shouldUseBlockNavigation(data)

  const [selfStudyBlockIndex, setSelfStudyBlockIndex] = useState(0)

  const activeBlockIndex = isLiveLessonSync
    ? Math.min(liveBlockIndex, Math.max(blocks.length - 1, 0))
    : selfStudyBlockIndex

  useEffect(() => {
    setSelfStudyBlockIndex(0)
  }, [data.id, moduleId])

  useEffect(() => {
    if (!useBlockNav) {
      return
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [activeBlockIndex, useBlockNav, isLiveLessonSync, livePhase])

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

  const showLessonContent = !isLiveLessonSync || livePhase === LIVE_PHASES.CONTENT
  const showBlockSummary = isLiveLessonSync && livePhase === LIVE_PHASES.BLOCK_SUMMARY
  const showModuleSummary = isLiveLessonSync && livePhase === LIVE_PHASES.MODULE_SUMMARY
  const showStep = () => showLessonContent

  const currentBlock = blocks[activeBlockIndex]
  const currentBlockComplete = currentBlock
    ? isBlockPracticeComplete(currentBlock, activeBlockIndex, solvedMap)
    : true
  const isLastBlock = activeBlockIndex >= blocks.length - 1
  const blockNavTitle = currentBlock?.title ?? `Section ${activeBlockIndex + 1}`
  const blockSummaryQuestions = currentBlock
    ? getQuestionsForBlock(currentBlock, activeBlockIndex)
    : []

  // Single-block lessons (or last multi-block section): allow exit to mark complete.
  useEffect(() => {
    if (!onBindFinalize) {
      return undefined
    }
    if (isLiveLessonSync) {
      onBindFinalize(null)
      return () => onBindFinalize(null)
    }
    if (currentBlockComplete && (!useBlockNav || isLastBlock)) {
      onBindFinalize(finalizeLesson)
      return () => onBindFinalize(null)
    }
    onBindFinalize(null)
    return () => onBindFinalize(null)
  }, [
    currentBlockComplete,
    finalizeLesson,
    isLastBlock,
    isLiveLessonSync,
    onBindFinalize,
    useBlockNav,
  ])

  const firstBlock = blocks[0]
  const practiceContext =
    questions[0]?.prompt ??
    firstBlock?.concept?.explanation?.[0] ??
    firstBlock?.discoveryHook?.scenario ??
    data.title

  const goToPreviousBlock = () => {
    setSelfStudyBlockIndex((index) => Math.max(0, index - 1))
  }

  const goToNextBlock = () => {
    setSelfStudyBlockIndex((index) => Math.min(blocks.length - 1, index + 1))
  }

  const canAdvanceFromBlock = !isLastBlock || hasNextModule
  const nextModuleLabel = isLastBlock && hasNextModule ? nextModuleTitle : undefined

  const handleBlockNext = () => {
    if (!isLastBlock) {
      goToNextBlock()
      return
    }
    if (!currentBlockComplete) {
      return
    }
    finalizeLesson()
    onAdvanceToNextModule?.()
  }

  return (
    <div className="space-y-6">
      {useBlockNav && !isLiveLessonSync && (
        <LessonBlockNav
          blockTitle={blockNavTitle}
          blockIndex={activeBlockIndex}
          blockTotal={blocks.length}
          onPrevious={goToPreviousBlock}
          onNext={handleBlockNext}
          hasPrevious={activeBlockIndex > 0}
          hasNext={canAdvanceFromBlock}
          practiceComplete={currentBlockComplete}
          nextTitle={nextModuleLabel}
        />
      )}

      {showLessonContent &&
        (useBlockNav ? (
          <LessonBlockSection
            key={currentBlock?.id ?? `block-${activeBlockIndex + 1}`}
            lessonData={data}
            block={currentBlock}
            blockIndex={activeBlockIndex}
            blockCount={blocks.length}
            showStep={showStep}
            solvedMap={solvedMap}
            recordHint={recordHint}
            handleWrong={handleWrong}
            handleQuestionSolve={handleQuestionSolve}
            handleLiveAttempt={handleLiveAttempt}
            canSubmitLivePractice={canSubmitLivePractice}
            showAskTeacher={!isLiveLessonSync}
            askTeacherBaseProps={askTeacherBaseProps}
            practiceQuestionKey={practiceQuestionKey}
          />
        ) : (
          blocks.map((block, index) => (
            <LessonBlockSection
              key={block.id ?? `block-${index + 1}`}
              lessonData={data}
              block={block}
              blockIndex={index}
              blockCount={blocks.length}
              showStep={showStep}
              solvedMap={solvedMap}
              recordHint={recordHint}
              handleWrong={handleWrong}
              handleQuestionSolve={handleQuestionSolve}
              handleLiveAttempt={handleLiveAttempt}
              canSubmitLivePractice={canSubmitLivePractice}
              showAskTeacher={!isLiveLessonSync}
              askTeacherBaseProps={askTeacherBaseProps}
              practiceQuestionKey={practiceQuestionKey}
            />
          ))
        ))}

      {useBlockNav && !isLiveLessonSync && showLessonContent && (
        <LessonBlockNav
          blockTitle={blockNavTitle}
          blockIndex={activeBlockIndex}
          blockTotal={blocks.length}
          onPrevious={goToPreviousBlock}
          onNext={handleBlockNext}
          hasPrevious={activeBlockIndex > 0}
          hasNext={canAdvanceFromBlock}
          practiceComplete={currentBlockComplete}
          nextTitle={nextModuleLabel}
        />
      )}

      {xpEarned !== null && !isLiveLessonSync && (
        <p className="text-sm font-bold text-amber-700">+{xpEarned} XP earned!</p>
      )}

      {showBlockSummary && (
        <LivePracticeReport
          courseId={courseId}
          moduleId={moduleId}
          questions={blockSummaryQuestions}
          teacherView={isTeacherLiveView}
          studentUid={user?.uid}
          title={
            blocks.length > 1
              ? `${currentBlock?.title ?? `Section ${activeBlockIndex + 1}`} — results`
              : 'Practice results'
          }
          subtitle={
            isTeacherLiveView
              ? 'Live answers for this section. Advance when the class is ready.'
              : 'Summary for this section. The teacher will continue when ready.'
          }
        />
      )}

      {showModuleSummary && (
        <LivePracticeReport
          courseId={courseId}
          moduleId={moduleId}
          questions={questions}
          teacherView={isTeacherLiveView}
          studentUid={user?.uid}
          title="Lesson summary"
          subtitle={
            isTeacherLiveView
              ? 'All live practice answers for this lesson.'
              : 'How the class did on the practice questions.'
          }
        />
      )}

      {!isLiveLessonSync && (!useBlockNav || isLastBlock) && (
        <PracticeGenerator
          moduleTitle={data.title}
          lessonObjective={data.title}
          questionContext={practiceContext}
          courseId={courseId}
          moduleId={moduleId}
          outline={outline}
        />
      )}
    </div>
  )
}

export default SevenStepLesson
