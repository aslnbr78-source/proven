import { doc, getDoc } from 'firebase/firestore'
import { db } from './firebase'
import { normalizeOutline } from '../utils/courseOutline'

const STORAGE_KEY = 'provenmath-custom-content'

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : { courses: {} }
  } catch {
    return { courses: {} }
  }
}

function writeStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function getCustomCourseIds() {
  return Object.keys(readStore().courses)
}

export function getCustomCourse(courseId) {
  return readStore().courses[courseId] ?? null
}

export function saveCustomOutline(courseId, outline) {
  const store = readStore()
  store.courses[courseId] = {
    outline: normalizeOutline(outline),
    modules: store.courses[courseId]?.modules ?? {},
  }
  writeStore(store)
}

export function saveCustomModule(courseId, moduleId, moduleData) {
  const store = readStore()
  if (!store.courses[courseId]) {
    store.courses[courseId] = { outline: null, modules: {} }
  }
  store.courses[courseId].modules[moduleId] = moduleData
  writeStore(store)
}

export function deleteCustomModule(courseId, moduleId) {
  const store = readStore()
  if (!store.courses[courseId]) {
    return
  }
  delete store.courses[courseId].modules[moduleId]
  writeStore(store)
}

export function createCustomCourse(outline) {
  const store = readStore()
  store.courses[outline.id] = {
    outline: normalizeOutline(outline),
    modules: {},
  }
  writeStore(store)
}

export function deleteCustomCourse(courseId) {
  const store = readStore()
  delete store.courses[courseId]
  writeStore(store)
}

export function resetCourseToBundled(courseId) {
  const store = readStore()
  delete store.courses[courseId]
  writeStore(store)
}

export function hasCustomCourse(courseId) {
  return Boolean(readStore().courses[courseId]?.outline)
}

export function getCustomModule(courseId, moduleId) {
  return readStore().courses[courseId]?.modules?.[moduleId] ?? null
}

export function exportCoursePackage(courseId) {
  const custom = getCustomCourse(courseId)
  if (!custom?.outline) {
    return null
  }
  return {
    courseJson: custom.outline,
    modules: custom.modules,
  }
}

async function loadPublishedFirestoreOutline(courseId) {
  if (!db || !courseId) {
    return null
  }

  try {
    const snap = await getDoc(doc(db, 'courses', courseId))
    if (!snap.exists()) {
      return null
    }

    const course = snap.data()
    if (!course.published) {
      return null
    }

    return normalizeOutline({
      id: snap.id,
      title: course.title,
      description: course.description ?? '',
      chapters: course.chapters ?? [],
    })
  } catch {
    return null
  }
}

export async function loadOutline(courseId) {
  const custom = getCustomCourse(courseId)
  if (custom?.outline) {
    return normalizeOutline(custom.outline)
  }

  const firestoreOutline = await loadPublishedFirestoreOutline(courseId)
  if (firestoreOutline) {
    return firestoreOutline
  }

  const response = await fetch(`/courses/${courseId}/course.json`)
  if (!response.ok) {
    throw new Error('Course not found')
  }
  return normalizeOutline(await response.json())
}

export async function loadModule(courseId, moduleId) {
  const customModule = getCustomModule(courseId, moduleId)
  if (customModule) {
    return customModule
  }

  const response = await fetch(`/lessons/${courseId}/${moduleId}.json`)
  if (!response.ok) {
    throw new Error('Module not found')
  }
  return response.json()
}
