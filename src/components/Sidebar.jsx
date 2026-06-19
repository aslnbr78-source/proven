import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import {
  getInitialExpandedState,
  recordModuleAccess,
} from '../services/navigationState'
import { getChapterSubchapters } from '../utils/courseOutline'

const typeLabels = {
  'interactive-lesson': 'Lesson',
  quiz: 'Quiz',
  flashcard: 'Flashcards',
  'final-test': 'Final Test',
}

const typeColors = {
  'interactive-lesson': 'text-indigo-500',
  quiz: 'text-amber-600',
  flashcard: 'text-cyan-600',
  'final-test': 'text-rose-600',
}

function Chevron({ open }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L10.94 10 7.23 6.29a.75.75 0 111.06-1.06l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06 0z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function Sidebar({ courseId, courseOutline, activeModuleId }) {
  const { user } = useAuth()
  const { isComplete } = useProgress()
  const uid = user?.uid ?? 'guest'

  const [expandedChapters, setExpandedChapters] = useState(() =>
    getInitialExpandedState(uid, courseId, courseOutline, activeModuleId).expandedChapters,
  )
  const [expandedSubchapters, setExpandedSubchapters] = useState(() =>
    getInitialExpandedState(uid, courseId, courseOutline, activeModuleId).expandedSubchapters,
  )

  useEffect(() => {
    const initial = getInitialExpandedState(uid, courseId, courseOutline, activeModuleId)
    setExpandedChapters(initial.expandedChapters)
    setExpandedSubchapters(initial.expandedSubchapters)
  }, [courseId, courseOutline, activeModuleId, uid])

  useEffect(() => {
    if (!activeModuleId) {
      return
    }

    for (const chapter of courseOutline.chapters) {
      for (const subchapter of getChapterSubchapters(chapter)) {
        const found = subchapter.modules.some((module) => module.id === activeModuleId)
        if (found) {
          recordModuleAccess(uid, courseId, {
            chapterId: chapter.id,
            subchapterId: subchapter.id,
            moduleId: activeModuleId,
          })
          setExpandedChapters((previous) => new Set(previous).add(chapter.id))
          setExpandedSubchapters((previous) => new Set(previous).add(subchapter.id))
          return
        }
      }
    }
  }, [activeModuleId, courseId, courseOutline, uid])

  const toggleChapter = (chapterId) => {
    setExpandedChapters((previous) => {
      const next = new Set(previous)
      if (next.has(chapterId)) {
        next.delete(chapterId)
      } else {
        next.add(chapterId)
      }
      return next
    })
  }

  const toggleSubchapter = (subchapterId) => {
    setExpandedSubchapters((previous) => {
      const next = new Set(previous)
      if (next.has(subchapterId)) {
        next.delete(subchapterId)
      } else {
        next.add(subchapterId)
      }
      return next
    })
  }

  return (
    <aside className="course-sidebar">
      <Link to="/hub" className="text-sm font-medium text-indigo-600 no-underline hover:text-indigo-800">
        ← Back to Hub
      </Link>
      <h2 className="mt-4 text-lg font-bold text-slate-900">{courseOutline.title}</h2>

      <nav className="mt-6 space-y-2">
        {courseOutline.chapters.map((chapter) => {
          const chapterOpen = expandedChapters.has(chapter.id)
          const subchapters = getChapterSubchapters(chapter)

          return (
            <div key={chapter.id} className="rounded-xl border border-slate-200/80 bg-white/60">
              <button
                type="button"
                onClick={() => toggleChapter(chapter.id)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-slate-800 transition hover:bg-indigo-50/50"
                aria-expanded={chapterOpen}
              >
                <Chevron open={chapterOpen} />
                <span className="leading-snug">{chapter.title}</span>
              </button>

              {chapterOpen && (
                <div className="space-y-1 px-2 pb-2">
                  {subchapters.map((subchapter) => {
                    const subOpen = expandedSubchapters.has(subchapter.id)

                    return (
                      <div key={subchapter.id}>
                        <button
                          type="button"
                          onClick={() => toggleSubchapter(subchapter.id)}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                          aria-expanded={subOpen}
                        >
                          <Chevron open={subOpen} />
                          <span>{subchapter.title}</span>
                        </button>

                        {subOpen && (
                          <ul className="mb-1 ml-3 space-y-0.5 border-l-2 border-indigo-100 pl-2">
                            {subchapter.modules.map((module) => {
                              const isActive = module.id === activeModuleId
                              const completed = isComplete(courseId, module.id)

                              return (
                                <li key={module.id}>
                                  <Link
                                    to={`/courses/${courseId}/modules/${module.id}`}
                                    className={`flex items-start gap-2 rounded-lg px-2 py-2 text-sm no-underline transition ${
                                      isActive
                                        ? 'bg-indigo-50 font-semibold text-indigo-800 ring-1 ring-indigo-100'
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                                  >
                                    <span
                                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                        completed ? 'bg-emerald-500' : 'bg-slate-300'
                                      }`}
                                      aria-hidden="true"
                                    />
                                    <span>
                                      <span className="block leading-snug">{module.title}</span>
                                      <span
                                        className={`text-xs font-medium ${typeColors[module.type] ?? 'text-slate-400'}`}
                                      >
                                        {typeLabels[module.type] ?? module.type}
                                      </span>
                                    </span>
                                  </Link>
                                </li>
                              )
                            })}
                            {(subchapter.materials ?? []).map((material) => (
                              <li key={material.id}>
                                <a
                                  href={material.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-start gap-2 rounded-lg px-2 py-2 text-sm text-slate-600 no-underline transition hover:bg-amber-50 hover:text-amber-900"
                                >
                                  <span className="mt-0.5 text-xs" aria-hidden="true">
                                    📎
                                  </span>
                                  <span>
                                    <span className="block leading-snug">{material.title}</span>
                                    <span className="text-xs font-medium text-amber-600">
                                      {material.kind ?? 'file'}
                                    </span>
                                  </span>
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}

export default Sidebar
