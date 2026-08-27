import InteractiveLesson from './InteractiveLesson'
import QuizModule from './QuizModule'
import FlashcardModule from './FlashcardModule'
import FinalTestModule from './FinalTestModule'

function ModuleRenderer({ module, courseId, moduleId, onComplete }) {
  switch (module.type) {
    case 'interactive-lesson':
      return (
        <InteractiveLesson
          data={module}
          courseId={courseId}
          moduleId={moduleId}
          onComplete={onComplete}
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
    default:
      return (
        <p className="text-red-600">
          Unknown module type: <code>{module.type}</code>
        </p>
      )
  }
}

export default ModuleRenderer
