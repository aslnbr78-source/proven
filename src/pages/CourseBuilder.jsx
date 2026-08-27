import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppNavLink from '../components/layout/AppNavLink'
import { staffPaths, navigateToTarget } from '../utils/navLinks'
import CourseEditorOutline from '../components/courseEditor/CourseEditorOutline'
import TeacherContentNav from '../components/layout/TeacherContentNav'
import CourseCatalogSettings, {
  nextAccentIndex,
  nextIconStyle,
} from '../components/courseEditor/CourseCatalogSettings'
import ModuleImportModal from '../components/courseEditor/ModuleImportModal'
import LinkGameModal from '../components/courseEditor/LinkGameModal'
import { courses as bundledCourses } from '../data/courses'
import { normalizeStandardCodes } from '../data/standards'
import {
  createCustomCourse,
  deleteCustomCourse,
  getCustomCourseIds,
  getCourseDraftExportedAt,
  getDraftStorageEstimate,
  clearAllDraftStorage,
  hasCustomCourse,
  loadOutline,
  markCourseDraftExported,
  resetCourseToBundled,
  saveCustomModule,
  saveCustomModuleAndOutline,
  saveCustomOutline,
  flushContentStore,
} from '../services/contentStore'
import {
  deleteCourseAsset,
  deleteFirestoreCourse,
  gatherCoursePackageForPublish,
  getFirestoreCourse,
  listFirestoreCourses,
  publishCourseToFirestore,
  saveCourseAsset,
} from '../services/courseFirestore'
import { inferAssetKind, uploadCourseFile } from '../services/storageService'
import { useAuth } from '../context/AuthContext'
import { useTeacherAccess } from '../hooks/useTeacherAccess'
import { ROLES } from '../utils/roles'
import { filterLicensedCourses } from '../utils/teacherPermissions'
import {
  buildContentWorkspaceLink,
  CONTENT_WORKSPACE_SECTIONS,
} from '../utils/workspacePaths'
import {
  countModules,
  flattenModules,
  nextChapterId,
  nextSubchapterId,
  ensureEditorScaffold,
} from '../utils/courseOutline'
import {
  allocateMenuExportFilenames,
  buildExportFilename,
  courseModulePreviewPath,
  coursePreviewPath,
  downloadJsonBatch,
  exportCoursePackageToFolder,
  fetchModuleTemplate,
  isFolderExportSupported,
  generateMaterialId,
  mapSubchapter,
  MODULE_KIND_LABELS,
  slugify,
} from '../utils/courseEditor'
import { parseModuleJson } from '../utils/validateContent'
import {
  buildGameCatalogOutlineEntry,
  buildOutlineModuleEntry,
  isGameCatalogOutlineModule,
} from '../utils/moduleImport'
import { getGameCourseByIdAsync } from '../data/mathGames'
import { buildCourseVisualMeta } from '../utils/courseVisuals'
import {
  buildAdaptiveMasteryModule,
  buildAdaptivePracticeModule,
  buildChapterReviewSubchapter,
  buildSectionReviewSubchapter,
  chapterHasAdaptiveReview,
  getChapterReviewSubchapter,
  insertSubchapterAfter,
  collectSourceModuleIds,
  collectStandards,
  sectionHasAdaptiveReview,
  upsertReviewSubchapter,
} from '../utils/adaptiveCourseBuilder'

function CourseBuilder() {
  const { courseId: routeCourseId } = useParams()
  const navigate = useNavigate()
  const { user, profile, role } = useAuth()
  const backPath = staffPaths.dashboard(role)
  const fileInputRef = useRef(null)
  const uploadTargetRef = useRef(null)

  const [selectedCourseId, setSelectedCourseId] = useState(routeCourseId?.trim() || 'algebra-1')
  const [outline, setOutline] = useState(null)
  const [published, setPublished] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [draftExportedAt, setDraftExportedAt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [importTarget, setImportTarget] = useState(null)
  const [importText, setImportText] = useState('')
  const [importErrors, setImportErrors] = useState([])
  const [linkTarget, setLinkTarget] = useState(null)
  const [linkTitle, setLinkTitle] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [gameLinkTarget, setGameLinkTarget] = useState(null)
  const [showNewCourse, setShowNewCourse] = useState(false)
  const [newCourseTitle, setNewCourseTitle] = useState('')
  const [newCourseId, setNewCourseId] = useState('')

  const teacherAccess = useTeacherAccess(selectedCourseId)
  const customIdsKey = getCustomCourseIds().join('|')

  const allCourses = useMemo(() => {
    const customIds = customIdsKey ? customIdsKey.split('|').filter(Boolean) : []
    const courseMap = new Map()
    bundledCourses.forEach((course) => courseMap.set(course.id, course))
    published.forEach((course) => {
      courseMap.set(course.id, { id: course.id, title: course.title ?? course.id })
    })
    customIds.forEach((id) => {
      if (!courseMap.has(id)) {
        courseMap.set(id, { id, title: id })
      }
    })
    return [...courseMap.values()]
  }, [published, customIdsKey])

  const accessibleCourses = useMemo(
    () =>
      filterLicensedCourses(allCourses, {
        role,
        teacherProfile: teacherAccess.teacherProfile,
        licenses: teacherAccess.licenses,
      }).filter((course) => {
        if (role === ROLES.ADMIN || teacherAccess.legacy) {
          return true
        }
        const license = teacherAccess.licenses.find((item) => item.courseId === course.id)
        return license?.accessLevel !== 'use'
      }),
    [allCourses, role, teacherAccess.legacy, teacherAccess.licenses, teacherAccess.teacherProfile],
  )

  const allCourseIds = useMemo(
    () => accessibleCourses.map((course) => course.id),
    [accessibleCourses],
  )

  /** Dropdown always includes bundled + licensed courses (original editor behavior). */
  const pickerCourseIds = useMemo(() => {
    const ids = new Set([
      ...bundledCourses.map((course) => course.id),
      ...allCourseIds,
      ...(customIdsKey ? customIdsKey.split('|').filter(Boolean) : []),
    ])
    return [...ids]
  }, [allCourseIds, customIdsKey])

  const editAccess = teacherAccess.can('edit')
  const publishAccess = teacherAccess.can('publish')
  const deleteAccess = teacherAccess.can('delete')
  const createAccess = teacherAccess.can('create')
  const isLive = published.some((course) => course.id === selectedCourseId)
  const isBundledCourse = bundledCourses.some((course) => course.id === selectedCourseId)
  const selectedCourseTitle =
    outline?.title ??
    accessibleCourses.find((course) => course.id === selectedCourseId)?.title ??
    bundledCourses.find((course) => course.id === selectedCourseId)?.title ??
    selectedCourseId

  const loadPublished = useCallback(async () => {
    try {
      const rows = await listFirestoreCourses()
      setPublished(rows.filter((course) => course.published))
    } catch {
      setPublished([])
    }
  }, [])

  const reloadOutline = useCallback(async (courseId, { source = 'auto' } = {}) => {
    if (!courseId) {
      setLoading(false)
      setOutline(null)
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const data = await loadOutline(courseId, { source })
      const { outline: scaffolded, changed } = ensureEditorScaffold(structuredClone(data))
      setOutline(scaffolded)
      if (source === 'bundled' || source === 'hub') {
        saveCustomOutline(courseId, scaffolded)
      } else if (changed) {
        saveCustomOutline(courseId, scaffolded)
        setMessage('Added a starter chapter and section so you can begin building.')
      }
    } catch (error) {
      setOutline(null)
      setMessage(
        error?.message ||
          `Could not load "${courseId}". Try another course below, or clear browser site data if a draft is corrupted.`,
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPublished()
  }, [loadPublished])

  useEffect(() => {
    const routeId = routeCourseId?.trim()
    if (routeId) {
      setSelectedCourseId(routeId)
    }
  }, [routeCourseId])

  useEffect(() => {
    let cancelled = false

    if (!selectedCourseId) {
      setLoading(false)
      setOutline(null)
      return undefined
    }

    setLoading(true)
    setMessage('')

    loadOutline(selectedCourseId)
      .then((data) => {
        if (cancelled) {
          return
        }
        const { outline: scaffolded, changed } = ensureEditorScaffold(structuredClone(data))
        setOutline(scaffolded)
        if (changed) {
          saveCustomOutline(selectedCourseId, scaffolded)
          setMessage('Added a starter chapter and section so you can begin building.')
        }
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        setOutline(null)
        setMessage(
          `Could not load "${selectedCourseId}". Try another course below, or clear browser site data if a draft is corrupted.`,
        )
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedCourseId])

  useEffect(() => {
    setDraftExportedAt(getCourseDraftExportedAt(selectedCourseId))
  }, [selectedCourseId, outline])

  const hasLocalDraft = hasCustomCourse(selectedCourseId)

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

  const handleModuleStandardsChange = (chapterId, subchapterId, moduleId, standardsText) => {
    const standards = normalizeStandardCodes(standardsText)
    persistOutline({
      ...outline,
      chapters: mapSubchapter(outline.chapters, chapterId, subchapterId, (subchapter) => ({
        ...subchapter,
        modules: subchapter.modules.map((mod) =>
          mod.id === moduleId ? { ...mod, standards } : mod,
        ),
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

  const removeSubchapter = (chapterId, subchapterId) => {
    const chapter = outline.chapters.find((ch) => ch.id === chapterId)
    if (!chapter || chapter.subchapters.length <= 1) {
      window.alert('Each chapter must keep at least one section.')
      return
    }

    if (!window.confirm('Remove this section and everything inside it?')) {
      return
    }

    persistOutline({
      ...outline,
      chapters: outline.chapters.map((ch) =>
        ch.id === chapterId
          ? {
              ...ch,
              subchapters: ch.subchapters.filter((subchapter) => subchapter.id !== subchapterId),
            }
          : ch,
      ),
    })
  }

  const removeChapter = (chapterId) => {
    if (outline.chapters.length <= 1) {
      window.alert('The course must keep at least one chapter.')
      return
    }

    if (!window.confirm('Remove this chapter and all of its sections?')) {
      return
    }

    persistOutline({
      ...outline,
      chapters: outline.chapters.filter((chapter) => chapter.id !== chapterId),
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
    if (!templateType) {
      const isSameInlineTarget =
        importTarget?.chapterId === chapterId &&
        importTarget?.subchapterId === subchapterId &&
        importTarget?.templateType == null

      if (isSameInlineTarget) {
        setImportTarget(null)
        setImportText('')
        setImportErrors([])
        return
      }

      setImportTarget({ chapterId, subchapterId, templateType: null })
      setImportErrors([])
      setImportText('')
      return
    }

    setImportTarget({ chapterId, subchapterId, templateType })
    setImportErrors([])
    const text = await fetchModuleTemplate(templateType)
    setImportText(text)
  }

  const commitModuleImport = async (moduleData) => {
    if (!importTarget || !outline) {
      return { ok: false, error: 'Open Import JSON on a section first, then try again.' }
    }

    if (!selectedCourseId) {
      return { ok: false, error: 'No course selected.' }
    }

    const { chapterId, subchapterId } = importTarget
    const chapter = outline.chapters?.find((ch) => ch.id === chapterId)
    const subchapter = chapter?.subchapters?.find((sc) => sc.id === subchapterId)

    if (!chapter || !subchapter) {
      return {
        ok: false,
        error:
          'That section is no longer in the outline. Close import, expand the section again, then retry.',
      }
    }

    const modules = Array.isArray(subchapter.modules) ? subchapter.modules : []
    const exists = modules.some((mod) => mod.id === moduleData.id)
    const entry = buildOutlineModuleEntry(moduleData)

    const updatedChapters = mapSubchapter(outline.chapters, chapterId, subchapterId, (sc) => {
      const currentModules = Array.isArray(sc.modules) ? sc.modules : []
      if (exists) {
        return {
          ...sc,
          modules: currentModules.map((mod) => (mod.id === moduleData.id ? entry : mod)),
        }
      }
      return { ...sc, modules: [...currentModules, entry] }
    })

    const nextOutline = { ...outline, chapters: updatedChapters }

    try {
      await saveCustomModuleAndOutline(
        selectedCourseId,
        moduleData.id,
        moduleData,
        nextOutline,
      )
      await flushContentStore()
    } catch (error) {
      const quota =
        error?.name === 'QuotaExceededError' ||
        /quota|full/i.test(String(error?.message ?? error))
      return {
        ok: false,
        error: quota
          ? 'Browser draft storage is full — use “Free draft storage” below, then import again.'
          : `Could not save import: ${error?.message ?? 'unknown error'}`,
      }
    }

    setOutline(nextOutline)
    setImportTarget(null)
    setImportText('')
    setImportErrors([])
    setMessage(
      `Imported ${MODULE_KIND_LABELS[moduleData.type] ?? moduleData.type}: "${moduleData.title}".`,
    )
    return { ok: true }
  }

  const handleImport = async () => {
    const result = parseModuleJson(importText, {
      requestedKind: importTarget?.templateType ?? null,
    })
    if (!result.valid) {
      setImportErrors(result.errors)
      return { ok: false, error: result.errors?.[0] ?? 'Invalid JSON' }
    }

    const committed = await commitModuleImport(result.data)
    if (!committed?.ok) {
      setImportErrors([committed?.error ?? 'Import failed.'])
    }
    return committed
  }

  const handleImportModule = async (moduleData) => {
    const committed = await commitModuleImport(moduleData)
    if (!committed?.ok) {
      setImportErrors([committed?.error ?? 'Import failed.'])
    }
    return committed
  }

  const handleImportModuleAndPreview = async (moduleData) => {
    const committed = await commitModuleImport(moduleData)
    if (!committed?.ok) {
      setImportErrors([committed?.error ?? 'Import failed.'])
      return committed
    }
    window.open(
      courseModulePreviewPath(selectedCourseId, moduleData.id),
      '_blank',
      'noopener,noreferrer',
    )
    return committed
  }

  const closeJsonImport = () => {
    setImportTarget(null)
    setImportText('')
    setImportErrors([])
  }

  const jsonImportTarget =
    importTarget && importTarget.templateType == null ? importTarget : null
  const modalImportTarget =
    importTarget && importTarget.templateType != null ? importTarget : null

  const commitAdaptiveReviewPair = async ({ chapterId, subchapterId = null, afterSubchapterId = null }) => {
    if (!outline) {
      return
    }

    const chapterIndex = outline.chapters.findIndex((ch) => ch.id === chapterId)
    const chapter = outline.chapters[chapterIndex]
    if (!chapter) {
      return
    }

    const subchapter = subchapterId
      ? chapter.subchapters.find((sc) => sc.id === subchapterId)
      : null

    if (!subchapter && chapterHasAdaptiveReview(chapter)) {
      setMessage('This chapter already has a chapter review section with AI Practice and Mastery Check.')
      return
    }

    if (subchapter && sectionHasAdaptiveReview(chapter, subchapter.id)) {
      setMessage('This section already has an AI review block.')
      return
    }

    const sourceIds = collectSourceModuleIds(chapter, { subchapterId: subchapter?.id ?? null })
    if (sourceIds.length === 0) {
      setMessage('Add at least one lesson or quiz before creating an AI review block.')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      const masteryTemplateText = await fetchModuleTemplate('adaptive-mastery')
      let templateBank = []
      if (masteryTemplateText) {
        const parsed = parseModuleJson(masteryTemplateText)
        if (parsed.valid) {
          templateBank = parsed.data.bank ?? []
        }
      }

      const practiceData = buildAdaptivePracticeModule({ chapter, chapterIndex, subchapter })
      const masteryData = buildAdaptiveMasteryModule({
        chapter,
        chapterIndex,
        subchapter,
        templateBank,
      })

      saveCustomModule(selectedCourseId, practiceData.id, practiceData)
      saveCustomModule(selectedCourseId, masteryData.id, masteryData)

      const practiceEntry = {
        ...buildOutlineModuleEntry(practiceData),
        standards: collectStandards(chapter, { subchapterId: subchapter?.id ?? null }),
      }
      const masteryEntry = {
        ...buildOutlineModuleEntry(masteryData),
        standards: collectStandards(chapter, { subchapterId: subchapter?.id ?? null }),
      }

      let updatedChapters = outline.chapters

      if (subchapter) {
        const reviewSubchapter = buildSectionReviewSubchapter({
          subchapter,
          practiceModule: practiceData,
          masteryModule: masteryData,
        })
        const existingReview = chapter.subchapters.find((sc) => sc.id === reviewSubchapter.id)

        if (existingReview) {
          updatedChapters = upsertReviewSubchapter(outline.chapters, chapterId, {
            ...existingReview,
            modules: [
              ...existingReview.modules.filter(
                (mod) => mod.id !== practiceData.id && mod.id !== masteryData.id,
              ),
              practiceEntry,
              masteryEntry,
            ],
          })
        } else {
          updatedChapters = insertSubchapterAfter(
            outline.chapters,
            chapterId,
            afterSubchapterId ?? subchapter.id,
            {
              ...reviewSubchapter,
              modules: [practiceEntry, masteryEntry],
            },
          )
        }
      } else {
        const existingReview = getChapterReviewSubchapter(chapter)
        const reviewSubchapter = buildChapterReviewSubchapter({
          chapter,
          chapterIndex,
          practiceModule: practiceData,
          masteryModule: masteryData,
        })

        updatedChapters = upsertReviewSubchapter(outline.chapters, chapterId, {
          ...(existingReview ?? reviewSubchapter),
          title: reviewSubchapter.title,
          modules: [
            ...(existingReview?.modules ?? []).filter(
              (mod) => mod.id !== practiceData.id && mod.id !== masteryData.id,
            ),
            practiceEntry,
            masteryEntry,
          ],
          materials: existingReview?.materials ?? [],
        })
      }

      persistOutline({ ...outline, chapters: updatedChapters })
      setMessage(
        subchapter
          ? `Added AI Practice + Mastery Check after "${subchapter.title}" (covers ${sourceIds.length} item${sourceIds.length === 1 ? '' : 's'}). Customize the mastery bank in JSON.`
          : `Added chapter AI review covering ${sourceIds.length} item${sourceIds.length === 1 ? '' : 's'} across all sections. Customize the mastery bank in JSON.`,
      )
    } catch (error) {
      setMessage(error.message || 'Could not add AI review block.')
    } finally {
      setBusy(false)
    }
  }

  const handleAddChapterAdaptiveReview = (chapterId) => {
    commitAdaptiveReviewPair({ chapterId })
  }

  const handleAddSectionAdaptiveReview = (chapterId, subchapterId) => {
    commitAdaptiveReviewPair({ chapterId, subchapterId, afterSubchapterId: subchapterId })
  }

  const handleModuleSaved = (moduleData) => {
    if (!outline || !moduleData?.id) {
      return
    }

    const updatedChapters = outline.chapters.map((chapter) => ({
      ...chapter,
      subchapters: chapter.subchapters.map((subchapter) => ({
        ...subchapter,
        modules: subchapter.modules.map((mod) =>
          mod.id === moduleData.id ? buildOutlineModuleEntry(moduleData) : mod,
        ),
      })),
    }))

    persistOutline({ ...outline, chapters: updatedChapters })
    setMessage(`Updated "${moduleData.title}".`)
  }

  const openLinkForm = (chapterId, subchapterId) => {
    setLinkTarget({ chapterId, subchapterId })
    setLinkTitle('')
    setLinkUrl('')
  }

  const openLinkGame = (chapterId, subchapterId) => {
    setGameLinkTarget({ chapterId, subchapterId })
  }

  const handleLinkGame = async ({ chapterId, subchapterId, game }) => {
    if (!outline || !selectedCourseId) {
      return { ok: false, error: 'No course selected.' }
    }
    if (!game?.id) {
      return { ok: false, error: 'Pick a game first.' }
    }

    const chapter = outline.chapters?.find((ch) => ch.id === chapterId)
    const subchapter = chapter?.subchapters?.find((sc) => sc.id === subchapterId)
    if (!chapter || !subchapter) {
      return { ok: false, error: 'That section is no longer in the outline.' }
    }

    const modules = Array.isArray(subchapter.modules) ? subchapter.modules : []
    if (modules.some((mod) => mod.id === game.id)) {
      return { ok: false, error: 'That game is already in this section.' }
    }

    // Block duplicate id anywhere in the course outline
    for (const ch of outline.chapters ?? []) {
      for (const sc of ch.subchapters ?? []) {
        if ((sc.modules ?? []).some((mod) => mod.id === game.id)) {
          return {
            ok: false,
            error: `“${game.title}” is already linked elsewhere in this course.`,
          }
        }
      }
    }

    const entry = buildGameCatalogOutlineEntry(game)
    const updatedChapters = mapSubchapter(outline.chapters, chapterId, subchapterId, (sc) => ({
      ...sc,
      modules: [...(Array.isArray(sc.modules) ? sc.modules : []), entry],
    }))
    const nextOutline = { ...outline, chapters: updatedChapters }
    persistOutline(nextOutline)
    setOutline(nextOutline)
    setMessage(`Linked game “${entry.title}” from the Games catalog (shared body).`)
    setGameLinkTarget(null)
    return { ok: true }
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
    if (!createAccess.allowed) {
      setMessage(createAccess.reason || 'You cannot create new courses.')
      return
    }

    const id = newCourseId.trim() || slugify(newCourseTitle)
    if (!id || !newCourseTitle.trim()) {
      setMessage('Course title and ID are required.')
      return
    }

    const visual = buildCourseVisualMeta(id, newCourseTitle.trim())
    const newOutline = {
      id,
      title: newCourseTitle.trim(),
      description: '',
      iconStyle: visual.iconStyle,
      accentIndex: visual.accentIndex,
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

  const getExportPackage = useCallback(async () => {
    if (outline) {
      saveCustomOutline(selectedCourseId, outline)
    }
    // Export only modules on the current editor outline (the live course menu),
    // not orphaned modules from an older bundled outline or Firestore leftovers.
    return gatherCoursePackageForPublish(selectedCourseId, outline)
  }, [outline, selectedCourseId])

  const handleExport = async () => {
    if (!teacherAccess.isAdmin) {
      setMessage('Only admins can export course JSON.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const exported = await getExportPackage()
      const moduleCount = Object.keys(exported.modules ?? {}).length
      const outlineModules = flattenModules(exported.courseJson).map((module) => ({
        id: module.id,
        title: module.title,
      }))
      const knownIds = new Set(outlineModules.map((module) => module.id))
      for (const [moduleId, data] of Object.entries(exported.modules ?? {})) {
        if (!knownIds.has(moduleId)) {
          outlineModules.push({ id: moduleId, title: data?.title ?? moduleId })
        }
      }
      const filenames = allocateMenuExportFilenames(selectedCourseId, outlineModules)
      const files = [
        {
          filename: buildExportFilename(selectedCourseId),
          data: exported.courseJson,
        },
        ...Object.entries(exported.modules).map(([moduleId, data]) => ({
          filename:
            filenames.get(moduleId) ??
            `${selectedCourseId}-${moduleId}.json`,
          data,
        })),
      ]

      await downloadJsonBatch(files)
      markCourseDraftExported(selectedCourseId)
      setDraftExportedAt(getCourseDraftExportedAt(selectedCourseId))
      const missing = exported.missingModuleIds?.length ?? 0
      setMessage(
        `Downloaded ${files.length} file(s) (${moduleCount} lesson JSON + course outline) named from menu titles.` +
          (missing > 0 ? ` ${missing} outline module(s) had no JSON body to export.` : ''),
      )
    } catch (error) {
      setMessage(error?.message ?? 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleExportToFolder = async () => {
    if (!teacherAccess.isAdmin) {
      setMessage('Only admins can export course JSON.')
      return
    }
    if (!isFolderExportSupported()) {
      setMessage(
        'Folder export needs Chrome or Edge. Use Export JSON (Downloads) or save files manually into public/lessons/{course-id}/.',
      )
      return
    }

    setBusy(true)
    setMessage('')
    try {
      const exported = await getExportPackage()
      const result = await exportCoursePackageToFolder(selectedCourseId, exported)
      markCourseDraftExported(selectedCourseId)
      setDraftExportedAt(getCourseDraftExportedAt(selectedCourseId))
      const missing = exported.missingModuleIds?.length ?? 0
      setMessage(
        `Saved to ${result.coursePath} and ${result.lessonCount} lesson file(s) under lessons/${selectedCourseId}/ (menu-title names + moduleId hosting copies).` +
          (missing > 0 ? ` ${missing} outline module(s) had no JSON body.` : ''),
      )
    } catch (error) {
      if (error?.name === 'AbortError') {
        setMessage('Export cancelled.')
      } else {
        setMessage(error?.message ?? 'Could not export to folder.')
      }
    } finally {
      setBusy(false)
    }
  }

  const handlePreviewCourse = () => {
    if (!selectedCourseId || !outline) {
      return
    }

    saveCustomOutline(selectedCourseId, outline)
    window.open(coursePreviewPath(selectedCourseId), '_blank', 'noopener,noreferrer')
  }

  const handlePublish = async () => {
    if (!outline) {
      return
    }

    if (!publishAccess.allowed) {
      setMessage(publishAccess.reason || 'You cannot publish this course.')
      return
    }

    try {
      const hubCourse = await getFirestoreCourse(selectedCourseId)
      const draftCount = countModules(outline)
      if (hubCourse && (hubCourse.published === true || hubCourse.published === 'true')) {
        const hubCount = countModules(hubCourse)
        if (hubCount > 0 && draftCount < hubCount) {
          const confirmed = window.confirm(
            `Your draft has ${draftCount} modules, but the live Hub course has ${hubCount}.\n\nPublishing will REPLACE the Hub outline and can hide lessons that still exist in Hub storage.\n\nOnly continue if you intentionally removed those sections.\n\nPublish anyway?`,
          )
          if (!confirmed) {
            setMessage('Publish cancelled — Hub outline left unchanged.')
            return
          }
        }
      }

      // Also guard against publishing a thin draft when Hub was already thinned but
      // the shipped course.json still has the full menu (e.g. Statistics Ch 4–5).
      try {
        const bundledRes = await fetch(`/courses/${selectedCourseId}/course.json`)
        if (bundledRes.ok) {
          const bundled = await bundledRes.json()
          const bundledCount = countModules(bundled)
          if (bundledCount > 0 && draftCount < bundledCount) {
            const confirmed = window.confirm(
              `Your draft has ${draftCount} modules, but the shipped course outline has ${bundledCount}.\n\nPublishing can hide chapters that still ship with the app (and may still have Hub lesson bodies).\n\nUse “Reset to bundled default” or wait for missing chapters to auto-fill, then publish.\n\nPublish this thinner outline anyway?`,
            )
            if (!confirmed) {
              setMessage('Publish cancelled — restore the full outline before publishing.')
              return
            }
          }
        }
      } catch {
        /* ignore bundled check failures */
      }
    } catch {
      // If Hub check fails, still allow publish (offline / rules).
    }

    // Linked games load from the Games catalog, so they must be published there too.
    try {
      const linkedGames = flattenModules(outline).filter(isGameCatalogOutlineModule)
      if (linkedGames.length > 0) {
        const catalog = await getGameCourseByIdAsync(selectedCourseId, { includeDraft: false })
        const availableIds = new Set((catalog?.games ?? []).map((game) => game.id))
        const missing = linkedGames.filter((game) => !availableIds.has(game.id))
        if (missing.length > 0) {
          const names = missing.map((game) => `• ${game.title}`).join('\n')
          const confirmed = window.confirm(
            `These linked games are not published in the Games catalog yet:\n\n${names}\n\nStudents will see an error until you publish them under Games → ${selectedCourseId}.\n\nPublish the course anyway?`,
          )
          if (!confirmed) {
            setMessage('Publish cancelled — publish the linked games first.')
            return
          }
        }
      }
    } catch {
      // Catalog check is advisory only.
    }

    setBusy(true)
    setMessage('')
    try {
      saveCustomOutline(selectedCourseId, outline)
      const pack = await gatherCoursePackageForPublish(selectedCourseId, outline)
      const missing = pack.missingModuleIds?.length ?? 0
      if (missing > 0) {
        const confirmed = window.confirm(
          `${missing} module(s) on your outline have no full JSON body in this browser (draft → Hub → bundled).\n\nPublishing will keep any existing Hub content for those modules, but new sections without imported JSON will stay empty.\n\nImport each lesson via Course Builder before publishing, or use Export to folder after import.\n\nPublish anyway?`,
        )
        if (!confirmed) {
          setMessage('Publish cancelled — import lesson JSON for missing modules first.')
          setBusy(false)
          return
        }
      }
      await publishCourseToFirestore({
        courseId: selectedCourseId,
        outline: pack.courseJson,
        modules: pack.modules,
        uid: user?.uid,
        email: profile?.email,
      })
      await loadPublished()
      markCourseDraftExported(selectedCourseId)
      setDraftExportedAt(getCourseDraftExportedAt(selectedCourseId))
      setMessage(`Published "${outline.title}" — students see it on Courses.`)
    } catch (error) {
      setMessage(error.message || 'Publish failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleUnpublish = async () => {
    if (!deleteAccess.allowed) {
      setMessage(deleteAccess.reason || 'You cannot remove this course from the Hub.')
      return
    }

    if (
      !window.confirm(
        `Remove "${outline?.title ?? selectedCourseId}" from the student Hub?\n\nStudents will no longer see your published version. Bundled default content (if any) may still appear under the same course ID.`,
      )
    ) {
      return
    }

    setBusy(true)
    try {
      await deleteFirestoreCourse(selectedCourseId)
      await loadPublished()
      setMessage('Course removed from the Hub.')
    } catch (error) {
      setMessage(error.message || 'Could not remove from Hub.')
    } finally {
      setBusy(false)
    }
  }

  const handleDiscardLocalEdits = () => {
    if (
      !window.confirm(
        `Discard your local edits for "${selectedCourseId}" in this browser? This cannot be undone.`,
      )
    ) {
      return
    }

    deleteCustomCourse(selectedCourseId)
    reloadOutline(selectedCourseId)
    setMessage('Local edits discarded.')
  }

  const handleDeleteCustomCourse = async () => {
    const isBundled = bundledCourses.some((course) => course.id === selectedCourseId)
    if (isBundled) {
      setMessage('Built-in courses cannot be deleted — use "Discard local edits" or "Remove from Hub".')
      return
    }

    if (isLive) {
      setMessage('Remove this course from the Hub first, then delete it.')
      return
    }

    if (
      !window.confirm(
        `Permanently delete "${outline?.title ?? selectedCourseId}" from this browser?\n\nThis removes the course draft only.`,
      )
    ) {
      return
    }

    deleteCustomCourse(selectedCourseId)
    const fallbackId = pickerCourseIds.find((id) => id !== selectedCourseId) ?? 'algebra-1'
    setSelectedCourseId(fallbackId)
    navigateToTarget(navigate, buildContentWorkspaceLink(CONTENT_WORKSPACE_SECTIONS.COURSES, fallbackId))
    setMessage('Course deleted from your drafts.')
  }

  const importTargetLabel = (() => {
    if (!importTarget || !outline) {
      return ''
    }
    const chapter = outline.chapters.find((ch) => ch.id === importTarget.chapterId)
    const subchapter = chapter?.subchapters.find((sc) => sc.id === importTarget.subchapterId)
    return [chapter?.title, subchapter?.title].filter(Boolean).join(' → ')
  })()

  if (loading) {
    return (
      <div className="page-container course-builder-page">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title">Course Editor</h1>
            <p className="page-subtitle">Build your course outline, import or edit lesson JSON, attach files and links, then publish.</p>
          </div>
          <AppNavLink to={backPath} className="text-sm font-medium text-indigo-600 no-underline hover:text-indigo-800">
            ← {role === ROLES.ADMIN ? 'Admin dashboard' : 'Teacher dashboard'}
          </AppNavLink>
        </div>

        <TeacherContentNav courseId={selectedCourseId} />
        <p className="mt-4 text-slate-600">Loading course…</p>
      </div>
    )
  }

  return (
    <div className="page-container course-builder-page">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,video/*,image/*,.doc,.docx,.ppt,.pptx"
        className="hidden"
        onChange={handleFileUpload}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Course Editor</h1>
          <p className="page-subtitle">
            Build your course outline, import or edit lesson JSON, attach files and links, then publish.
          </p>
        </div>
        <AppNavLink to={backPath} className="text-sm font-medium text-indigo-600 no-underline hover:text-indigo-800">
          ← {role === ROLES.ADMIN ? 'Admin dashboard' : 'Teacher dashboard'}
        </AppNavLink>
      </div>

      <TeacherContentNav courseId={selectedCourseId} />

      {message && (
        <p
          className={`course-builder-message mt-4 rounded-xl px-4 py-3 text-sm font-medium ${
            outline ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
          }`}
        >
          {message}
        </p>
      )}

      {!outline && !loading && pickerCourseIds.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="flex-1">
            Pick a course from the dropdown below or choose a different course you have access to.
          </p>
          <button type="button" className="btn-secondary !py-2 !text-sm" onClick={() => reloadOutline(selectedCourseId)}>
            Retry load
          </button>
        </div>
      )}

      {teacherAccess.suspended && (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Your teacher account is suspended. Contact the platform admin.
        </p>
      )}

      {!teacherAccess.isAdmin && !teacherAccess.legacy && allCourseIds.length === 0 && !teacherAccess.loading && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You do not have an editable course license yet. Ask your admin to grant access with Edit or
          Full level.
        </p>
      )}

      {selectedCourseId && !editAccess.allowed && !teacherAccess.isAdmin && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {editAccess.reason}
        </p>
      )}

      <section className="card-modern course-builder-settings mt-8">
        <h2 className="text-xl font-bold text-slate-900">Course settings</h2>
        <p className="mt-1 text-sm text-slate-600">
          Pick a course, edit catalog details, then build the outline below.
        </p>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="builder-course" className="block text-sm font-semibold text-slate-700">
              Select course
            </label>
            <select
              id="builder-course"
              value={selectedCourseId}
              onChange={(e) => {
                const nextCourseId = e.target.value
                setSelectedCourseId(nextCourseId)
                navigateToTarget(navigate, buildContentWorkspaceLink(CONTENT_WORKSPACE_SECTIONS.COURSES, nextCourseId))
              }}
              className="input-modern mt-1.5"
            >
              {pickerCourseIds.map((id) => {
                const title =
                  accessibleCourses.find((course) => course.id === id)?.title ??
                  bundledCourses.find((course) => course.id === id)?.title ??
                  id
                const flags = [
                  hasCustomCourse(id) ? 'edited' : null,
                  published.some((course) => course.id === id) ? 'live on Hub' : null,
                  bundledCourses.some((course) => course.id === id) ? 'built-in' : null,
                ].filter(Boolean)

                return (
                  <option key={id} value={id}>
                    {title} [{id}]{flags.length ? ` — ${flags.join(', ')}` : ''}
                  </option>
                )
              })}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setShowNewCourse((v) => !v)}
            disabled={!createAccess.allowed}
            className="btn-secondary disabled:opacity-50"
            title={createAccess.allowed ? undefined : createAccess.reason}
          >
            New course
          </button>
          {teacherAccess.isAdmin ? (
            <>
              <button type="button" onClick={handleExport} className="btn-secondary">
                Export JSON
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleExportToFolder}
                className="btn-secondary"
                title="Choose your project's public folder — writes courses/{course-id}/ and lessons/{course-id}/"
              >
                Export to folder…
              </button>
            </>
          ) : null}
          <button
            type="button"
            disabled={!outline}
            onClick={handlePreviewCourse}
            className="btn-secondary"
            title="Open the course player in a new tab with your latest saved edits"
          >
            Preview course
          </button>
          <button
            type="button"
            disabled={busy || !outline || !publishAccess.allowed}
            onClick={handlePublish}
            className="btn-primary disabled:opacity-50"
            title={publishAccess.allowed ? undefined : publishAccess.reason}
          >
            {busy ? 'Working…' : isLive ? 'Re-publish to Hub' : 'Publish to Hub'}
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            {selectedCourseTitle}{' '}
            <span className="font-mono text-xs font-normal text-slate-500">({selectedCourseId})</span>
          </p>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            <li>
              <strong>Hub status:</strong>{' '}
              {isLive
                ? 'Published — students see your version on the Courses page.'
                : 'Not on Hub — students only see this course if a built-in default exists.'}
            </li>
            {isBundledCourse && (
              <li>
                <strong>Built-in course:</strong> This ID ships with the app. You cannot delete it,
                but you can discard local edits or remove your published copy from the Hub.
              </li>
            )}
            {hasLocalDraft && (
              <li>
                <strong>Local edits:</strong> This browser is showing your draft. If Hub or the
                shipped outline has more modules than this draft (for example Statistics Chapters
                4–5), the editor rebuilds the outline from Hub/bundled automatically — lesson JSON
                bodies in this browser stay intact. Use <strong>Reload from Hub</strong> to replace
                the outline with the live Hub tree on demand. <strong>Reset to bundled default</strong>{' '}
                loads shipped files only. After a reset, click <strong>Publish to Hub</strong> so
                students see the cleaned outline.
              </li>
            )}
            <li>
              <strong>Draft storage:</strong>{' '}
              {(() => {
                const estimate = getDraftStorageEstimate()
                const sizeLabel =
                  estimate.mb >= 0.1
                    ? `${estimate.mb.toFixed(1)} MB`
                    : `${Math.max(1, Math.round(estimate.bytes / 1024))} KB`
                return `${sizeLabel} · ${estimate.courseCount} course(s) · ${estimate.moduleCount} lesson(s) in this browser`
              })()}
              . Drafts now use IndexedDB (larger than the old localStorage limit).
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            {isLive && (
              <button
                type="button"
                disabled={busy || !deleteAccess.allowed}
                onClick={handleUnpublish}
                className="rounded-xl border border-rose-300 bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-800 disabled:opacity-50"
                title={deleteAccess.allowed ? undefined : deleteAccess.reason}
              >
                Remove from Hub
              </button>
            )}
            {isBundledCourse && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    resetCourseToBundled(selectedCourseId)
                    await flushContentStore()
                    await reloadOutline(selectedCourseId, { source: 'bundled' })
                    setMessage(
                      `Loaded the full shipped ${selectedCourseTitle} outline from bundled course files. Lesson JSON bodies in this browser were kept. Click Publish to Hub only if you want students to match this outline.`,
                    )
                  } finally {
                    setBusy(false)
                  }
                }}
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50"
              >
                Reset to bundled default
              </button>
            )}
            {isLive && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    // Replace outline only — keep local module JSON bodies (do not wipe drafts).
                    await reloadOutline(selectedCourseId, { source: 'hub' })
                    setMessage(
                      'Loaded the live Hub outline into this browser draft (lesson JSON bodies kept).',
                    )
                  } catch (error) {
                    setMessage(error?.message || 'Could not reload from Hub.')
                  } finally {
                    setBusy(false)
                  }
                }}
                className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 disabled:opacity-50"
              >
                Reload from Hub
              </button>
            )}
            {hasLocalDraft && !isBundledCourse && (
              <button
                type="button"
                onClick={handleDiscardLocalEdits}
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900"
              >
                Discard local edits
              </button>
            )}
            {!isBundledCourse && (
              <button
                type="button"
                disabled={busy || isLive}
                onClick={handleDeleteCustomCourse}
                className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
                title={isLive ? 'Remove from Hub first' : 'Delete this draft course from this browser'}
              >
                Delete course draft
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const estimate = getDraftStorageEstimate()
                const confirmed = window.confirm(
                  `Clear ALL course drafts stored in this browser?\n\nThis removes ${estimate.courseCount} course(s) and ${estimate.moduleCount} lesson(s) from local draft storage only.\nPublished Hub courses are not deleted.\n\nExport first if you need a backup.`,
                )
                if (!confirmed) {
                  return
                }
                setBusy(true)
                try {
                  await clearAllDraftStorage()
                  await reloadOutline(selectedCourseId)
                  setMessage('Cleared local draft storage. You can import lessons again.')
                } catch (error) {
                  setMessage(error?.message || 'Could not clear draft storage.')
                } finally {
                  setBusy(false)
                }
              }}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
            >
              Free draft storage
            </button>
          </div>
          {!deleteAccess.allowed && isLive && (
            <p className="mt-3 text-xs text-slate-500">
              Hub removal requires a full license and “Delete / unpublish courses” permission from
              your admin.
            </p>
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

        {hasLocalDraft && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">Unpublished edits are saved only in this browser.</p>
            <p className="mt-1 text-amber-900">
              Clearing site data, switching devices, or using another browser will lose work that
              has not been exported or published. Use <strong>Export JSON</strong> as a backup, or{' '}
              <strong>Publish to Hub</strong> when students should see changes.
              {draftExportedAt && (
                <>
                  {' '}
                  Last export backup:{' '}
                  {new Date(draftExportedAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                  .
                </>
              )}
            </p>
          </div>
        )}
      </section>

      {outline && editAccess.allowed && (
        <CourseCatalogSettings
          outline={outline}
          onChange={(nextOutline) => {
            setOutline(nextOutline)
            persistOutline(nextOutline)
          }}
          onShuffleIcon={() => {
            const nextOutline = {
              ...outline,
              iconStyle: nextIconStyle(outline.iconStyle),
            }
            setOutline(nextOutline)
            persistOutline(nextOutline)
          }}
          onShuffleAccent={() => {
            const nextOutline = {
              ...outline,
              accentIndex: nextAccentIndex(outline.accentIndex),
            }
            setOutline(nextOutline)
            persistOutline(nextOutline)
          }}
        />
      )}

      {outline && editAccess.allowed && (
        <CourseEditorOutline
          courseId={selectedCourseId}
          outline={outline}
          busy={busy}
          onAddChapter={handleAddChapter}
          onAddSubchapter={handleAddSubchapter}
          onRemoveChapter={removeChapter}
          onRemoveSubchapter={removeSubchapter}
          onChapterTitleChange={handleChapterTitleChange}
          onSubchapterTitleChange={handleSubchapterTitleChange}
          onModuleTitleChange={handleModuleTitleChange}
          onModuleStandardsChange={handleModuleStandardsChange}
          onMaterialTitleChange={handleMaterialTitleChange}
          onMoveModule={moveModule}
          onRemoveModule={removeModule}
          onRemoveMaterial={removeMaterial}
          onOpenImport={openImport}
          onTriggerUpload={triggerUpload}
          onOpenLinkForm={openLinkForm}
          onOpenLinkGame={openLinkGame}
          onModuleSaved={handleModuleSaved}
          onAddChapterAdaptiveReview={handleAddChapterAdaptiveReview}
          onAddSectionAdaptiveReview={handleAddSectionAdaptiveReview}
          jsonImportTarget={jsonImportTarget}
          jsonImportTargetLabel={importTargetLabel}
          jsonImportErrors={importErrors}
          onCloseJsonImport={closeJsonImport}
          onJsonImport={handleImportModule}
          onJsonImportAndPreview={handleImportModuleAndPreview}
          jsonImportDisabled={!editAccess.allowed}
        />
      )}

      {modalImportTarget && (
        <ModuleImportModal
          targetLabel={importTargetLabel}
          importKind={modalImportTarget.templateType}
          importText={importText}
          importErrors={importErrors}
          onTextChange={(text) => {
            setImportText(text)
            setImportErrors([])
          }}
          onImport={handleImport}
          onImportModule={handleImportModule}
          onClose={() => setImportTarget(null)}
        />
      )}

      {gameLinkTarget && (
        <LinkGameModal
          courseId={selectedCourseId}
          outline={outline}
          chapterId={gameLinkTarget.chapterId}
          subchapterId={gameLinkTarget.subchapterId}
          onLink={handleLinkGame}
          onClose={() => setGameLinkTarget(null)}
        />
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
