import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { courses as bundledCourses } from '../data/courses'
import {
  createCustomCourse,
  exportCoursePackage,
  getCustomCourseIds,
  hasCustomCourse,
  loadOutline,
  resetCourseToBundled,
  saveCustomModule,
  saveCustomOutline,
} from '../services/contentStore'
import {
  gatherCoursePackageForPublish,
  publishCourseToFirestore,
} from '../services/courseFirestore'
import { useAuth } from '../context/AuthContext'
import { nextChapterId, nextSubchapterId } from '../utils/courseOutline'
import { MODULE_TYPE_LABELS, parseModuleJson } from '../utils/validateContent'

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function mapSubchapter(chapters, chapterId, subchapterId, updater) {
  return chapters.map((chapter) => {
    if (chapter.id !== chapterId) {
      return chapter
    }

    return {
      ...chapter,
      subchapters: chapter.subchapters.map((subchapter) =>
        subchapter.id === subchapterId ? updater(subchapter) : subchapter,
      ),
    }
  })
}

function ContentManager() {
  const { courseId: routeCourseId } = useParams()
  const { user, profile } = useAuth()
  const [selectedCourseId, setSelectedCourseId] = useState(routeCourseId ?? 'algebra-1')
  const [outline, setOutline] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [importTarget, setImportTarget] = useState(null)
  const [importText, setImportText] = useState('')
  const [importErrors, setImportErrors] = useState([])
  const [showNewCourse, setShowNewCourse] = useState(false)
  const [newCourseTitle, setNewCourseTitle] = useState('')
  const [newCourseId, setNewCourseId] = useState('')
  const [publishing, setPublishing] = useState(false)

  const customIds = getCustomCourseIds()
  const allCourseIds = [...new Set([...bundledCourses.map((c) => c.id), ...customIds])]

  const loadCourse = useCallback(async (courseId) => {
    setLoading(true)
    setMessage('')
    try {
      const data = await loadOutline(courseId)
      setOutline(structuredClone(data))
    } catch {
      setOutline(null)
      setMessage('Could not load this course. Create a new one or pick another.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedCourseId) {
      loadCourse(selectedCourseId)
    }
  }, [selectedCourseId, loadCourse])

  const persistOutline = (nextOutline) => {
    setOutline(nextOutline)
    saveCustomOutline(selectedCourseId, nextOutline)
    setMessage('Changes saved.')
  }

  const handleAddChapter = () => {
    const id = nextChapterId(outline.chapters)
    const num = outline.chapters.length + 1
    persistOutline({
      ...outline,
      chapters: [
        ...outline.chapters,
        {
          id,
          title: `Chapter ${num}`,
          subchapters: [{ id: `${id}-sc01`, title: `${num}.1`, modules: [], materials: [] }],
        },
      ],
    })
  }

  const handleAddSubchapter = (chapterId) => {
    const chapterIndex = outline.chapters.findIndex((ch) => ch.id === chapterId)
    const chapter = outline.chapters[chapterIndex]
    if (!chapter) {
      return
    }

    const { id, title } = nextSubchapterId(chapter, chapterIndex)
    persistOutline({
      ...outline,
      chapters: outline.chapters.map((ch) =>
        ch.id === chapterId
          ? { ...ch, subchapters: [...ch.subchapters, { id, title, modules: [], materials: [] }] }
          : ch,
      ),
    })
  }

  const handleChapterTitleChange = (chapterId, title) => {
    persistOutline({
      ...outline,
      chapters: outline.chapters.map((ch) => (ch.id === chapterId ? { ...ch, title } : ch)),
    })
  }

  const handleSubchapterTitleChange = (chapterId, subchapterId, title) => {
    persistOutline({
      ...outline,
      chapters: mapSubchapter(outline.chapters, chapterId, subchapterId, (subchapter) => ({
        ...subchapter,
        title,
      })),
    })
  }

  const handleModuleTitleChange = (chapterId, subchapterId, moduleId, title) => {
    persistOutline({
      ...outline,
      chapters: mapSubchapter(outline.chapters, chapterId, subchapterId, (subchapter) => ({
        ...subchapter,
        modules: subchapter.modules.map((mod) => (mod.id === moduleId ? { ...mod, title } : mod)),
      })),
    })
  }

  const moveModule = (chapterId, subchapterId, moduleIndex, direction) => {
    const chapter = outline.chapters.find((ch) => ch.id === chapterId)
    const subchapter = chapter?.subchapters.find((sc) => sc.id === subchapterId)
    const targetIndex = moduleIndex + direction
    if (!subchapter || targetIndex < 0 || targetIndex >= subchapter.modules.length) {
      return
    }

    const modules = [...subchapter.modules]
    ;[modules[moduleIndex], modules[targetIndex]] = [modules[targetIndex], modules[moduleIndex]]

    persistOutline({
      ...outline,
      chapters: mapSubchapter(outline.chapters, chapterId, subchapterId, (sc) => ({
        ...sc,
        modules,
      })),
    })
  }

  const removeModule = (chapterId, subchapterId, moduleId) => {
    if (!window.confirm('Remove this module from the course outline?')) {
      return
    }

    persistOutline({
      ...outline,
      chapters: mapSubchapter(outline.chapters, chapterId, subchapterId, (subchapter) => ({
        ...subchapter,
        modules: subchapter.modules.filter((mod) => mod.id !== moduleId),
      })),
    })
  }

  const openImport = (chapterId, subchapterId) => {
    setImportTarget({ chapterId, subchapterId })
    setImportText('')
    setImportErrors([])
  }

  const handleImport = () => {
    const result = parseModuleJson(importText)
    if (!result.valid) {
      setImportErrors(result.errors)
      return
    }

    const moduleData = result.data
    saveCustomModule(selectedCourseId, moduleData.id, moduleData)

    const { chapterId, subchapterId } = importTarget
    const chapter = outline.chapters.find((ch) => ch.id === chapterId)
    const subchapter = chapter?.subchapters.find((sc) => sc.id === subchapterId)
    const exists = subchapter?.modules.some((mod) => mod.id === moduleData.id)

    const entry = {
      id: moduleData.id,
      type: moduleData.type,
      title: moduleData.title,
    }

    const updatedChapters = mapSubchapter(outline.chapters, chapterId, subchapterId, (sc) => {
      if (exists) {
        return {
          ...sc,
          modules: sc.modules.map((mod) => (mod.id === moduleData.id ? entry : mod)),
        }
      }
      return { ...sc, modules: [...sc.modules, entry] }
    })

    persistOutline({ ...outline, chapters: updatedChapters })
    setImportTarget(null)
    setImportText('')
    setImportErrors([])
    setMessage(`Imported "${moduleData.title}".`)
  }

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => setImportText(e.target.result)
    reader.readAsText(file)
  }

  const handleCreateCourse = () => {
    const id = newCourseId.trim() || slugify(newCourseTitle)
    if (!id || !newCourseTitle.trim()) {
      setMessage('Course title and ID are required.')
      return
    }

    const newOutline = {
      id,
      title: newCourseTitle.trim(),
      description: '',
      chapters: [
        {
          id: 'ch01',
          title: 'Chapter 1',
          subchapters: [{ id: 'ch01-sc01', title: '1.1', modules: [], materials: [] }],
        },
      ],
    }

    createCustomCourse(newOutline)
    setSelectedCourseId(id)
    setShowNewCourse(false)
    setNewCourseTitle('')
    setNewCourseId('')
    setMessage(`Created course "${newOutline.title}".`)
  }

  const handleExport = () => {
    const pack = exportCoursePackage(selectedCourseId)
    if (!pack) {
      saveCustomOutline(selectedCourseId, outline)
    }
    const exported = exportCoursePackage(selectedCourseId) ?? {
      courseJson: outline,
      modules: {},
    }

    downloadJson('course.json', exported.courseJson)
    Object.entries(exported.modules).forEach(([moduleId, data]) => {
      downloadJson(`${moduleId}.json`, data)
    })
    setMessage('Downloaded course.json and module files.')
  }

  const handlePublish = async () => {
    if (!outline) {
      return
    }

    setPublishing(true)
    setMessage('')
    try {
      saveCustomOutline(selectedCourseId, outline)
      const pack = await gatherCoursePackageForPublish(selectedCourseId, outline)
      await publishCourseToFirestore({
        courseId: selectedCourseId,
        outline: pack.courseJson,
        modules: pack.modules,
        uid: user?.uid,
        email: profile?.email,
      })
      setMessage(`Published "${outline.title}" to Firestore — students will see it on the Hub.`)
    } catch (error) {
      setMessage(error.message || 'Publish failed.')
    } finally {
      setPublishing(false)
    }
  }

  const loadTemplate = async (type) => {
    const fileMap = {
      'interactive-lesson': '/templates/interactive-lesson.template.json',
      'fill-blank': '/templates/interactive-lesson-fill-blank.template.json',
      quiz: '/templates/quiz.template.json',
      flashcard: '/templates/flashcard.template.json',
    }
    const response = await fetch(fileMap[type])
    const text = await response.text()
    setImportText(text)
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-slate-600">Loading…</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Content Manager</h1>
          <p className="mt-2 text-slate-600">
            Import lesson JSON and arrange modules. For files, links, and publishing use{' '}
            <Link to="/teacher/courses" className="font-semibold text-indigo-600 hover:underline">
              Course Builder
            </Link>
            .
          </p>
        </div>
        <Link to="/teacher" className="text-sm text-blue-600 hover:underline">
          ← Teacher Dashboard
        </Link>
      </div>

      {message && (
        <p className="mt-4 rounded bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>
      )}

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">1. Choose a course</h2>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="course-select" className="block text-sm font-medium text-slate-700">
              Course
            </label>
            <select
              id="course-select"
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="mt-1 rounded border border-slate-300 px-3 py-2"
            >
              {allCourseIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                  {hasCustomCourse(id) ? ' (custom)' : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setShowNewCourse((v) => !v)}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            New course
          </button>
          {hasCustomCourse(selectedCourseId) && (
            <button
              type="button"
              onClick={() => {
                resetCourseToBundled(selectedCourseId)
                loadCourse(selectedCourseId)
                setMessage('Reset to bundled content.')
              }}
              className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
            >
              Reset to default
            </button>
          )}
          <button
            type="button"
            onClick={handleExport}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Export JSON files
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing || !outline}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {publishing ? 'Publishing…' : 'Publish to Firestore'}
          </button>
        </div>

        {showNewCourse && (
          <div className="mt-4 flex flex-wrap gap-3 rounded bg-slate-50 p-4">
            <input
              type="text"
              placeholder="Course title"
              value={newCourseTitle}
              onChange={(e) => {
                setNewCourseTitle(e.target.value)
                setNewCourseId(slugify(e.target.value))
              }}
              className="rounded border border-slate-300 px-3 py-2"
            />
            <input
              type="text"
              placeholder="Course ID (e.g. business-math)"
              value={newCourseId}
              onChange={(e) => setNewCourseId(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
            <button
              type="button"
              onClick={handleCreateCourse}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            >
              Create
            </button>
          </div>
        )}
      </section>

      <section className="mt-8 rounded-lg border border-blue-200 bg-blue-50/50 p-6">
        <h2 className="text-lg font-semibold">2. Create content (templates & AI)</h2>
        <p className="mt-2 text-sm text-slate-600">
          Use a blank template or the AI prompt in{' '}
          <code className="rounded bg-white px-1">docs/LESSON_BUILDER_PROMPT.md</code> to generate
          valid JSON, then import into a subchapter below.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadTemplate('interactive-lesson')}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Load lesson template
          </button>
          <button
            type="button"
            onClick={() => loadTemplate('fill-blank')}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Load fill-in-the-blank template
          </button>
          <button
            type="button"
            onClick={() => loadTemplate('quiz')}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Load quiz template
          </button>
          <button
            type="button"
            onClick={() => loadTemplate('flashcard')}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Load flashcard template
          </button>
        </div>
      </section>

      {outline && (
        <section className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">3. Arrange content — {outline.title}</h2>
            <button
              type="button"
              onClick={handleAddChapter}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              + Add chapter
            </button>
          </div>

          {outline.chapters.map((chapter, chapterIndex) => (
            <div key={chapter.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <input
                type="text"
                value={chapter.title}
                onChange={(e) => handleChapterTitleChange(chapter.id, e.target.value)}
                className="w-full border-0 border-b border-slate-200 pb-2 text-lg font-semibold focus:border-blue-500 focus:outline-none"
              />

              <div className="mt-4 space-y-4">
                {chapter.subchapters.map((subchapter) => (
                  <div
                    key={subchapter.id}
                    className="rounded-lg border border-slate-100 bg-slate-50/80 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold uppercase text-slate-400">Subchapter</span>
                      <input
                        type="text"
                        value={subchapter.title}
                        onChange={(e) =>
                          handleSubchapterTitleChange(chapter.id, subchapter.id, e.target.value)
                        }
                        className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-sm font-medium"
                      />
                    </div>

                    <ul className="mt-3 space-y-2">
                      {subchapter.modules.length === 0 && (
                        <li className="text-sm text-slate-500">No modules yet — import one below.</li>
                      )}
                      {subchapter.modules.map((module, index) => (
                        <li
                          key={module.id}
                          className="flex flex-wrap items-center gap-2 rounded border border-slate-100 bg-white px-3 py-2"
                        >
                          <span className="text-xs font-medium uppercase text-slate-400">
                            {MODULE_TYPE_LABELS[module.type] ?? module.type}
                          </span>
                          <input
                            type="text"
                            value={module.title}
                            onChange={(e) =>
                              handleModuleTitleChange(
                                chapter.id,
                                subchapter.id,
                                module.id,
                                e.target.value,
                              )
                            }
                            className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-sm"
                          />
                          <span className="text-xs text-slate-400">{module.id}</span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => moveModule(chapter.id, subchapter.id, index, -1)}
                              disabled={index === 0}
                              className="rounded border px-2 py-0.5 text-xs disabled:opacity-30"
                              title="Move up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => moveModule(chapter.id, subchapter.id, index, 1)}
                              disabled={index === subchapter.modules.length - 1}
                              className="rounded border px-2 py-0.5 text-xs disabled:opacity-30"
                              title="Move down"
                            >
                              ↓
                            </button>
                            <Link
                              to={`/courses/${selectedCourseId}/modules/${module.id}`}
                              className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700 no-underline"
                            >
                              Preview
                            </Link>
                            <button
                              type="button"
                              onClick={() => removeModule(chapter.id, subchapter.id, module.id)}
                              className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600"
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>

                    <button
                      type="button"
                      onClick={() => openImport(chapter.id, subchapter.id)}
                      className="mt-3 text-sm font-medium text-blue-600 hover:underline"
                    >
                      + Import module into {subchapter.title || 'this subchapter'}
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleAddSubchapter(chapter.id)}
                className="mt-4 text-sm font-medium text-indigo-600 hover:underline"
              >
                + Add subchapter to Chapter {chapterIndex + 1}
              </button>
            </div>
          ))}
        </section>
      )}

      {importTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-xl font-bold">Import module JSON</h3>
            <p className="mt-1 text-sm text-slate-600">
              Paste JSON or upload a .json file. It will be validated before saving.
            </p>

            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="mt-4 block text-sm"
            />

            <textarea
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value)
                setImportErrors([])
              }}
              rows={14}
              className="mt-4 w-full rounded border border-slate-300 p-3 font-mono text-sm"
              placeholder="Paste module JSON here…"
            />

            {importErrors.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-red-600">
                {importErrors.map((err) => (
                  <li key={err}>• {err}</li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleImport}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Validate & save
              </button>
              <button
                type="button"
                onClick={() => setImportTarget(null)}
                className="rounded border border-slate-300 px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ContentManager
