import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import AIPersonalizedTutor from '../components/AIPersonalizedTutor'
import DownloadManager from '../components/DownloadManager'
import GamificationBar from '../components/GamificationBar'
import LiveClassControl from '../components/LiveClassControl'
import LiveClassFollower from '../components/LiveClassFollower'
import ModuleRenderer from '../components/ModuleRenderer'
import Sidebar from '../components/Sidebar'
import { useProgress } from '../context/ProgressContext'
import FinalTestControl from '../components/FinalTestControl'
import QuizAiControl from '../components/QuizAiControl'
import { useAuth } from '../context/AuthContext'
import { getModuleAiOptions } from '../services/aiInsightsService'
import {
  fetchCourseOutline,
  fetchModuleContent,
  findModuleInOutline,
  getFirstModule,
} from '../services/contentLoader'
import { ROLES } from '../utils/roles'

function getQuestionContext(module) {
  if (!module) {
    return ''
  }
  if (module.type === 'interactive-lesson' && module.question) {
    const { prompt, type, answers, answer, blanks } = module.question
    const parts = [prompt]
    if (type === 'fill-blank' && blanks?.length) {
      parts.push(`(Fill-in-the-blank with ${blanks.length} blank(s).)`)
    } else if (answers?.length) {
      parts.push(`(Short answer — teacher has ${answers.length} accepted form(s). Do not reveal the answer.)`)
    } else if (answer) {
      parts.push('(Short answer — do not reveal the correct answer.)')
    }
    return parts.join(' ')
  }
  if (module.type === 'quiz' && module.questions?.[0]) {
    return module.questions[0].prompt ?? ''
  }
  if (module.type === 'final-test' && module.questions?.[0]) {
    return module.questions[0].prompt ?? ''
  }
  return module.title ?? ''
}

function CoursePlayer() {
  const { courseId, moduleId } = useParams()
  const { role } = useAuth()
  const { markComplete, isComplete } = useProgress()
  const [courseOutline, setCourseOutline] = useState(null)
  const [moduleContent, setModuleContent] = useState(null)
  const [outlineError, setOutlineError] = useState('')
  const [moduleError, setModuleError] = useState('')
  const [outlineLoading, setOutlineLoading] = useState(true)
  const [moduleLoading, setModuleLoading] = useState(false)
  const [showTutor, setShowTutor] = useState(true)
  const [moduleAiOptions, setModuleAiOptions] = useState({
    quizHintOnly: true,
    quizAllowFullAnswers: false,
  })

  useEffect(() => {
    let cancelled = false

    async function loadOutline() {
      setOutlineLoading(true)
      setOutlineError('')
      try {
        const outline = await fetchCourseOutline(courseId)
        if (!cancelled) {
          setCourseOutline(outline)
        }
      } catch {
        if (!cancelled) {
          setCourseOutline(null)
          setOutlineError('Course not found')
        }
      } finally {
        if (!cancelled) {
          setOutlineLoading(false)
        }
      }
    }

    loadOutline()

    return () => {
      cancelled = true
    }
  }, [courseId])

  useEffect(() => {
    if (!moduleId) {
      setModuleContent(null)
      return undefined
    }

    let cancelled = false

    async function loadModule() {
      setModuleLoading(true)
      setModuleError('')
      try {
        const content = await fetchModuleContent(courseId, moduleId)
        if (!cancelled) {
          setModuleContent(content)
        }
      } catch {
        if (!cancelled) {
          setModuleContent(null)
          setModuleError('Module not found')
        }
      } finally {
        if (!cancelled) {
          setModuleLoading(false)
        }
      }
    }

    loadModule()

    return () => {
      cancelled = true
    }
  }, [courseId, moduleId])

  useEffect(() => {
    if (!courseId || !moduleId) {
      return
    }
    getModuleAiOptions(courseId, moduleId)
      .then(setModuleAiOptions)
      .catch(() =>
        setModuleAiOptions({
          quizHintOnly: true,
          quizAllowFullAnswers: false,
        }),
      )
  }, [courseId, moduleId])

  if (outlineLoading) {
    return (
      <div className="p-8">
        <p className="text-slate-600">Loading course…</p>
      </div>
    )
  }

  if (outlineError || !courseOutline) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold">Course not found</h1>
        <p className="mt-2 text-slate-600">
          <Link to="/hub" className="text-blue-600 hover:underline">
            Back to Hub
          </Link>
        </p>
      </div>
    )
  }

  if (!moduleId) {
    const firstModule = getFirstModule(courseOutline)
    if (firstModule) {
      return (
        <Navigate to={`/courses/${courseId}/modules/${firstModule.id}`} replace />
      )
    }
  }

  const moduleMeta = moduleId ? findModuleInOutline(courseOutline, moduleId) : null

  if (moduleId && !moduleLoading && (moduleError || !moduleMeta)) {
    return (
      <div className="flex min-h-[calc(100vh-65px)]">
        <Sidebar
          courseId={courseId}
          courseOutline={courseOutline}
          activeModuleId={moduleId}
        />
        <div className="flex-1 p-8">
          <h1 className="text-3xl font-bold">Module not found</h1>
          <p className="mt-2 text-slate-600">
            <Link to={`/courses/${courseId}`} className="text-blue-600 hover:underline">
              Back to course
            </Link>
          </p>
        </div>
      </div>
    )
  }

  const handleComplete = () => {
    if (moduleId && !isComplete(courseId, moduleId)) {
      markComplete(courseId, moduleId)
    }
  }

  const isFinalTest = moduleContent?.type === 'final-test'
  const isQuiz = moduleContent?.type === 'quiz'
  const isTeacher = role === ROLES.TEACHER || role === ROLES.ADMIN
  const showTutorPanel = showTutor && moduleContent && !isFinalTest
  const tutorMode = isQuiz && moduleAiOptions.quizHintOnly ? 'hint-only' : 'standard'
  const tutorAllowFullAnswers = isQuiz ? moduleAiOptions.quizAllowFullAnswers : false
  const tutorContextType = isQuiz ? 'quiz' : 'lesson'

  return (
    <div className="flex min-h-[calc(100vh-65px)]">
      <Sidebar
        courseId={courseId}
        courseOutline={courseOutline}
        activeModuleId={moduleId}
      />

      <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
        <article className="min-w-0 flex-1 overflow-y-auto p-6 md:p-8">
          <LiveClassFollower courseId={courseId} moduleId={moduleId} />

          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            {!isFinalTest && <GamificationBar />}
            <div className="flex flex-wrap items-center gap-2">
              {!isFinalTest && (
                <LiveClassControl
                  courseId={courseId}
                  moduleId={moduleId}
                  moduleTitle={moduleMeta?.title ?? moduleContent?.title}
                />
              )}
              {!isFinalTest && (
                <button
                  type="button"
                  onClick={() => setShowTutor((value) => !value)}
                  className="btn-secondary !py-1.5 !text-sm lg:hidden"
                >
                  {showTutor ? 'Hide tutor' : 'Show AI tutor'}
                </button>
              )}
            </div>
          </div>

          {moduleLoading ? (
            <p className="text-slate-600">Loading module…</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <h1 className="page-title !text-2xl md:!text-3xl">
                  {moduleMeta?.title ?? moduleContent?.title}
                </h1>
                {moduleId && isComplete(courseId, moduleId) && (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">
                    Completed
                  </span>
                )}
              </div>

              <div className="mt-8">
                {moduleContent && (
                  <ModuleRenderer
                    key={`${courseId}:${moduleId}`}
                    module={moduleContent}
                    courseId={courseId}
                    moduleId={moduleId}
                    onComplete={handleComplete}
                  />
                )}
              </div>

              <div className="mt-10 lg:hidden">
                <DownloadManager courseId={courseId} courseTitle={courseOutline.title} />
              </div>
            </>
          )}
        </article>

        <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-slate-200/80 bg-white/60 p-4 backdrop-blur-sm lg:w-96 lg:border-t-0 lg:border-l">
          <div className="hidden lg:block">
            <DownloadManager courseId={courseId} courseTitle={courseOutline.title} />
          </div>
          {showTutorPanel && (
            <div className="min-h-64 flex-1">
              <AIPersonalizedTutor
                courseId={courseId}
                moduleId={moduleId}
                moduleTitle={moduleMeta?.title ?? moduleContent.title}
                questionContext={getQuestionContext(moduleContent)}
                tutorMode={tutorMode}
                allowFullAnswers={tutorAllowFullAnswers}
                contextType={tutorContextType}
              />
            </div>
          )}
          {isQuiz && isTeacher && moduleContent && (
            <QuizAiControl
              courseId={courseId}
              moduleId={moduleId}
              moduleTitle={moduleMeta?.title ?? moduleContent.title}
            />
          )}
          {isFinalTest && isTeacher && moduleContent && (
            <FinalTestControl
              courseId={courseId}
              moduleId={moduleId}
              moduleTitle={moduleMeta?.title ?? moduleContent.title}
            />
          )}
        </aside>
      </div>
    </div>
  )
}

export default CoursePlayer
