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
  if (store.courses[outline.id]) {
    throw new Error(`Course ID "${outline.id}" already exists.`)
  }

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

export async function loadOutline(courseId) {
  const custom = getCustomCourse(courseId)
  if (custom?.outline) {
    return normalizeOutline(custom.outline)
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
