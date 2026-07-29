import { useCallback, useEffect, useRef, useState } from 'react'
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
  deleteCourseAsset,
  deleteFirestoreCourse,
  gatherCoursePackageForPublish,
  listFirestoreCourses,
  publishCourseToFirestore,
  saveCourseAsset,
} from '../services/courseFirestore'
import { inferAssetKind, uploadCourseFile } from '../services/storageService'
import { useAuth } from '../context/AuthContext'
import { nextChapterId, nextSubchapterId } from '../utils/courseOutline'
import {
  downloadJson,
  fetchModuleTemplate,
  generateMaterialId,
  mapSubchapter,
  MATERIAL_KIND_ICONS,
  MATERIAL_KIND_LABELS,
  MODULE_KIND_ICONS,
  MODULE_KIND_LABELS,
  slugify,
} from '../utils/courseEditor'
import { parseModuleJson } from '../utils/validateContent'

function CourseBuilder() {
  const { courseId: routeCourseId } = useParams()
  const { user, profile } = useAuth()
  const fileInputRef = useRef(null)
  const uploadTargetRef = useRef(null)

  const [selectedCourseId, setSelectedCourseId] = useState(routeCourseId ?? 'algebra-1')
  const [outline, setOutline] = useState(null)
  const [published, setPublished] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [importTarget, setImportTarget] = useState(null)
  const [importText, setImportText] = useState('')
  const [importErrors, setImportErrors] = useState([])
  const [linkTarget, setLinkTarget] = useState(null)
  const [linkTitle, setLinkTitle] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [showNewCourse, setShowNewCourse] = useState(false)
  const [newCourseTitle, setNewCourseTitle] = useState('')
  const [newCourseId, setNewCourseId] = useState('')

  const customIds = getCustomCourseIds()
  const allCourseIds = [...new Set([...bundledCourses.map((c) => c.id), ...customIds])]
  const isLive = published.some((course) => course.id === selectedCourseId)

  const loadPublished = useCallback(async () => {
    const rows = await listFirestoreCourses()
    setPublished(rows.filter((course) => course.published))
  }, [])

  const loadCourse = useCallback(async (courseId) => {
    setLoading(true)
    setMessage('')
    try {
      const data = await loadOutline(courseId)
      setOutline(structuredClone(data))
    } catch {
      setOutline(null)
      setMessage('Could not load this course.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPublished()
  }, [loadPublished])

  useEffect(() => {
    if (selectedCourseId) {
      loadCourse(selectedCourseId)
    }
  }, [selectedCourseId, loadCourse])

  useEffect(() => {
    if (routeCourseId && routeCourseId !== selectedCourseId) {
      setSelectedCourseId(routeCourseId)
    }
  }, [routeCourseId, selectedCourseId])

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
          ? {
              ...ch,
              subchapters: [...ch.subchapters, { id, title, modules: [], materials: [] }],
            }
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

  const handleMaterialTitleChange = (chapterId, subchapterId, materialId, title) => {
    persistOutline({
      ...outline,
      chapters: mapSubchapter(outline.chapters, chapterId, subchapterId, (subchapter) => ({
        ...subchapter,
        materials: subchapter.materials.map((item) =>
          item.id === materialId ? { ...item, title } : item,
        ),
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
    if (!window.confirm('Remove this lesson/quiz from the outline?')) {
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

  const removeMaterial = async (chapterId, subchapterId, material) => {
    if (!window.confirm('Remove this file or link?')) {
      return
    }

    if (material.assetId) {
      try {
        await deleteCourseAsset(selectedCourseId, material.assetId)
      } catch {
        /* outline still updated */
      }
    }

    persistOutline({
      ...outline,
      chapters: mapSubchapter(outline.chapters, chapterId, subchapterId, (subchapter) => ({
        ...subchapter,
        materials: subchapter.materials.filter((item) => item.id !== material.id),
      })),
    })
  }

  const openImport = async (chapterId, subchapterId, templateType) => {
    setImportTarget({ chapterId, subchapterId })
    setImportErrors([])
    const text = templateType ? await fetchModuleTemplate(templateType) : ''
    setImportText(text)
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
    setMessage(`Added ${MODULE_KIND_LABELS[moduleData.type] ?? moduleData.type}: "${moduleData.title}".`)
  }

  const openLinkForm = (chapterId, subchapterId) => {
    setLinkTarget({ chapterId, subchapterId })
    setLinkTitle('')
    setLinkUrl('')
  }

  const handleAddLink = async (event) => {
    event.preventDefault()
    if (!linkTarget || !linkTitle.trim() || !linkUrl.trim()) {
      return
    }

    const { chapterId, subchapterId } = linkTarget
    const materialId = generateMaterialId()
    let assetId = null

    try {
      assetId = await saveCourseAsset(selectedCourseId, {
        kind: 'link',
        name: linkTitle.trim(),
        url: linkUrl.trim(),
        subchapterId,
        createdBy: user?.uid ?? null,
        ownerEmail: profile?.email ?? null,
      })
    } catch {
      /* keep in outline only */
    }

    const material = {
      id: materialId,
      kind: 'link',
      title: linkTitle.trim(),
      url: linkUrl.trim(),
      assetId,
    }

    persistOutline({
      ...outline,
      chapters: mapSubchapter(outline.chapters, chapterId, subchapterId, (subchapter) => ({
        ...subchapter,
        materials: [...subchapter.materials, material],
      })),
    })

    setLinkTarget(null)
    setLinkTitle('')
    setLinkUrl('')
    setMessage('Link added.')
  }

  const triggerUpload = (chapterId, subchapterId) => {
    uploadTargetRef.current = { chapterId, subchapterId }
    fileInputRef.current?.click()
  }

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0]
    const target = uploadTargetRef.current
    event.target.value = ''

    if (!file || !target || !outline) {
      return
    }

    setBusy(true)
    setMessage('')
    try {
      const uploaded = await uploadCourseFile(selectedCourseId, file)
      const kind = inferAssetKind(file)
      const materialId = generateMaterialId()

      let assetId = null
      try {
        assetId = await saveCourseAsset(selectedCourseId, {
          kind,
          name: file.name,
          url: uploaded.url,
          path: uploaded.path,
          contentType: uploaded.contentType,
          size: uploaded.size,
          subchapterId: target.subchapterId,
          createdBy: user?.uid ?? null,
          ownerEmail: profile?.email ?? null,
        })
      } catch {
        /* outline still updated */
      }

      const material = {
        id: materialId,
        kind,
        title: file.name,
        url: uploaded.url,
        storagePath: uploaded.path,
        assetId,
      }

      persistOutline({
        ...outline,
        chapters: mapSubchapter(
          outline.chapters,
          target.chapterId,
          target.subchapterId,
          (subchapter) => ({
            ...subchapter,
            materials: [...subchapter.materials, material],
          }),
        ),
      })
      setMessage(`Uploaded "${file.name}".`)
    } catch (error) {
      setMessage(error.message || 'Upload failed.')
    } finally {
      setBusy(false)
      uploadTargetRef.current = null
    }
  }

  const handleCreateCourse = () => {
    const id = newCourseId.trim() || slugify(newCourseTitle)
    if (!id || !newCourseTitle.trim()) {
      setMessage('Course title and ID are required.')
      return
    }
    if (allCourseIds.includes(id)) {
      setMessage(`Course ID "${id}" already exists. Choose a unique ID.`)
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

    try {
      createCustomCourse(newOutline)
    } catch (error) {
      setMessage(error.message || 'Could not create course.')
      return
    }
    setSelectedCourseId(id)
    setShowNewCourse(false)
    setNewCourseTitle('')
    setNewCourseId('')
    setMessage(`Created course "${newOutline.title}".`)
  }

  const handleExport = () => {
    saveCustomOutline(selectedCourseId, outline)
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

    setBusy(true)
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
      await loadPublished()
      setMessage(`Published "${outline.title}" — students see it on the Hub.`)
    } catch (error) {
      setMessage(error.message || 'Publish failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleUnpublish = async () => {
    if (
      !window.confirm(
        `Remove "${selectedCourseId}" from Firestore? Students will fall back to bundled JSON.`,
      )
    ) {
      return
    }

    setBusy(true)
    try {
      await deleteFirestoreCourse(selectedCourseId)
      await loadPublished()
      setMessage('Course unpublished.')
    } catch (error) {
      setMessage(error.message || 'Could not unpublish.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="page-container">
        <p className="text-slate-600">Loading course…</p>
      </div>
    )
  }

  return (
    <div className="page-container">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,video/*,image/*,.doc,.docx,.ppt,.pptx"
        className="hidden"
        onChange={handleFileUpload}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Course Builder</h1>
          <p className="page-subtitle">
            Build chapters and subchapters, add lessons, quizzes, files, and links — then publish.
          </p>
        </div>
        <Link to="/teacher" className="text-sm font-medium text-indigo-600 no-underline hover:text-indigo-800">
          ← Teacher Dashboard
        </Link>
      </div>

      {message && (
        <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {message}
        </p>
      )}

      <section className="card-modern mt-8">
        <h2 className="text-lg font-bold text-slate-900">Course</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="builder-course" className="block text-sm font-semibold text-slate-700">
              Select course
            </label>
            <select
              id="builder-course"
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="input-modern mt-1.5"
            >
              {allCourseIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                  {hasCustomCourse(id) ? ' (edited)' : ''}
                  {published.some((c) => c.id === id) ? ' · live' : ''}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => setShowNewCourse((v) => !v)} className="btn-secondary">
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
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
            >
              Reset to default
            </button>
          )}
          <button type="button" onClick={handleExport} className="btn-secondary">
            Export JSON
          </button>
          <button type="button" disabled={busy || !outline} onClick={handlePublish} className="btn-primary">
            {busy ? 'Working…' : isLive ? 'Re-publish' : 'Publish to Hub'}
          </button>
          {isLive && (
            <button
              type="button"
              disabled={busy}
              onClick={handleUnpublish}
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
            >
              Unpublish
            </button>
          )}
        </div>

        {showNewCourse && (
          <div className="mt-4 flex flex-wrap gap-3 rounded-xl bg-slate-50 p-4">
            <input
              type="text"
              placeholder="Course title"
              value={newCourseTitle}
              onChange={(e) => {
                setNewCourseTitle(e.target.value)
                setNewCourseId(slugify(e.target.value))
              }}
              className="input-modern"
            />
            <input
              type="text"
              placeholder="Course ID"
              value={newCourseId}
              onChange={(e) => setNewCourseId(e.target.value)}
              className="input-modern"
            />
            <button type="button" onClick={handleCreateCourse} className="btn-primary">
              Create
            </button>
          </div>
        )}

        {outline && (
          <p className="mt-3 text-sm text-slate-500">
            Editing <strong className="text-slate-700">{outline.title}</strong>
            {isLive ? ' · live on Firestore' : ' · draft (local + bundled JSON)'}
          </p>
        )}
      </section>

      {outline && (
        <section className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Outline</h2>
            <button type="button" onClick={handleAddChapter} className="btn-secondary !py-1.5 !text-sm">
              + Add chapter
            </button>
          </div>

          {outline.chapters.map((chapter, chapterIndex) => (
            <div key={chapter.id} className="card-modern !p-0 overflow-hidden">
              <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50/80 to-violet-50/50 px-5 py-4">
                <input
                  type="text"
                  value={chapter.title}
                  onChange={(e) => handleChapterTitleChange(chapter.id, e.target.value)}
                  className="w-full border-0 bg-transparent text-lg font-bold text-slate-900 focus:outline-none focus:ring-0"
                />
              </div>

              <div className="space-y-4 p-5">
                {chapter.subchapters.map((subchapter) => (
                  <div
                    key={subchapter.id}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="section-badge section-badge-learn !text-[10px]">Subchapter</span>
                      <input
                        type="text"
                        value={subchapter.title}
                        onChange={(e) =>
                          handleSubchapterTitleChange(chapter.id, subchapter.id, e.target.value)
                        }
                        className="input-modern min-w-0 flex-1 !py-1.5 text-sm font-semibold"
                      />
                    </div>

                    <ul className="mt-4 space-y-2">
                      {subchapter.modules.length === 0 && subchapter.materials.length === 0 && (
                        <li className="text-sm text-slate-500">
                          Nothing here yet — add a lesson, quiz, file, or link below.
                        </li>
                      )}

                      {subchapter.modules.map((module, index) => (
                        <li
                          key={module.id}
                          className="flex flex-wrap items-center gap-2 rounded-xl border border-white bg-white px-3 py-2.5 shadow-sm"
                        >
                          <span className="text-base" aria-hidden="true">
                            {MODULE_KIND_ICONS[module.type] ?? '📄'}
                          </span>
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
                            {MODULE_KIND_LABELS[module.type] ?? module.type}
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
                            className="input-modern min-w-0 flex-1 !py-1 text-sm"
                          />
                          <span className="text-xs text-slate-400">{module.id}</span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => moveModule(chapter.id, subchapter.id, index, -1)}
                              disabled={index === 0}
                              className="btn-secondary !px-2 !py-0.5 !text-xs disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => moveModule(chapter.id, subchapter.id, index, 1)}
                              disabled={index === subchapter.modules.length - 1}
                              className="btn-secondary !px-2 !py-0.5 !text-xs disabled:opacity-30"
                            >
                              ↓
                            </button>
                            <Link
                              to={`/courses/${selectedCourseId}/modules/${module.id}`}
                              className="btn-secondary !px-2 !py-0.5 !text-xs no-underline"
                            >
                              Preview
                            </Link>
                            <button
                              type="button"
                              onClick={() => removeModule(chapter.id, subchapter.id, module.id)}
                              className="rounded-lg border border-rose-200 px-2 py-0.5 text-xs text-rose-600"
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      ))}

                      {subchapter.materials.map((material) => (
                        <li
                          key={material.id}
                          className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/40 px-3 py-2.5"
                        >
                          <span className="text-base" aria-hidden="true">
                            {MATERIAL_KIND_ICONS[material.kind] ?? '📎'}
                          </span>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                            {MATERIAL_KIND_LABELS[material.kind] ?? material.kind}
                          </span>
                          <input
                            type="text"
                            value={material.title}
                            onChange={(e) =>
                              handleMaterialTitleChange(
                                chapter.id,
                                subchapter.id,
                                material.id,
                                e.target.value,
                              )
                            }
                            className="input-modern min-w-0 flex-1 !py-1 text-sm"
                          />
                          <a
                            href={material.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-indigo-600 no-underline hover:underline"
                          >
                            Open
                          </a>
                          <button
                            type="button"
                            onClick={() => removeMaterial(chapter.id, subchapter.id, material)}
                            className="rounded-lg border border-rose-200 px-2 py-0.5 text-xs text-rose-600"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openImport(chapter.id, subchapter.id, 'interactive-lesson')}
                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                      >
                        + Lesson
                      </button>
                      <button
                        type="button"
                        onClick={() => openImport(chapter.id, subchapter.id, 'quiz')}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                      >
                        + Quiz
                      </button>
                      <button
                        type="button"
                        onClick={() => openImport(chapter.id, subchapter.id, 'flashcard')}
                        className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-900 hover:bg-cyan-100"
                      >
                        + Flashcards
                      </button>
                      <button
                        type="button"
                        onClick={() => openImport(chapter.id, subchapter.id, 'final-test')}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100"
                      >
                        + Final test
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerUpload(chapter.id, subchapter.id)}
                        disabled={busy}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        + Upload file
                      </button>
                      <button
                        type="button"
                        onClick={() => openLinkForm(chapter.id, subchapter.id)}
                        className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100"
                      >
                        + Link
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => handleAddSubchapter(chapter.id)}
                  className="text-sm font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  + Add subchapter to Chapter {chapterIndex + 1}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {importTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card-modern max-h-[90vh] w-full max-w-2xl overflow-y-auto">
            <h3 className="text-xl font-bold">Import lesson / quiz / flashcards</h3>
            <p className="mt-1 text-sm text-slate-600">
              Paste JSON or use the loaded template. See{' '}
              <code className="rounded bg-slate-100 px-1">docs/LESSON_BUILDER_PROMPT.md</code> for AI
              generation.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {['interactive-lesson', 'fill-blank', 'quiz', 'flashcard', 'final-test'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={async () => setImportText(await fetchModuleTemplate(type))}
                  className="btn-secondary !py-1 !text-xs"
                >
                  Load {type} template
                </button>
              ))}
            </div>

            <textarea
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value)
                setImportErrors([])
              }}
              rows={14}
              className="input-modern mt-4 w-full font-mono text-sm"
              placeholder="Paste module JSON…"
            />

            {importErrors.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-rose-600">
                {importErrors.map((err) => (
                  <li key={err}>• {err}</li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex gap-3">
              <button type="button" onClick={handleImport} className="btn-primary">
                Validate & add
              </button>
              <button type="button" onClick={() => setImportTarget(null)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {linkTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleAddLink} className="card-modern w-full max-w-md">
            <h3 className="text-xl font-bold">Add external link</h3>
            <p className="mt-1 text-sm text-slate-600">Games, videos, reference sites, etc.</p>
            <input
              type="text"
              placeholder="Link title"
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
              className="input-modern mt-4 w-full"
              required
            />
            <input
              type="url"
              placeholder="https://…"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="input-modern mt-3 w-full"
              required
            />
            <div className="mt-4 flex gap-3">
              <button type="submit" className="btn-primary">
                Add link
              </button>
              <button type="button" onClick={() => setLinkTarget(null)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default CourseBuilder
