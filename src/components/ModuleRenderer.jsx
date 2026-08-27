import InteractiveLesson from './InteractiveLesson'
import QuizModule from './QuizModule'
import FlashcardModule from './FlashcardModule'
import FinalTestModule from './FinalTestModule'
import AdaptivePracticeModule from './AdaptivePracticeModule'
import AdaptiveMasteryModule from './AdaptiveMasteryModule'
import MathGameModule from './MathGameModule'

function ModuleRenderer({
  module,
  courseId,
  moduleId,
  outline,
  onComplete,
  livePhase,
  liveBlockIndex,
  isLiveLessonSync,
  isTeacherLiveView,
  canSubmitLivePractice = false,
  onAdvanceToNextModule,
  hasNextModule = false,
  nextModuleTitle,
  onBindFinalize = null,
}) {
  switch (module.type) {
    case 'interactive-lesson':
      return (
        <InteractiveLesson
          data={module}
          courseId={courseId}
          moduleId={moduleId}
          outline={outline}
          onComplete={onComplete}
          livePhase={livePhase}
          liveBlockIndex={liveBlockIndex}
          isLiveLessonSync={isLiveLessonSync}
          isTeacherLiveView={isTeacherLiveView}
          canSubmitLivePractice={canSubmitLivePractice}
          onAdvanceToNextModule={onAdvanceToNextModule}
          hasNextModule={hasNextModule}
          nextModuleTitle={nextModuleTitle}
          onBindFinalize={onBindFinalize}
        />
      )
    case 'quiz':
      return (
        <QuizModule
          data={module}
          courseId={courseId}
          moduleId={moduleId}
          onComplete={onComplete}
        />
      )
    case 'flashcard':
      return (
        <FlashcardModule
          data={module}
          courseId={courseId}
          moduleId={moduleId}
          onComplete={onComplete}
        />
      )
    case 'final-test':
      return (
        <FinalTestModule
          data={module}
          courseId={courseId}
          moduleId={moduleId}
          onComplete={onComplete}
        />
      )
    case 'adaptive-practice':
      return (
        <AdaptivePracticeModule
          data={module}
          courseId={courseId}
          moduleId={moduleId}
          onComplete={onComplete}
        />
      )
    case 'adaptive-mastery':
      return (
        <AdaptiveMasteryModule
          data={module}
          courseId={courseId}
          moduleId={moduleId}
          onComplete={onComplete}
        />
      )
    case 'math-game':
      return (
        <MathGameModule
          data={module}
          courseId={courseId}
          moduleId={moduleId}
          onComplete={onComplete}
        />
      )
    default:
      return (
        <p className="text-red-600">
          Unknown module type: <code>{module.type}</code>
        </p>
      )
  }
}

export default ModuleRenderer
