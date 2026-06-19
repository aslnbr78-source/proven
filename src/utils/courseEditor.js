/**
 * Shared helpers for editing course outlines (chapters → subchapters → modules + materials).
 */

export const MODULE_KINDS = ['interactive-lesson', 'quiz', 'flashcard', 'final-test']

export const MATERIAL_KINDS = ['link', 'pdf', 'video', 'image', 'file']

export const MODULE_KIND_LABELS = {
  'interactive-lesson': 'Lesson',
  quiz: 'Quiz',
  flashcard: 'Flashcards',
  'final-test': 'Final Test',
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

export function generateMaterialId() {
  return `mat-${Date.now().toString(36)}`
}

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
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

const TEMPLATE_PATHS = {
  'interactive-lesson': '/templates/interactive-lesson.template.json',
  'fill-blank': '/templates/interactive-lesson-fill-blank.template.json',
  quiz: '/templates/quiz.template.json',
  flashcard: '/templates/flashcard.template.json',
  'final-test': '/templates/final-test.template.json',
}

export async function fetchModuleTemplate(type) {
  const path = TEMPLATE_PATHS[type]
  if (!path) {
    return ''
  }
  const response = await fetch(path)
  return response.text()
}
