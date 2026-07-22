import { getFirestoreCourse, getFirestoreModule, listFirestoreCourses } from './courseFirestore'
import { courses as courseCatalog } from '../data/courses'
import {
  countModules,
  flattenModules,
  findModuleInOutline,
  getFirstModule,
  normalizeOutline,
} from '../utils/courseOutline'

export { flattenModules, findModuleInOutline, getFirstModule }

async function loadBundledOutline(courseId) {
  const response = await fetch(`/courses/${courseId}/course.json`)
  if (!response.ok) {
    return null
  }
  return response.json()
}

async function loadFirestoreOutline(courseId) {
  try {
    const firestoreCourse = await getFirestoreCourse(courseId)
    if (!firestoreCourse?.published) {
      return null
    }

    return {
      id: firestoreCourse.id,
      title: firestoreCourse.title,
      description: firestoreCourse.description,
      chapters: firestoreCourse.chapters,
    }
  } catch {
    return null
  }
}

export async function fetchCourseOutline(courseId) {
  const [bundledOutline, firestoreOutline] = await Promise.all([
    loadBundledOutline(courseId),
    loadFirestoreOutline(courseId),
  ])

  let outline = firestoreOutline ?? bundledOutline

  if (
    firestoreOutline &&
    bundledOutline &&
    countModules(firestoreOutline) === 0 &&
    countModules(bundledOutline) > 0
  ) {
    outline = bundledOutline
  }

  if (!outline) {
    throw new Error('Course not found')
  }

  return normalizeOutline(outline)
}

export async function courseExists(courseId) {
  try {
    await fetchCourseOutline(courseId)
    return true
  } catch {
    return false
  }
}

export async function fetchModuleContent(courseId, moduleId) {
  try {
    const firestoreModule = await getFirestoreModule(courseId, moduleId)
    if (firestoreModule) {
      return firestoreModule
    }
  } catch {
    /* fall through to bundled JSON */
  }

  const response = await fetch(`/lessons/${courseId}/${moduleId}.json`)
  if (!response.ok) {
    throw new Error('Module not found')
  }
  return response.json()
}

export async function listAvailableCourses() {
  const checks = await Promise.all(
    courseCatalog.map(async (course) => ({
      course,
      available: await courseExists(course.id),
    })),
  )

  const merged = new Map(
    checks.filter((item) => item.available).map((item) => [item.course.id, { ...item.course }]),
  )

  try {
    const firestoreCourses = await listFirestoreCourses()
    const published = firestoreCourses.filter((course) => course.published)

    for (const course of published) {
      let lessonCount = countModules(course)
      if (lessonCount === 0) {
        try {
          lessonCount = countModules(await fetchCourseOutline(course.id))
        } catch {
          continue
        }
      }

      merged.set(course.id, {
        id: course.id,
        title: course.title,
        description: course.description ?? '',
        lessonCount,
        source: 'firestore',
      })
    }
  } catch {
    /* bundled catalog only */
  }

  return [...merged.values()]
}
