import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import AppNavLink from '../components/layout/AppNavLink'
import CourseModuleNav from '../components/CourseModuleNav'
import CourseRightPanel from '../components/CourseRightPanel'
import DownloadManager from '../components/DownloadManager'
import LiveClassControl from '../components/LiveClassControl'
import LessonModuleHeader from '../components/lesson/LessonModuleHeader'
import LiveClassFollower from '../components/LiveClassFollower'
import LivePresenterBar from '../components/LivePresenterBar'
import LivePresenterTopNav from '../components/LivePresenterTopNav'
import LiveSessionMaterials from '../components/LiveSessionMaterials'
import ModuleRenderer from '../components/ModuleRenderer'
import Sidebar from '../components/Sidebar'
import {
  courseModulePreviewPath,
  isEditorPreviewSearch,
  withEditorPreviewQuery,
} from '../utils/courseEditor'
import { useProgress } from '../context/ProgressContext'
import { useAuth } from '../context/AuthContext'
import { getModuleAiOptions } from '../services/aiInsightsService'
import {
  fetchModuleContent,
  findModuleInOutline,
  getFirstModule,
} from '../services/contentLoader'
import {
  loadChapterUnlockMapsForStudent,
  moduleBypassesChapterLock,
  resolveChapterAccess,
} from '../services/chapterUnlockService'
import ExitTicketPlayer from '../components/exitTicket/ExitTicketPlayer'
import ExitTicketTeacherBoard from '../components/exitTicket/ExitTicketTeacherBoard'
import {
  endLiveSession,
  startLiveExitTicket,
  submitLiveExitTicketResponse,
  updateLiveSessionView,
} from '../services/liveClassService'
import { getAdjacentModules, findModuleLocation } from '../utils/courseOutline'
import {
  blockHasPracticeQuestions,
  getLiveBlockCount,
  getLivePhaseLabel,
  LIVE_PHASES,
} from '../utils/liveLessonFlow'
import {
  EXIT_TICKET_SECONDS,
  hasSeenExitTicket,
  markExitTicketSeen,
  moduleSupportsExitTicket,
  pickExitTicketItems,
  serializeExitTicketItems,
} from '../utils/exitTicket'
import { getLessonQuestions } from '../utils/lessonContent'
import { getLessonBlocks } from '../utils/lessonSchema'
import { buildLinkedGameAiContext } from '../utils/gameQuestionSource'
import { recordModuleAccess } from '../services/navigationState'
import {
  exitFullscreen,
  isFullscreenActive,
  requestFullscreenElement,
} from '../utils/fullscreen'
import { ROLES } from '../utils/roles'
import { buildLiveReportPath } from '../utils/livePracticeArchive'
import { ensureKatexStyles } from '../utils/katexStyles'
import { useSubchapterMaterials } from '../hooks/useSubchapterMaterials'
import { useCourseOutlineLoad } from '../hooks/useCourseOutlineLoad'
import { useContentCopyGuard } from '../hooks/useContentCopyGuard'
import { useLiveSessionSubscription } from '../hooks/useLiveSessionSubscription'
import { useLiveLessonKeyboardNav } from '../hooks/useLiveLessonKeyboardNav'
import {
  SAMPLE_COURSE_ID,
  SAMPLE_ROUTE,
  SAMPLE_TITLE,
  isSamplePath,
  sampleModulePath,
} from '../config/sampleModule'

function getQuestionContext(module) {
  if (!module) {
    return ''
  }
  if (module.type === 'interactive-lesson') {
    const first = module.questions?.[0] ?? module.question
    const promptText = module.questions?.length
      ? module.questions.map((q) => q.prompt).join(' | ')
      : module.question?.prompt
    if (!promptText) {
      return module.title ?? ''
    }
    const { type, answers, answer, blanks } = first ?? {}
    const parts = [promptText]
    if (type === 'fill-blank' && blanks?.length) {
      parts.push(`(Fill-in-the-blank with ${blanks.length} blank(s).)`)
    } else if (answers?.length) {
      parts.push(`(Short answer — teacher has ${answers.length} accepted form(s). Do not reveal the answer.)`)
    } else if (answer) {
      parts.push('(Short answer — do not reveal the correct answer.)')
    }
    if (module.questions?.length > 1) {
      parts.push(`(${module.questions.length} practice questions on this lesson.)`)
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
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isSample = isSamplePath(location.pathname)
  const courseId = isSample ? SAMPLE_COURSE_ID : params.courseId
  const moduleId = params.moduleId
  const editorPreview = !isSample && isEditorPreviewSearch(searchParams.toString())
  const { user, profile, role } = useAuth()
  const { markComplete, saveExitTicket, isComplete } = useProgress()
  const buildModulePath = (id) =>
    isSample ? sampleModulePath(id) : `/courses/${courseId}/modules/${id}`

  useEffect(() => {
    ensureKatexStyles()
  }, [])

  const [moduleContent, setModuleContent] = useState(null)
  const [moduleError, setModuleError] = useState('')
  const [moduleLoading, setModuleLoading] = useState(false)
  const { courseOutline, outlineError, outlineLoading } = useCourseOutlineLoad({
    courseId,
    isSample,
  })
  const [showTutor] = useState(true)
  const [tutorPanelOpen, setTutorPanelOpen] = useState(false)
  const [presenterMode, setPresenterMode] = useState(false)
  const [liveBusy, setLiveBusy] = useState(false)
  const [liveSaveMessage, setLiveSaveMessage] = useState('')
  const [liveSavedReportLink, setLiveSavedReportLink] = useState('')
  const [selfExitTicket, setSelfExitTicket] = useState(null)
  const presentationRef = useRef(null)
  const finalizeLessonRef = useRef(null)
  const pendingAfterExitRef = useRef(null)
  const [moduleAiOptions, setModuleAiOptions] = useState({
    quizHintOnly: true,
    quizAllowFullAnswers: false,
  })
  const [chapterUnlockMaps, setChapterUnlockMaps] = useState([])
  const [linkedGameTutorContext, setLinkedGameTutorContext] = useState('')

  useEffect(() => {
    setTutorPanelOpen(false)
  }, [moduleId])

  useEffect(() => {
    let cancelled = false
    setLinkedGameTutorContext('')

    if (!courseId || !moduleId || !courseOutline) {
      return undefined
    }

    buildLinkedGameAiContext({
      courseId,
      outline: courseOutline,
      moduleId,
      maxSamples: 8,
      includeAnswers: false,
    })
      .then((text) => {
        if (!cancelled) {
          setLinkedGameTutorContext(text)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLinkedGameTutorContext('')
        }
      })

    return () => {
      cancelled = true
    }
  }, [courseId, moduleId, courseOutline])

  useEffect(() => {
    let cancelled = false
    const staff = role === ROLES.TEACHER || role === ROLES.ADMIN || editorPreview
    if (staff || !user?.uid || !courseId) {
      setChapterUnlockMaps([])
      return undefined
    }

    loadChapterUnlockMapsForStudent(user.uid, courseId)
      .then((maps) => {
        if (!cancelled) setChapterUnlockMaps(maps)
      })
      .catch(() => {
        if (!cancelled) setChapterUnlockMaps([])
      })

    return () => {
      cancelled = true
    }
  }, [user?.uid, courseId, role, editorPreview])

  useEffect(() => {
    if (!courseOutline || !moduleId || !courseId) {
      return
    }

    const location = findModuleLocation(courseOutline, moduleId)
    if (!location) {
      return
    }

    recordModuleAccess(user?.uid ?? 'guest', courseId, {
      chapterId: location.chapter.id,
      subchapterId: location.subchapter.id,
      moduleId,
    })
  }, [courseId, courseOutline, moduleId, user?.uid])

  useEffect(() => {
    if (!moduleId) {
      setModuleContent(null)
      return undefined
    }

    // Wait for outline so linked Games catalog modules resolve correctly.
    if (outlineLoading) {
      return undefined
    }

    let cancelled = false

    async function loadModule() {
      setModuleLoading(true)
      setModuleError('')
      const meta = courseOutline ? findModuleInOutline(courseOutline, moduleId) : null
      try {
        const content = await fetchModuleContent(courseId, moduleId, {
          isSample,
          contentSource: meta?.contentSource,
          moduleType: meta?.type,
          includeDraft: role === ROLES.ADMIN || role === ROLES.TEACHER,
        })
        if (!cancelled) {
          setModuleContent(content)
        }
      } catch (err) {
        if (!cancelled) {
          setModuleContent(null)
          const isGame =
            meta?.contentSource === 'game-catalog' || meta?.type === 'math-game'
          setModuleError(
            isGame
              ? 'This game is no longer available in the Games catalog. It may have been deleted or is still an unpublished draft.'
              : String(err?.message ?? `Module not found: ${courseId}/${moduleId}`),
          )
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
  }, [courseId, moduleId, courseOutline, outlineLoading, role, isSample])

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

  const isTeacher = role === ROLES.TEACHER || role === ROLES.ADMIN
  const isStudent = role === ROLES.STUDENT || !role
  // Soft DRM: students + sample/anonymous; staff keep copy for notes/keys/editing
  useContentCopyGuard({
    enabled: Boolean(isSample || (isStudent && !isTeacher && !editorPreview)),
  })
  const {
    liveSession,
    liveStudentCount,
    livePresenceRows,
    liveExitResponses,
    liveExitSecondsLeft,
    isTeacherLive,
    isLiveOnThisModule,
    livePhase,
  } = useLiveSessionSubscription({
    courseId,
    isSample,
    isTeacher,
    teacherUid: user?.uid,
    presenterMode,
    moduleId,
  })
  const isChapterAccessible = useMemo(() => {
    if (isSample || isTeacher || editorPreview) {
      return () => true
    }
    return (chapterId) =>
      resolveChapterAccess({
        isStaff: false,
        classUnlockMaps: chapterUnlockMaps,
        chapterId,
      })
  }, [isSample, isTeacher, editorPreview, chapterUnlockMaps])
  const isFollowingLive = liveSession?.active && isStudent
  const isInteractiveLesson = moduleContent?.type === 'interactive-lesson'
  const useBlockLessonNav = Boolean(
    isInteractiveLesson &&
      Array.isArray(moduleContent?.blocks) &&
      moduleContent.blocks.length > 1,
  )
  const liveBlockIndex = liveSession?.blockIndex ?? 0
  const liveBlockCount = moduleContent ? getLiveBlockCount(moduleContent) : 0
  const liveLessonBlocks = useMemo(
    () => (moduleContent?.type === 'interactive-lesson' ? getLessonBlocks(moduleContent) : []),
    [moduleContent],
  )

  const currentLiveBlockHasPractice = useMemo(() => {
    if (!moduleContent || moduleContent.type !== 'interactive-lesson') {
      return false
    }
    const currentBlock = liveLessonBlocks[liveBlockIndex] ?? liveLessonBlocks[0]
    if (currentBlock) {
      return blockHasPracticeQuestions(currentBlock, liveBlockIndex)
    }
    return getLessonQuestions(moduleContent).length > 0
  }, [moduleContent, liveLessonBlocks, liveBlockIndex])
  const isLiveLessonSync = Boolean(
    isInteractiveLesson && isLiveOnThisModule && (isTeacherLive || isFollowingLive),
  )
  const isTeacherLiveView = Boolean(isTeacherLive && presenterMode && isInteractiveLesson)
  const canSubmitLivePractice = Boolean(isFollowingLive && isLiveOnThisModule && isInteractiveLesson)

  useEffect(() => {
    setSelfExitTicket(null)
    pendingAfterExitRef.current = null
  }, [courseId, moduleId])

  useEffect(() => {
    if (isTeacherLive && !presenterMode) {
      setPresenterMode(true)
      document.documentElement.classList.add('live-presenting')
    }
    if (!liveSession?.active && presenterMode) {
      setPresenterMode(false)
      document.documentElement.classList.remove('live-presenting')
      exitFullscreen()
    }
  }, [isTeacherLive, liveSession?.active, presenterMode])

  useEffect(
    () => () => {
      document.documentElement.classList.remove('live-presenting')
      exitFullscreen()
    },
    [],
  )

  const slideNav = courseOutline && moduleId ? getAdjacentModules(courseOutline, moduleId) : null

  const moduleLocationForMaterials =
    courseOutline && moduleId ? findModuleLocation(courseOutline, moduleId) : null
  const subchapterMaterials = useSubchapterMaterials(
    courseId,
    moduleLocationForMaterials?.subchapter?.id,
    moduleLocationForMaterials?.subchapter?.materials ?? [],
    courseOutline,
  )
  const showLiveSessionMaterials =
    subchapterMaterials.length > 0 &&
    (presenterMode || (isFollowingLive && isLiveOnThisModule))

  const goToModule = (targetModule) => {
    if (!targetModule) {
      return
    }
    const path = buildModulePath(targetModule.id)
    navigate(editorPreview ? withEditorPreviewQuery(path) : path)
  }

  const launchLiveExitTicket = async () => {
    if (!courseId || !moduleContent || !moduleSupportsExitTicket(moduleContent)) {
      return false
    }
    const items = serializeExitTicketItems(pickExitTicketItems(moduleContent))
    if (items.length === 0) {
      return false
    }
    await startLiveExitTicket(courseId, { items, durationSec: EXIT_TICKET_SECONDS })
    return true
  }

  const gateWithSelfExitTicket = (afterFn) => {
    if (typeof afterFn !== 'function') {
      return
    }
    if (
      isLiveLessonSync ||
      editorPreview ||
      !moduleContent ||
      !moduleSupportsExitTicket(moduleContent) ||
      hasSeenExitTicket(user?.uid, courseId, moduleId)
    ) {
      afterFn()
      return
    }
    const items = pickExitTicketItems(moduleContent)
    if (items.length === 0) {
      afterFn()
      return
    }
    pendingAfterExitRef.current = afterFn
    setSelfExitTicket({ items, required: false })
  }

  const handleSelfExitSubmit = (result) => {
    markExitTicketSeen(user?.uid, courseId, moduleId)
    if (result) {
      saveExitTicket(courseId, moduleId, result)
    }
  }

  const handleSelfExitContinue = () => {
    markExitTicketSeen(user?.uid, courseId, moduleId)
    setSelfExitTicket(null)
    const pending = pendingAfterExitRef.current
    pendingAfterExitRef.current = null
    pending?.()
  }

  const handleLiveExitSubmit = (result) => {
    if (!user?.uid || !courseId || !moduleId) {
      return
    }
    submitLiveExitTicketResponse({
      courseId,
      moduleId,
      studentUid: user.uid,
      studentName: profile?.displayName ?? user.displayName ?? '',
      studentEmail: profile?.email ?? user.email ?? '',
      result,
    }).catch((error) => {
      console.warn('Live exit ticket submit failed', error)
    })
  }

  const handleLiveSessionAdvance = async () => {
    if (!courseId || !isInteractiveLesson || !isLiveOnThisModule || !livePhase) {
      return false
    }

    const blockCount = Math.max(liveBlockCount, 1)
    const hasPractice = currentLiveBlockHasPractice

    if (livePhase === LIVE_PHASES.EXIT_TICKET) {
      return false
    }

    if (livePhase === LIVE_PHASES.CONTENT) {
      if (hasPractice) {
        await updateLiveSessionView(courseId, { livePhase: LIVE_PHASES.BLOCK_SUMMARY })
        return true
      }
      if (liveBlockIndex < blockCount - 1) {
        await updateLiveSessionView(courseId, {
          blockIndex: liveBlockIndex + 1,
          livePhase: LIVE_PHASES.CONTENT,
        })
        return true
      }
      if (blockCount > 1 || hasPractice) {
        await updateLiveSessionView(courseId, { livePhase: LIVE_PHASES.MODULE_SUMMARY })
        return true
      }
      if (moduleSupportsExitTicket(moduleContent)) {
        await launchLiveExitTicket()
        return true
      }
      return false
    }

    if (livePhase === LIVE_PHASES.BLOCK_SUMMARY) {
      if (liveBlockIndex < blockCount - 1) {
        await updateLiveSessionView(courseId, {
          blockIndex: liveBlockIndex + 1,
          livePhase: LIVE_PHASES.CONTENT,
        })
        return true
      }
      await updateLiveSessionView(courseId, { livePhase: LIVE_PHASES.MODULE_SUMMARY })
      return true
    }

    if (livePhase === LIVE_PHASES.MODULE_SUMMARY) {
      if (moduleSupportsExitTicket(moduleContent)) {
        await launchLiveExitTicket()
        return true
      }
      return false
    }

    return false
  }

  const handleLiveSessionRetreat = async () => {
    if (!courseId || !isInteractiveLesson || !isLiveOnThisModule || !livePhase) {
      return false
    }

    const hasPractice = currentLiveBlockHasPractice

    if (livePhase === LIVE_PHASES.EXIT_TICKET) {
      await updateLiveSessionView(courseId, {
        livePhase:
          liveBlockCount > 1 || hasPractice ? LIVE_PHASES.MODULE_SUMMARY : LIVE_PHASES.CONTENT,
        clearExitTicket: true,
      })
      return true
    }

    if (livePhase === LIVE_PHASES.MODULE_SUMMARY) {
      if (hasPractice || liveBlockIndex > 0) {
        await updateLiveSessionView(courseId, { livePhase: LIVE_PHASES.BLOCK_SUMMARY })
        return true
      }
      await updateLiveSessionView(courseId, { livePhase: LIVE_PHASES.CONTENT })
      return true
    }

    if (livePhase === LIVE_PHASES.BLOCK_SUMMARY) {
      await updateLiveSessionView(courseId, { livePhase: LIVE_PHASES.CONTENT })
      return true
    }

    if (livePhase === LIVE_PHASES.CONTENT && liveBlockIndex > 0) {
      const previousIndex = liveBlockIndex - 1
      const previousBlock = liveLessonBlocks[previousIndex]
      const previousHasPractice = previousBlock
        ? blockHasPracticeQuestions(previousBlock, previousIndex)
        : false
      await updateLiveSessionView(courseId, {
        blockIndex: previousIndex,
        livePhase: previousHasPractice ? LIVE_PHASES.BLOCK_SUMMARY : LIVE_PHASES.CONTENT,
      })
      return true
    }

    return false
  }

  const liveRetreatTarget = (() => {
    if (!isTeacherLive || !presenterMode) {
      return null
    }

    if (isInteractiveLesson && isLiveOnThisModule && livePhase) {
      if (livePhase === LIVE_PHASES.EXIT_TICKET) {
        return {
          label: 'Back to summary',
          run: async () => {
            setLiveBusy(true)
            try {
              await handleLiveSessionRetreat()
            } finally {
              setLiveBusy(false)
            }
          },
        }
      }
      if (livePhase !== LIVE_PHASES.CONTENT || liveBlockIndex > 0) {
        return {
          label: 'Previous section',
          run: async () => {
            setLiveBusy(true)
            try {
              const handled = await handleLiveSessionRetreat()
              if (!handled && slideNav?.prev) {
                goToModule(slideNav.prev)
              }
            } finally {
              setLiveBusy(false)
            }
          },
        }
      }
    }

    if (slideNav?.prev) {
      return {
        label: slideNav.prev.title,
        run: () => goToModule(slideNav.prev),
      }
    }

    return null
  })()

  const liveAdvanceTarget = (() => {
    if (!isTeacherLive || !presenterMode) {
      return null
    }

    if (isInteractiveLesson && isLiveOnThisModule && livePhase) {
      const blockCount = Math.max(liveBlockCount, 1)
      const hasPractice = currentLiveBlockHasPractice
      const canExitTicket = moduleSupportsExitTicket(moduleContent)

      if (livePhase === LIVE_PHASES.EXIT_TICKET) {
        if (slideNav?.next) {
          return {
            label: `Next lesson: ${slideNav.next.title}`,
            run: () => goToModule(slideNav.next),
          }
        }
        return null
      }

      if (livePhase === LIVE_PHASES.CONTENT) {
        if (hasPractice) {
          return {
            label: 'Next: Summary',
            run: async () => {
              setLiveBusy(true)
              try {
                await handleLiveSessionAdvance()
              } finally {
                setLiveBusy(false)
              }
            },
          }
        }
        if (liveBlockIndex < blockCount - 1) {
          const nextBlock = liveLessonBlocks[liveBlockIndex + 1]
          return {
            label: nextBlock?.title ? `Next: ${nextBlock.title}` : 'Next section',
            run: async () => {
              setLiveBusy(true)
              try {
                await handleLiveSessionAdvance()
              } finally {
                setLiveBusy(false)
              }
            },
          }
        }
        if (blockCount > 1 || hasPractice) {
          return {
            label: 'Next: Lesson summary',
            run: async () => {
              setLiveBusy(true)
              try {
                await handleLiveSessionAdvance()
              } finally {
                setLiveBusy(false)
              }
            },
          }
        }
        if (canExitTicket) {
          return {
            label: 'Exit ticket (60s)',
            run: async () => {
              setLiveBusy(true)
              try {
                await handleLiveSessionAdvance()
              } finally {
                setLiveBusy(false)
              }
            },
          }
        }
      }

      if (livePhase === LIVE_PHASES.BLOCK_SUMMARY) {
        if (liveBlockIndex < blockCount - 1) {
          const nextBlock = liveLessonBlocks[liveBlockIndex + 1]
          return {
            label: nextBlock?.title ? `Next: ${nextBlock.title}` : 'Next section',
            run: async () => {
              setLiveBusy(true)
              try {
                await handleLiveSessionAdvance()
              } finally {
                setLiveBusy(false)
              }
            },
          }
        }
        return {
          label: 'Next: Lesson summary',
          run: async () => {
            setLiveBusy(true)
            try {
              await handleLiveSessionAdvance()
            } finally {
              setLiveBusy(false)
            }
          },
        }
      }

      if (livePhase === LIVE_PHASES.MODULE_SUMMARY) {
        if (canExitTicket) {
          return {
            label: 'Exit ticket (60s)',
            run: async () => {
              setLiveBusy(true)
              try {
                await handleLiveSessionAdvance()
              } finally {
                setLiveBusy(false)
              }
            },
          }
        }
      }
    }

    if (slideNav?.next) {
      return {
        label: `Next lesson: ${slideNav.next.title}`,
        run: () => goToModule(slideNav.next),
      }
    }

    return null
  })()

  const leaveToModule = (targetModule) => {
    gateWithSelfExitTicket(() => {
      finalizeLessonRef.current?.()
      finalizeLessonRef.current = null
      goToModule(targetModule)
    })
  }

  const advanceAfterExitTicket = () => {
    gateWithSelfExitTicket(() => {
      finalizeLessonRef.current?.()
      if (slideNav?.next) {
        goToModule(slideNav.next)
      }
    })
  }

  const handleLiveRetreat = () => {
    liveRetreatTarget?.run?.()
  }

  const handleLiveAdvance = () => {
    liveAdvanceTarget?.run?.()
  }

  const enterPresenterMode = async () => {
    setPresenterMode(true)
    document.documentElement.classList.add('live-presenting')
    try {
      await requestFullscreenElement(presentationRef.current)
    } catch {
      /* fullscreen optional */
    }
  }

  const leavePresenterMode = async () => {
    setPresenterMode(false)
    document.documentElement.classList.remove('live-presenting')
    exitFullscreen()
  }

  const handleGoLive = async () => {
    await enterPresenterMode()
  }

  const handleEndLive = async () => {
    await leavePresenterMode()
  }

  const handlePresenterEndLive = async () => {
    setLiveBusy(true)
    try {
      const archived = await endLiveSession(courseId)
      if (archived?.id) {
        handleLiveReportSaved(archived)
      }
      await leavePresenterMode()
    } finally {
      setLiveBusy(false)
    }
  }

  const handleLiveReportSaved = (archived) => {
    if (!archived?.id) {
      return
    }
    setLiveSavedReportLink(
      buildLiveReportPath({
        ...archived,
        id: archived.id,
        reportId: archived.id,
        adminView: role === ROLES.ADMIN,
      }),
    )
    setLiveSaveMessage('Live report saved with all submissions.')
  }

  const handleToggleFullscreen = async () => {
    if (isFullscreenActive()) {
      exitFullscreen()
    } else {
      try {
        await requestFullscreenElement(presentationRef.current)
      } catch {
        /* ignore */
      }
    }
  }

  useLiveLessonKeyboardNav({
    presenterMode,
    slideNav,
    liveAdvanceTarget,
    liveRetreatTarget,
    goToModule,
    handleLiveAdvance,
    handleLiveRetreat,
    handleToggleFullscreen,
  })

  // When leaving a self-study lesson (sidebar, module nav, route change), mark done if
  // the student reached the last section (or classic single-section lesson).
  useEffect(() => {
    return () => {
      finalizeLessonRef.current?.()
      finalizeLessonRef.current = null
    }
  }, [courseId, moduleId])

  // Must stay above conditional returns — calling useMemo after early returns causes React #310.
  const tutorQuestionContext = useMemo(() => {
    const base = getQuestionContext(moduleContent)
    if (!linkedGameTutorContext) {
      return base
    }
    return [base, linkedGameTutorContext].filter(Boolean).join('\n\n')
  }, [moduleContent, linkedGameTutorContext])

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
        <h1 className="text-3xl font-bold">
          {outlineError === 'You do not have access to this course yet.'
            ? 'Access needed'
            : 'Course not found'}
        </h1>
        <p className="mt-2 text-slate-600">
          {outlineError === 'You do not have access to this course yet.'
            ? 'Ask an administrator to approve access for this course.'
            : 'This course could not be loaded. Try again or open another course.'}
        </p>
        <p className="mt-4 text-slate-600">
          <AppNavLink to="/courses" className="inline-nav-link text-blue-600 hover:underline">
            Back to Courses
          </AppNavLink>
        </p>
      </div>
    )
  }

  if (!moduleId) {
    const firstModule = getFirstModule(courseOutline)
    if (firstModule) {
      return (
        <Navigate
          to={
            editorPreview
              ? courseModulePreviewPath(courseId, firstModule.id)
              : buildModulePath(firstModule.id)
          }
          replace
        />
      )
    }
  }

  const moduleMeta = moduleId ? findModuleInOutline(courseOutline, moduleId) : null
  const activeModuleLocation =
    courseOutline && moduleId ? findModuleLocation(courseOutline, moduleId) : null
  const chapterLockedForModule = Boolean(
    activeModuleLocation &&
      moduleMeta &&
      !moduleBypassesChapterLock(moduleMeta.type) &&
      !isChapterAccessible(activeModuleLocation.chapter.id) &&
      // Live class: students can open the teacher's current module even if the chapter is locked.
      !(liveSession?.active && liveSession?.moduleId === moduleId && isStudent),
  )

  if (moduleId && !moduleLoading && (moduleError || !moduleMeta)) {
    return (
      <div className="flex min-h-[100dvh]">
        <Sidebar
          courseId={courseId}
          courseOutline={courseOutline}
          activeModuleId={moduleId}
          isChapterAccessible={isChapterAccessible}
          modulePathFor={buildModulePath}
          isSample={isSample}
        />
        <div className="flex-1 p-8">
          <h1 className="text-3xl font-bold">Module not found</h1>
          {moduleError ? (
            <p className="mt-2 text-slate-600">{moduleError}</p>
          ) : !moduleMeta ? (
            <p className="mt-2 text-slate-600">
              <code className="text-sm">{moduleId}</code> is not listed in the{' '}
              <code className="text-sm">{courseId}</code> course outline.
            </p>
          ) : null}
          <p className="mt-2 text-slate-600">
            <AppNavLink
              to={isSample ? SAMPLE_ROUTE : `/courses/${courseId}`}
              className="inline-nav-link text-blue-600 hover:underline"
            >
              {isSample ? 'Back to sample' : 'Back to course'}
            </AppNavLink>
          </p>
        </div>
      </div>
    )
  }

  const handleComplete = (meta) => {
    if (!moduleId) {
      return
    }
    // Always persist — scored retries and completion-only retries must reach Firestore.
    markComplete(courseId, moduleId, { ...(meta ?? {}), localOnly: Boolean(isSample) })
  }

  const bindLessonFinalize = (fn) => {
    // Keep the last successful bind for this module visit (e.g. student reached final
    // section, then went back). Cleared only when leaving the module.
    if (typeof fn === 'function') {
      finalizeLessonRef.current = fn
    }
  }

  const isFinalTest = moduleContent?.type === 'final-test'
  const isQuiz = moduleContent?.type === 'quiz'
  const showTutorOption = showTutor && moduleContent && !isFinalTest
  const tutorMode = isQuiz && moduleAiOptions.quizHintOnly ? 'hint-only' : 'standard'
  const tutorAllowFullAnswers = isQuiz ? moduleAiOptions.quizAllowFullAnswers : false
  const tutorContextType = isQuiz ? 'quiz' : 'lesson'
  const moduleTitle = moduleMeta?.title ?? moduleContent?.title ?? 'Lesson'
  const moduleLocation = moduleLocationForMaterials
  const chapterTitle = moduleLocation?.chapter?.title ?? ''
  const subchapterId = moduleLocation?.subchapter?.id ?? ''
  const subchapterTitle = moduleLocation?.subchapter?.title ?? ''
  const navStatusLabel =
    isFollowingLive && isLiveOnThisModule && livePhase
      ? getLivePhaseLabel({
          livePhase,
          blockIndex: liveBlockIndex,
          blockCount: liveBlockCount,
          moduleTitle,
        })
      : null

  const presenterLiveStatusLabel =
    isTeacherLiveView && livePhase
      ? getLivePhaseLabel({
          livePhase,
          blockIndex: liveBlockIndex,
          blockCount: liveBlockCount,
          moduleTitle,
        })
      : ''

  return (
    <div
      ref={presentationRef}
      className={`course-player-layout flex min-h-[100dvh] flex-col ${presenterMode ? 'live-presenter-root' : ''} ${
        isFollowingLive ? 'live-student-view' : ''
      } ${isSample ? 'course-player-sample' : ''}`}
    >
      {isSample && !presenterMode && (
        <div className="sample-banner shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
          <strong>{SAMPLE_TITLE}</strong>
          <span className="mx-2 text-amber-700">·</span>
          Chapter 1 only —{' '}
          <AppNavLink to="/signup" className="font-semibold text-indigo-700 underline">
            sign up
          </AppNavLink>{' '}
          for full courses.
        </div>
      )}

      {presenterMode && (
        <LivePresenterTopNav
          moduleTitle={moduleTitle}
          slideIndex={slideNav?.index ?? 0}
          slideTotal={slideNav?.total ?? 1}
          busy={liveBusy}
          liveStudentCount={liveStudentCount}
          liveStatusLabel={presenterLiveStatusLabel}
          backLabel={liveRetreatTarget?.label}
          onBack={handleLiveRetreat}
          canBack={Boolean(liveRetreatTarget)}
          forwardLabel={liveAdvanceTarget?.label}
          onForward={handleLiveAdvance}
          canForward={Boolean(liveAdvanceTarget)}
        />
      )}

      <div className={`flex min-h-0 min-w-0 flex-1 ${presenterMode ? 'flex-col' : ''}`}>
        {!presenterMode && (
          <Sidebar
            courseId={courseId}
            courseOutline={courseOutline}
            activeModuleId={moduleId}
            editorPreview={editorPreview}
            isSample={isSample}
            isChapterAccessible={isChapterAccessible}
            modulePathFor={buildModulePath}
          />
        )}

        <div
          className={`course-player-main flex min-w-0 flex-1 flex-col ${
            presenterMode ? 'live-presenter-scroll-wrap' : 'lg:flex-row'
          }`}
        >
        <article
          className={`min-w-0 flex-1 p-6 md:p-8 ${
            presenterMode ? 'live-presenter-content' : 'overflow-y-auto'
          }`}
        >
          {!presenterMode && slideNav && !useBlockLessonNav && (
            <CourseModuleNav
              moduleTitle={moduleTitle}
              slideIndex={slideNav.index}
              slideTotal={slideNav.total}
              onPrevious={() => leaveToModule(slideNav.prev)}
              onNext={() => leaveToModule(slideNav.next)}
              hasPrevious={Boolean(slideNav.prev)}
              hasNext={Boolean(slideNav.next)}
              statusLabel={navStatusLabel}
            />
          )}

          {!presenterMode && <LiveClassFollower courseId={courseId} moduleId={moduleId} />}

          {!presenterMode && (
            <LessonModuleHeader
              chapterTitle={chapterTitle}
              subchapterTitle={subchapterTitle}
              moduleTitle={moduleTitle}
              completed={Boolean(moduleId && isComplete(courseId, moduleId))}
              isFinalTest={isFinalTest}
              liveSaveMessage={liveSaveMessage}
              liveSavedReportLink={liveSavedReportLink}
              teacherToolbar={
                isTeacher && !isFinalTest ? (
                  <div className="lesson-teacher-tools">
                    <LiveClassControl
                      courseId={courseId}
                      moduleId={moduleId}
                      moduleTitle={moduleTitle}
                      chapterTitle={chapterTitle}
                      subchapterTitle={subchapterTitle}
                      onGoLive={handleGoLive}
                      onEndLive={handleEndLive}
                      onReportSaved={handleLiveReportSaved}
                      presenterMode={presenterMode}
                    />
                  </div>
                ) : null
              }
            />
          )}

          {moduleLoading ? (
            <p className="text-slate-600">Loading module…</p>
          ) : (
            <>
              {showLiveSessionMaterials && !presenterMode && (
                <LiveSessionMaterials
                  materials={subchapterMaterials}
                  subchapterTitle={subchapterTitle}
                  variant="inline"
                />
              )}

              <div className="mt-8">
                {chapterLockedForModule ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
                    <p className="text-lg font-semibold text-slate-900">This chapter is locked</p>
                    <p className="mt-2 text-sm text-slate-600">
                      Your teacher has not unlocked{' '}
                      <strong>{activeModuleLocation?.chapter?.title || 'this chapter'}</strong> for
                      your class yet. Check back after they release it, or open an assigned final
                      test with the passcode they share.
                    </p>
                  </div>
                ) : null}
                {!chapterLockedForModule && moduleContent && livePhase !== LIVE_PHASES.EXIT_TICKET && (
                  <ModuleRenderer
                    module={moduleContent}
                    courseId={courseId}
                    moduleId={moduleId}
                    outline={courseOutline}
                    onComplete={handleComplete}
                    livePhase={livePhase}
                    liveBlockIndex={liveBlockIndex}
                    isLiveLessonSync={isLiveLessonSync}
                    isTeacherLiveView={isTeacherLiveView}
                    canSubmitLivePractice={canSubmitLivePractice}
                    onAdvanceToNextModule={
                      slideNav?.next ? () => leaveToModule(slideNav.next) : () => advanceAfterExitTicket()
                    }
                    hasNextModule={Boolean(slideNav?.next)}
                    nextModuleTitle={slideNav?.next?.title}
                    onBindFinalize={bindLessonFinalize}
                  />
                )}
                {!chapterLockedForModule &&
                moduleContent &&
                livePhase === LIVE_PHASES.EXIT_TICKET &&
                isFollowingLive &&
                isLiveOnThisModule ? (
                  <ExitTicketPlayer
                    key={`live-exit-${liveSession?.exitTicket?.startedAtMs ?? 'x'}`}
                    items={liveSession?.exitTicket?.items ?? []}
                    required
                    seconds={
                      liveSession?.exitTicket?.endsAtMs
                        ? Math.max(
                            1,
                            Math.ceil((Number(liveSession.exitTicket.endsAtMs) - Date.now()) / 1000),
                          )
                        : EXIT_TICKET_SECONDS
                    }
                    onSubmit={handleLiveExitSubmit}
                    onSkip={() => {}}
                    title={moduleTitle}
                  />
                ) : null}
              </div>

              {!presenterMode && !tutorPanelOpen && (
                <div className="mt-10 lg:hidden">
                  <DownloadManager
                    courseId={courseId}
                    courseTitle={courseOutline.title}
                    courseOutline={courseOutline}
                    subchapterId={subchapterId}
                    subchapterTitle={subchapterTitle}
                    moduleId={moduleId}
                    moduleTitle={moduleTitle}
                    userUid={user?.uid || ''}
                    role={role}
                    isSample={isSample}
                  />
                </div>
              )}
            </>
          )}
        </article>

        {!presenterMode && (
          <CourseRightPanel
            courseId={courseId}
            courseTitle={courseOutline.title}
            courseOutline={courseOutline}
            subchapterId={subchapterId}
            moduleId={moduleId}
            moduleTitle={moduleTitle}
            moduleContent={moduleContent}
            isTeacher={isTeacher}
            isQuiz={isQuiz}
            isFinalTest={isFinalTest}
            chapterTitle={chapterTitle}
            subchapterTitle={subchapterTitle}
            showTutor={showTutorOption}
            tutorOpen={tutorPanelOpen}
            onTutorOpenChange={setTutorPanelOpen}
            questionContext={tutorQuestionContext}
            tutorMode={tutorMode}
            allowFullAnswers={tutorAllowFullAnswers}
            contextType={tutorContextType}
            userUid={user?.uid || ''}
            role={role}
            isSample={isSample}
          />
        )}
        </div>
      </div>

      {presenterMode && (
        <LivePresenterBar
          onToggleFullscreen={handleToggleFullscreen}
          onEndLive={handlePresenterEndLive}
          saveMessage={liveSaveMessage}
          savedReportLink={liveSavedReportLink}
          busy={liveBusy}
        />
      )}

      {showLiveSessionMaterials && presenterMode && (
        <LiveSessionMaterials
          materials={subchapterMaterials}
          subchapterTitle={subchapterTitle}
          variant="floating"
        />
      )}

      {selfExitTicket ? (
        <ExitTicketPlayer
          items={selfExitTicket.items}
          required={Boolean(selfExitTicket.required)}
          onSubmit={handleSelfExitSubmit}
          onSkip={handleSelfExitContinue}
          title={moduleTitle}
        />
      ) : null}

      {presenterMode && livePhase === LIVE_PHASES.EXIT_TICKET ? (
        <div className="exit-ticket-presenter-layer">
          <ExitTicketTeacherBoard
            presenceRows={livePresenceRows}
            responseRows={liveExitResponses}
            itemCount={liveSession?.exitTicket?.itemCount ?? 2}
            secondsLeft={liveExitSecondsLeft}
            showNames
          />
        </div>
      ) : null}
    </div>
  )
}

export default CoursePlayer
