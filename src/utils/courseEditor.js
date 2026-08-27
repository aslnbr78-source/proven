/**
 * Shared helpers for editing course outlines (chapters → subchapters → modules + materials).
 */

import { flattenModules } from './courseOutline'
import { parseNavTo } from './navLinks'

export const MODULE_KINDS = [
  'interactive-lesson',
  'quiz',
  'flashcard',
  'final-test',
  'adaptive-practice',
  'adaptive-mastery',
  'math-game',
]

export const MATERIAL_KINDS = ['link', 'pdf', 'video', 'image', 'file']

export const MODULE_KIND_LABELS = {
  'interactive-lesson': 'Lesson',
  quiz: 'Quiz',
  flashcard: 'Flashcards',
  'final-test': 'Final Test',
  'adaptive-practice': 'AI Practice',
  'adaptive-mastery': 'Mastery Check',
  'math-game': 'Math Game',
}

export const MATERIAL_KIND_LABELS = {
  link: 'Link',
  pdf: 'PDF',
  video: 'Video',
  image: 'Image',
  file: 'File',
}

export const MODULE_KIND_ICONS = {
  'interactive-lesson': '📘',
  quiz: '📝',
  flashcard: '🃏',
  'final-test': '🔒',
  'adaptive-practice': '🤖',
  'adaptive-mastery': '🎯',
  'math-game': '🎮',
}

export const MATERIAL_KIND_ICONS = {
  link: '🔗',
  pdf: '📄',
  video: '🎬',
  image: '🖼️',
  file: '📎',
}

export function mapSubchapter(chapters, chapterId, subchapterId, updater) {
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

export function appendMaterialToSubchapter(outline, chapterId, subchapterId, material) {
  return {
    ...outline,
    chapters: mapSubchapter(outline.chapters, chapterId, subchapterId, (subchapter) => ({
      ...subchapter,
      materials: [...(subchapter.materials ?? []), material],
    })),
  }
}

export function removeMaterialFromSubchapter(outline, chapterId, subchapterId, predicate) {
  return {
    ...outline,
    chapters: mapSubchapter(outline.chapters, chapterId, subchapterId, (subchapter) => ({
      ...subchapter,
      materials: (subchapter.materials ?? []).filter((item) => !predicate(item)),
    })),
  }
}

export function generateMaterialId() {
  return `mat-${Date.now().toString(36)}`
}

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function buildExportFilename(courseId, moduleId = null) {
  const safeCourseId = slugify(courseId) || 'course'
  if (moduleId) {
    return `${safeCourseId}-${moduleId}.json`
  }
  return `${safeCourseId}-course.json`
}

/**
 * Build { id, title } rows for export filenames.
 * Title source of truth = outline menu `.title` only (never embedded JSON `title`).
 * Orphan module bodies not in the outline fall back to moduleId (not payload.title).
 */
export function modulesForMenuExportFilenames(courseJson, modulesById = {}) {
  const outlineModules = flattenModules(courseJson ?? {}).map((module) => ({
    id: module.id,
    title: module.title,
  }))
  const knownIds = new Set(outlineModules.map((module) => module.id))
  for (const moduleId of Object.keys(modulesById ?? {})) {
    if (!knownIds.has(moduleId)) {
      outlineModules.push({ id: moduleId, title: moduleId })
    }
  }
  return outlineModules
}

/** Download filename from the menu title (e.g. "Ch 4.1 — Sampling Methods" → statistics-ch-4-1-sampling-methods.json). */
export function buildMenuExportFilename(courseId, menuTitle, { fallbackId = null, suffix = '' } = {}) {
  const safeCourseId = slugify(courseId) || 'course'
  const label = slugify(String(menuTitle ?? '').trim()) || fallbackId || 'module'
  return `${safeCourseId}-${label}${suffix}.json`
}

/**
 * Unique menu-title filenames for a batch of modules (same rule as browser downloads).
 * @returns {Map<string, string>} moduleId → filename
 */
export function allocateMenuExportFilenames(courseId, modules) {
  const used = new Set()
  const filenames = new Map()

  for (const module of modules) {
    const moduleId = module?.id
    if (!moduleId) {
      continue
    }

    let filename = buildMenuExportFilename(courseId, module.title, { fallbackId: moduleId })
    if (used.has(filename)) {
      filename = buildMenuExportFilename(courseId, module.title, {
        fallbackId: moduleId,
        suffix: `-${slugify(moduleId) || 'dup'}`,
      })
    }
    if (used.has(filename)) {
      filename = buildMenuExportFilename(courseId, null, { fallbackId: moduleId })
    }

    used.add(filename)
    filenames.set(moduleId, filename)
  }

  return filenames
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/** Download multiple JSON files with course-prefixed names (browser may still use Downloads folder). */
export async function downloadJsonBatch(files) {
  for (const { filename, data } of files) {
    downloadJson(filename, data)
    await sleep(180)
  }
}

export function isFolderExportSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export async function writeJsonToDirectory(directoryHandle, filename, data) {
  const fileHandle = await directoryHandle.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(JSON.stringify(data, null, 2))
  await writable.close()
}

/**
 * Lets the user pick a folder (choose the project's `public` folder) and writes:
 *   courses/{courseId}/course.json
 *   lessons/{courseId}/{menu-title}.json   (same naming as browser Export JSON)
 *   lessons/{courseId}/{moduleId}.json     (hosting alias for fetchModuleContent)
 */
export async function exportCoursePackageToFolder(courseId, exported) {
  const root = await window.showDirectoryPicker({ mode: 'readwrite' })

  const coursesRoot = await root.getDirectoryHandle('courses', { create: true })
  const courseOutlineDir = await coursesRoot.getDirectoryHandle(courseId, { create: true })
  await writeJsonToDirectory(courseOutlineDir, 'course.json', exported.courseJson)

  const lessonsRoot = await root.getDirectoryHandle('lessons', { create: true })
  const lessonDir = await lessonsRoot.getDirectoryHandle(courseId, { create: true })

  const outlineModules = modulesForMenuExportFilenames(
    exported.courseJson,
    exported.modules,
  )
  const filenames = allocateMenuExportFilenames(courseId, outlineModules)

  await Promise.all(
    Object.entries(exported.modules ?? {}).map(async ([moduleId, data]) => {
      const primary =
        filenames.get(moduleId) ??
        buildMenuExportFilename(courseId, null, { fallbackId: moduleId })
      const hosting = `${moduleId}.json`
      await writeJsonToDirectory(lessonDir, primary, data)
      if (primary !== hosting) {
        await writeJsonToDirectory(lessonDir, hosting, data)
      }
    }),
  )

  return {
    coursePath: `courses/${courseId}/course.json`,
    lessonCount: Object.keys(exported.modules ?? {}).length,
  }
}

const TEMPLATE_PATHS = {
  'interactive-lesson': '/templates/interactive-lesson.template.json',
  'fill-blank': '/templates/interactive-lesson-fill-blank.template.json',
  quiz: '/templates/quiz.template.json',
  flashcard: '/templates/flashcard.template.json',
  'final-test': '/templates/final-test.template.json',
  'adaptive-practice': '/templates/adaptive-practice.template.json',
  'adaptive-mastery': '/templates/adaptive-mastery.template.json',
  'math-game': '/templates/math-game.template.json',
}

export async function fetchModuleTemplate(type) {
  const path = TEMPLATE_PATHS[type]
  if (!path) {
    return ''
  }
  const response = await fetch(path)
  return response.text()
}

export const EDITOR_PREVIEW_FROM = 'editor'

export function isEditorPreviewSearch(search = '') {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return params.get('from') === EDITOR_PREVIEW_FROM
}

export function courseEditorPath(courseId) {
  return `/teacher/courses/${encodeURIComponent(courseId)}`
}

export function coursePreviewPath(courseId) {
  return `/courses/${encodeURIComponent(courseId)}?from=${EDITOR_PREVIEW_FROM}`
}

export function courseModulePreviewPath(courseId, moduleId) {
  return `/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}?from=${EDITOR_PREVIEW_FROM}`
}

export function withEditorPreviewQuery(path) {
  if (isEditorPreviewSearch(parseNavTo(path).search)) {
    return parseNavTo(path).href
  }
  const { pathname, search, hash } = parseNavTo(path)
  const nextSearch = search ? `${search}&from=${EDITOR_PREVIEW_FROM}` : `?from=${EDITOR_PREVIEW_FROM}`
  return `${pathname}${nextSearch}${hash}`
}
