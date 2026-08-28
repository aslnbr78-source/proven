/**
 * Course outline helpers. Supports chapters → subchapters → modules.
 * Legacy outlines with modules directly on a chapter are normalized on read.
 */

function pad2(n) {
  return n.toString().padStart(2, '0')
}

export function getChapterSubchapters(chapter) {
  if (chapter.subchapters?.length) {
    return chapter.subchapters
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
      subchapters: chapter.subchapters.map(normalizeSubchapter),
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

/** Ensures at least one chapter and one section per chapter for the course editor. */
export function ensureEditorScaffold(outline) {
  if (!outline) {
    return { outline, changed: false }
  }

  let changed = false
  let next = { ...outline, chapters: [...(outline.chapters ?? [])] }

  if (next.chapters.length === 0) {
    next.chapters = [
      {
        id: 'ch01',
        title: 'Chapter 1',
        subchapters: [{ id: 'ch01-sc01', title: '1.1', modules: [], materials: [] }],
      },
    ]
    changed = true
  } else {
    next.chapters = next.chapters.map((chapter, chapterIndex) => {
      const subchapters = chapter.subchapters ?? []
      if (subchapters.length > 0) {
        return chapter
      }
      changed = true
      const chapterNum = chapterIndex + 1
      return {
        ...chapter,
        subchapters: [
          {
            id: `${chapter.id}-sc01`,
            title: `${chapterNum}.1`,
            modules: [],
            materials: [],
          },
        ],
      }
    })
  }

  return { outline: normalizeOutline(next), changed }
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

/** Linear student path: lessons, quizzes, flashcards, etc. — not subchapter materials. */
export const NAVIGABLE_MODULE_TYPES = new Set([
  'interactive-lesson',
  'quiz',
  'flashcard',
  'adaptive-practice',
  'adaptive-mastery',
  'final-test',
  'math-game',
])

/** Download/link rows that may appear in modules; kept in the resources panel only. */
export const MATERIAL_MODULE_TYPES = new Set(['link', 'pdf', 'video', 'image', 'file'])

export function isNavigableModule(module) {
  if (!module?.type) {
    return true
  }
  if (MATERIAL_MODULE_TYPES.has(module.type)) {
    return false
  }
  return NAVIGABLE_MODULE_TYPES.has(module.type)
}

export function flattenNavigableModules(courseOutline) {
  return flattenModules(courseOutline).filter(isNavigableModule)
}

export function getFirstModule(courseOutline) {
  return flattenModules(courseOutline)[0] ?? null
}

export function findModuleInOutline(courseOutline, moduleId) {
  return flattenModules(courseOutline).find((module) => module.id === moduleId) ?? null
}

export function getAdjacentModules(courseOutline, moduleId) {
  const modules = flattenNavigableModules(courseOutline)
  const index = modules.findIndex((module) => module.id === moduleId)
  if (index < 0) {
    return { prev: null, next: null, index: 0, total: modules.length }
  }
  return {
    prev: index > 0 ? modules[index - 1] : null,
    next: index < modules.length - 1 ? modules[index + 1] : null,
    index,
    total: modules.length,
  }
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

export function findSubchapterLocation(courseOutline, subchapterId) {
  const outline = normalizeOutline(courseOutline)

  for (const chapter of outline.chapters ?? []) {
    for (const subchapter of getChapterSubchapters(chapter)) {
      if (subchapter.id === subchapterId) {
        return {
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          subchapterId: subchapter.id,
          subchapterTitle: subchapter.title,
        }
      }
    }
  }

  return null
}

/** Maps outline materials to chapter/subchapter by Firestore asset id or URL. */
export function buildAssetPlacementMaps(courseOutline) {
  const byAssetId = new Map()
  const byUrl = new Map()

  for (const material of flattenMaterials(courseOutline)) {
    const placement = {
      chapterId: material.chapterId,
      chapterTitle: material.chapterTitle,
      subchapterId: material.subchapterId,
      subchapterTitle: material.subchapterTitle,
    }

    if (material.assetId) {
      byAssetId.set(material.assetId, placement)
    }
    if (material.url) {
      byUrl.set(material.url, placement)
    }
  }

  return { byAssetId, byUrl }
}

export function resolveAssetPlacement(asset, placementMaps, courseOutline) {
  if (!asset) {
    return null
  }

  const { byAssetId, byUrl } = placementMaps ?? { byAssetId: new Map(), byUrl: new Map() }

  if (asset.id && byAssetId.has(asset.id)) {
    return byAssetId.get(asset.id)
  }

  if (asset.subchapterId && courseOutline) {
    const fromSubchapter = findSubchapterLocation(courseOutline, asset.subchapterId)
    if (fromSubchapter) {
      return fromSubchapter
    }
  }

  if (asset.url && byUrl.has(asset.url)) {
    return byUrl.get(asset.url)
  }

  return null
}

export function countModules(courseOutline) {
  return flattenModules(courseOutline).length
}

/**
 * Append whole chapters from `source` that are missing in `draft`, preserving draft
 * chapter contents and draft-only chapters. Used to heal a stale browser draft that
 * predates Hub chapters (e.g. Statistics Ch 4–5) without wiping local module bodies.
 *
 * Note: if the draft already has the same chapter ids as empty/thin stubs, this is a
 * no-op — use healOutlineFromRicherSource instead.
 */
export function mergeMissingChaptersFromSource(draftOutline, sourceOutline) {
  if (!draftOutline?.chapters || !sourceOutline?.chapters?.length) {
    return draftOutline
  }

  const draft = normalizeOutline(JSON.parse(JSON.stringify(draftOutline)))
  const source = normalizeOutline(sourceOutline)
  const draftById = new Map(
    (draft.chapters ?? []).filter((chapter) => chapter?.id).map((chapter) => [chapter.id, chapter]),
  )
  const sourceIds = new Set(
    (source.chapters ?? []).filter((chapter) => chapter?.id).map((chapter) => chapter.id),
  )
  const missingIds = [...sourceIds].filter((id) => !draftById.has(id))
  if (missingIds.length === 0) {
    return draft
  }

  const merged = []
  for (const srcChapter of source.chapters) {
    if (!srcChapter?.id) {
      continue
    }
    if (draftById.has(srcChapter.id)) {
      merged.push(draftById.get(srcChapter.id))
    } else {
      merged.push(JSON.parse(JSON.stringify(srcChapter)))
    }
  }
  for (const chapter of draft.chapters) {
    if (chapter?.id && !sourceIds.has(chapter.id)) {
      merged.push(chapter)
    }
  }

  return normalizeOutline({ ...draft, chapters: merged })
}

/**
 * Fill chapter stubs that have no local modules from a richer source. This keeps
 * local deletions/renames in populated chapters intact instead of replacing the
 * whole outline when Hub/bundled happens to have a higher module count.
 */
export function healOutlineFromRicherSource(draftOutline, sourceOutline) {
  if (!sourceOutline?.chapters?.length) {
    return draftOutline
  }
  if (!draftOutline?.chapters?.length) {
    return normalizeOutline(JSON.parse(JSON.stringify(sourceOutline)))
  }

  const source = normalizeOutline(sourceOutline)
  const draft = normalizeOutline(JSON.parse(JSON.stringify(draftOutline)))
  const sourceById = new Map(
    (source.chapters ?? []).filter((chapter) => chapter?.id).map((chapter) => [chapter.id, chapter]),
  )
  let changed = false

  const chapters = (draft.chapters ?? []).map((chapter) => {
    const sourceChapter = sourceById.get(chapter?.id)
    if (!sourceChapter) {
      return chapter
    }

    const hasLocalModules = countModules({ chapters: [chapter] }) > 0
    const sourceHasModules = countModules({ chapters: [sourceChapter] }) > 0
    if (hasLocalModules || !sourceHasModules) {
      return chapter
    }

    changed = true
    return JSON.parse(JSON.stringify(sourceChapter))
  })

  if (changed) {
    return normalizeOutline({ ...draft, chapters })
  }

  return draft
}

/**
 * Add subchapters/modules from bundled repo files that are not yet in the live outline.
 * Firestore stays authoritative for existing entries; bundled fills gaps after a deploy.
 */
export function supplementOutlineFromBundled(liveOutline, bundledOutline) {
  if (!liveOutline?.chapters?.length || !bundledOutline?.chapters?.length) {
    return liveOutline
  }

  const live = normalizeOutline(JSON.parse(JSON.stringify(liveOutline)))
  const bundled = normalizeOutline(bundledOutline)
  const liveModuleIds = new Set(flattenModules(live).map((module) => module.id))

  const missingModules = flattenModules(bundled).filter((module) => !liveModuleIds.has(module.id))
  if (missingModules.length === 0) {
    return live
  }

  for (const flat of missingModules) {
    const moduleRef = {
      id: flat.id,
      type: flat.type,
      title: flat.title,
      ...(flat.standards?.length ? { standards: flat.standards } : {}),
    }

    let chapter = live.chapters.find((item) => item.id === flat.chapterId)
    if (!chapter) {
      const bundledChapter = bundled.chapters.find((item) => item.id === flat.chapterId)
      if (!bundledChapter) {
        continue
      }
      live.chapters.push(JSON.parse(JSON.stringify(bundledChapter)))
      liveModuleIds.add(flat.id)
      continue
    }

    if (!chapter.subchapters) {
      chapter.subchapters = []
    }

    let subchapter = chapter.subchapters.find((item) => item.id === flat.subchapterId)
    if (!subchapter) {
      const bundledChapter = bundled.chapters.find((item) => item.id === flat.chapterId)
      const bundledSubchapter = getChapterSubchapters(bundledChapter).find(
        (item) => item.id === flat.subchapterId,
      )
      if (!bundledSubchapter) {
        continue
      }

      chapter.subchapters.push({
        id: bundledSubchapter.id,
        title: bundledSubchapter.title,
        modules: [moduleRef],
        materials: bundledSubchapter.materials ?? [],
      })
    } else {
      subchapter.modules.push(moduleRef)
    }

    liveModuleIds.add(flat.id)
  }

  for (const chapter of live.chapters) {
    const bundledChapter = bundled.chapters.find((item) => item.id === chapter.id)
    if (!bundledChapter) {
      continue
    }

    const order = getChapterSubchapters(bundledChapter).map((item) => item.id)
    chapter.subchapters.sort((a, b) => {
      const aIndex = order.indexOf(a.id)
      const bIndex = order.indexOf(b.id)
      if (aIndex === -1 && bIndex === -1) {
        return 0
      }
      if (aIndex === -1) {
        return 1
      }
      if (bIndex === -1) {
        return -1
      }
      return aIndex - bIndex
    })
  }

  return normalizeOutline(live)
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
