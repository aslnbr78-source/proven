/**
 * Course outline helpers. Supports chapters → subchapters → modules.
 * Legacy outlines with modules directly on a chapter are normalized on read.
 */

function pad2(n) {
  return n.toString().padStart(2, '0')
}

function mergeLegacyModules(chapter, subchapters, legacyTitle = 'Chapter-level lessons') {
  const normalizedSubchapters = (subchapters ?? []).map(normalizeSubchapter)
  if (!chapter.modules?.length) {
    return normalizedSubchapters
  }

  const existingIds = new Set(normalizedSubchapters.map((subchapter) => subchapter.id))
  let legacyId = `${chapter.id}-legacy`
  let suffix = 1
  while (existingIds.has(legacyId)) {
    suffix += 1
    legacyId = `${chapter.id}-legacy-${suffix}`
  }

  return [
    {
      id: legacyId,
      title: legacyTitle,
      modules: chapter.modules,
      materials: [],
    },
    ...normalizedSubchapters,
  ]
}

export function getChapterSubchapters(chapter) {
  if (chapter.subchapters?.length) {
    return mergeLegacyModules(chapter, chapter.subchapters)
  }

  if (chapter.modules?.length) {
    return [
      {
        id: `${chapter.id}-sc01`,
        title: '1.1',
        modules: chapter.modules,
        materials: [],
      },
    ]
  }

  return []
}

function normalizeSubchapter(subchapter) {
  return {
    ...subchapter,
    modules: subchapter.modules ?? [],
    materials: subchapter.materials ?? [],
  }
}

export function normalizeChapter(chapter, chapterIndex) {
  const chapterNum = chapterIndex + 1
  const title =
    chapter.title?.match(/^Chapter\s+\d+/i) ? chapter.title : `Chapter ${chapterNum}`

  if (chapter.subchapters?.length) {
    const rest = { ...chapter }
    delete rest.modules
    return {
      ...rest,
      title,
      subchapters: mergeLegacyModules(chapter, chapter.subchapters),
    }
  }

  if (chapter.modules?.length) {
    const topic = chapter.title.replace(/^Chapter\s+\d+[:\s]*/i, '').trim()
    return {
      id: chapter.id,
      title,
      subchapters: [
        {
          id: `${chapter.id}-sc01`,
          title: topic ? `${chapterNum}.1 ${topic}` : `${chapterNum}.1`,
          modules: chapter.modules,
          materials: [],
        },
      ],
    }
  }

  return {
    id: chapter.id,
    title,
    subchapters: (chapter.subchapters ?? []).map(normalizeSubchapter),
  }
}

export function normalizeOutline(outline) {
  if (!outline?.chapters) {
    return outline
  }

  return {
    ...outline,
    chapters: outline.chapters.map((chapter, index) => normalizeChapter(chapter, index)),
  }
}

export function flattenModules(courseOutline) {
  const outline = normalizeOutline(courseOutline)
  if (!outline?.chapters) {
    return []
  }

  return outline.chapters.flatMap((chapter) =>
    getChapterSubchapters(chapter).flatMap((subchapter) =>
      (subchapter.modules ?? []).map((module) => ({
        ...module,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        subchapterId: subchapter.id,
        subchapterTitle: subchapter.title,
      })),
    ),
  )
}

export function getFirstModule(courseOutline) {
  return flattenModules(courseOutline)[0] ?? null
}

export function findModuleInOutline(courseOutline, moduleId) {
  return flattenModules(courseOutline).find((module) => module.id === moduleId) ?? null
}

export function findModuleLocation(courseOutline, moduleId) {
  const outline = normalizeOutline(courseOutline)

  for (const chapter of outline.chapters ?? []) {
    for (const subchapter of getChapterSubchapters(chapter)) {
      const module = subchapter.modules.find((item) => item.id === moduleId)
      if (module) {
        return { chapter, subchapter, module }
      }
    }
  }

  return null
}

export function flattenMaterials(courseOutline) {
  const outline = normalizeOutline(courseOutline)
  if (!outline?.chapters) {
    return []
  }

  return outline.chapters.flatMap((chapter) =>
    getChapterSubchapters(chapter).flatMap((subchapter) =>
      (subchapter.materials ?? []).map((material) => ({
        ...material,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        subchapterId: subchapter.id,
        subchapterTitle: subchapter.title,
      })),
    ),
  )
}

export function countModules(courseOutline) {
  return flattenModules(courseOutline).length
}

export function nextChapterId(chapters) {
  return `ch${pad2((chapters?.length ?? 0) + 1)}`
}

export function nextSubchapterId(chapter, chapterIndex) {
  const count = getChapterSubchapters(chapter).length + 1
  return {
    id: `${chapter.id}-sc${pad2(count)}`,
    title: `${chapterIndex + 1}.${count}`,
  }
}
