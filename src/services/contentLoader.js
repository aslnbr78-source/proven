import { getFunctions, httpsCallable } from 'firebase/functions'
import { getCustomModule, getCustomCourse, saveCustomOutline } from './contentStore'
import {
  getFirestoreCourse,
  getFirestoreModule,
  getPublishedCatalogCourses,
  isPublishedCourse,
  listPublishedFirestoreCourses,
} from './courseFirestore'
import { app } from './firebase'
import { courses as courseCatalog } from '../data/courses'
import {
  SAMPLE_COURSE_JSON,
  SAMPLE_GAME_BASE,
  SAMPLE_LESSON_BASES,
} from '../config/sampleModule'
import {
  countModules,
  flattenModules,
  findModuleInOutline,
  getFirstModule,
  healOutlineFromRicherSource,
  normalizeOutline,
} from '../utils/courseOutline'
import { isFullModuleContent } from '../utils/moduleContent'

export { flattenModules, findModuleInOutline, getFirstModule }

async function fetchOutlineViaCallable(courseId) {
  if (!app || !courseId) {
    return null
  }
  try {
    const callable = httpsCallable(getFunctions(app, 'us-central1'), 'getStudentCourseOutline')
    const result = await callable({ courseId })
    return result.data?.outline ?? null
  } catch {
    return null
  }
}

async function fetchModuleViaCallable(courseId, moduleId) {
  if (!app || !courseId || !moduleId) {
    return null
  }
  try {
    const callable = httpsCallable(getFunctions(app, 'us-central1'), 'getStudentCourseModule')
    const result = await callable({ courseId, moduleId })
    return result.data?.module ?? null
  } catch {
    return null
  }
}

async function loadBundledOutline(courseId, { sample = false } = {}) {
  const path = sample ? SAMPLE_COURSE_JSON : `/courses/${courseId}/course.json`
  const response = await fetch(path)
  if (!response.ok) {
    return null
  }
  return response.json()
}

async function loadBundledSampleModule(moduleId, { contentSource, includeDraft = false } = {}) {
  if (contentSource === 'game-catalog') {
    const { loadGameModuleAsync } = await import('../data/mathGames')
    return loadGameModuleAsync('precalculus', moduleId, { includeDraft })
  }

  for (const base of SAMPLE_LESSON_BASES) {
    try {
      const response = await fetch(`${base}/${moduleId}.json`)
      if (response.ok) {
        return response.json()
      }
    } catch {
      /* try next base */
    }
  }

  try {
    const response = await fetch(`${SAMPLE_GAME_BASE}/${moduleId}.json`)
    if (response.ok) {
      return response.json()
    }
  } catch {
    /* fall through */
  }

  try {
    const { loadGameModuleAsync } = await import('../data/mathGames')
    return await loadGameModuleAsync('precalculus', moduleId, { includeDraft })
  } catch {
    throw new Error('Module not found')
  }
}

async function loadFirestoreOutline(courseId, { requirePublished = true } = {}) {
  try {
    const firestoreCourse = await getFirestoreCourse(courseId)
    if (!firestoreCourse) {
      return null
    }
    if (requirePublished && !isPublishedCourse(firestoreCourse)) {
      return null
    }

    return {
      id: firestoreCourse.id,
      title: firestoreCourse.title,
      description: firestoreCourse.description,
      iconStyle: firestoreCourse.iconStyle,
      accentIndex: firestoreCourse.accentIndex,
      logoUrl: firestoreCourse.logoUrl,
      chapters: firestoreCourse.chapters,
    }
  } catch {
    return null
  }
}

export async function fetchCourseOutline(courseId) {
  const custom = getCustomCourse(courseId)
  if (custom?.outline) {
    return normalizeOutline(custom.outline)
  }

  const [bundledOutline, firestoreOutline] = await Promise.all([
    loadBundledOutline(courseId),
    loadFirestoreOutline(courseId, { requirePublished: true }),
  ])

  // Published Hub outline is authoritative. Do not refill deleted sections from
  // bundled course.json (that made thinner publishes look like the old course).
  let outline
  if (firestoreOutline && countModules(firestoreOutline) > 0) {
    outline = firestoreOutline
  } else if (bundledOutline && countModules(bundledOutline) > 0) {
    outline = bundledOutline
  } else {
    // Client rules can block Hub reads; callable uses Admin SDK for entitled users.
    outline = await fetchOutlineViaCallable(courseId)
  }

  if (!outline || countModules(outline) === 0) {
    outline = outline || firestoreOutline || bundledOutline
  }

  if (!outline) {
    throw new Error('Course not found')
  }

  return normalizeOutline(outline)
}

/**
 * Teacher/admin outline: prefer live Hub course (even if draft), not bundled JSON.
 * Module titles can still be stale on the outline — use resolveModuleTitlesFromHub.
 * Stale browser drafts missing Hub/bundled chapters are healed like Course Builder.
 */
export async function fetchStaffCourseOutline(courseId) {
  const custom = getCustomCourse(courseId)
  const hubOutline = await loadFirestoreOutline(courseId, { requirePublished: false })

  if (custom?.outline) {
    let outline = normalizeOutline(custom.outline)
    let bundledOutline = null
    try {
      const response = await fetch(`/courses/${courseId}/course.json`)
      if (response.ok) {
        bundledOutline = normalizeOutline(await response.json())
      }
    } catch {
      bundledOutline = null
    }
    const healFrom =
      hubOutline && countModules(hubOutline) > 0
        ? hubOutline
        : bundledOutline && countModules(bundledOutline) > 0
          ? bundledOutline
          : null
    if (healFrom) {
      const beforeCount = countModules(outline)
      const healed = healOutlineFromRicherSource(outline, healFrom)
      if (countModules(healed) > beforeCount) {
        outline = healed
        try {
          await saveCustomOutline(courseId, outline)
        } catch {
          /* read path still returns healed outline */
        }
      }
    }
    return outline
  }

  if (hubOutline && countModules(hubOutline) > 0) {
    return normalizeOutline(hubOutline)
  }

  return fetchCourseOutline(courseId)
}

/**
 * Prefer titles from the course outline (Course Builder rename).
 * Use Hub module documents only when the outline title is empty.
 */
export async function resolveModuleTitlesFromHub(courseId, modules) {
  if (!courseId || !modules?.length) {
    return modules ?? []
  }

  const resolved = await Promise.all(
    modules.map(async (module) => {
      const outlineTitle = String(module.title ?? '').trim()
      if (outlineTitle) {
        return { ...module, title: outlineTitle }
      }
      try {
        const hub = await getFirestoreModule(courseId, module.id)
        const hubTitle = String(hub?.title ?? '').trim()
        if (hubTitle) {
          return { ...module, title: hubTitle }
        }
      } catch {
        /* keep outline title */
      }
      return module
    }),
  )

  return resolved
}

export async function courseExists(courseId) {
  if (getCustomCourse(courseId)?.outline) {
    return true
  }

  try {
    await fetchCourseOutline(courseId)
    return true
  } catch {
    return false
  }
}

async function loadBundledLessonModule(courseId, moduleId) {
  try {
    const response = await fetch(`/lessons/${courseId}/${moduleId}.json`)
    if (!response.ok) {
      return null
    }
    const contentType = String(response.headers.get('content-type') ?? '')
    if (contentType.includes('text/html')) {
      return null
    }
    const payload = await response.json()
    return isFullModuleContent(payload) ? payload : null
  } catch {
    /* fall through */
  }
  return null
}

export async function fetchModuleContent(courseId, moduleId, options = {}) {
  const contentSource = options.contentSource
  const moduleType = options.moduleType
  const includeDraft = Boolean(options.includeDraft)
  const isSample = Boolean(options.isSample)

  if (isSample) {
    return loadBundledSampleModule(moduleId, { contentSource, includeDraft })
  }

  if (contentSource === 'game-catalog' || moduleType === 'math-game') {
    const { loadGameModuleAsync } = await import('../data/mathGames')
    return loadGameModuleAsync(courseId, moduleId, { includeDraft })
  }

  let thinStub = null

  try {
    const firestoreModule = await getFirestoreModule(courseId, moduleId)
    if (firestoreModule) {
      if (isFullModuleContent(firestoreModule)) {
        return firestoreModule
      }
      thinStub = firestoreModule
    }
  } catch {
    /* fall through */
  }

  const entitledModule = await fetchModuleViaCallable(courseId, moduleId)
  if (entitledModule) {
    if (isFullModuleContent(entitledModule)) {
      return entitledModule
    }
    thinStub = thinStub ?? entitledModule
  }

  const customModule = getCustomModule(courseId, moduleId)
  if (customModule) {
    if (isFullModuleContent(customModule)) {
      return customModule
    }
    thinStub = thinStub ?? customModule
  }

  const bundledLesson = await loadBundledLessonModule(courseId, moduleId)
  if (bundledLesson) {
    return bundledLesson
  }

  try {
    const { loadGameModuleAsync } = await import('../data/mathGames')
    return await loadGameModuleAsync(courseId, moduleId, { includeDraft })
  } catch {
    if (thinStub) {
      return thinStub
    }
    const error = new Error(`Module not found: ${courseId}/${moduleId}`)
    error.courseId = courseId
    error.moduleId = moduleId
    throw error
  }
}

export async function listAvailableCourses() {
  const checks = await Promise.all(
    courseCatalog.map(async (course) => {
      let mergedCourse = { ...course }
      try {
        const outline = await fetchCourseOutline(course.id)
        mergedCourse = {
          ...course,
          title: outline.title ?? course.title,
          description: outline.description ?? course.description ?? '',
          iconStyle: outline.iconStyle ?? course.iconStyle,
          accentIndex: outline.accentIndex ?? course.accentIndex,
          logoUrl: outline.logoUrl ?? course.logoUrl,
        }
      } catch {
        /* keep bundled metadata */
      }

      return {
        course: mergedCourse,
        available: await courseExists(course.id),
      }
    }),
  )

  const merged = new Map(
    checks.filter((item) => item.available).map((item) => [item.course.id, { ...item.course }]),
  )

  try {
    const [publishedFromQuery, publishedFromCatalog] = await Promise.all([
      listPublishedFirestoreCourses(),
      getPublishedCatalogCourses(),
    ])

    const publishedById = new Map()
    for (const course of [...publishedFromCatalog, ...publishedFromQuery]) {
      if (course?.id) {
        publishedById.set(course.id, course)
      }
    }

    for (const course of publishedById.values()) {
      // Catalog rows store lessonCount but not chapters. Prefer real outline counts,
      // then the denormalized catalog/course lessonCount so Hub courses don't show 0.
      const storedCount = Number(course.lessonCount) || 0
      let lessonCount = countModules(course)
      let description = course.description ?? ''
      let title = course.title ?? course.id
      let iconStyle = course.iconStyle
      let accentIndex = course.accentIndex
      let logoUrl = course.logoUrl ?? null

      if (lessonCount === 0) {
        try {
          const outline = await fetchCourseOutline(course.id)
          lessonCount = countModules(outline)
          if (!description && outline?.description) {
            description = outline.description
          }
          title = outline?.title ?? title
          iconStyle = outline?.iconStyle ?? iconStyle
          accentIndex = outline?.accentIndex ?? accentIndex
          logoUrl = outline?.logoUrl ?? logoUrl
        } catch {
          /* Still list published courses even with no loadable outline yet. */
        }
      }

      if (lessonCount === 0 && storedCount > 0) {
        lessonCount = storedCount
      }

      merged.set(course.id, {
        id: course.id,
        title,
        description,
        iconStyle,
        accentIndex,
        logoUrl,
        lessonCount,
        source: 'firestore',
      })
    }
  } catch {
    /* bundled catalog only */
  }

  return [...merged.values()]
}
