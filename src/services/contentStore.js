import {
  countModules,
  mergeMissingChaptersFromSource,
  normalizeOutline,
} from '../utils/courseOutline'
import { getFirestoreCourse } from './courseFirestore'

const LEGACY_STORAGE_KEY = 'provenmath-custom-content'
const EXPORT_META_KEY = 'provenmath-draft-export-meta'
const IDB_NAME = 'provenmath-content'
const IDB_VERSION = 1
const IDB_STORE = 'kv'
const IDB_CONTENT_KEY = 'custom-content'

/** In-memory source of truth after hydrate. Persisted to IndexedDB (not localStorage). */
let memoryStore = { courses: {} }
let hydratePromise = null
let writeChain = Promise.resolve()
let lastPersistError = null

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
  })
}

function idbGet(key) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly')
        const request = tx.objectStore(IDB_STORE).get(key)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

function idbSet(key, value) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite')
        const request = tx.objectStore(IDB_STORE).put(value, key)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      }),
  )
}

function idbDelete(key) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite')
        const request = tx.objectStore(IDB_STORE).delete(key)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      }),
  )
}

function readLegacyLocalStore() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function normalizeStoreShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { courses: {} }
  }
  if (!value.courses || typeof value.courses !== 'object') {
    return { courses: {} }
  }
  return value
}

async function hydrateFromDisk() {
  let fromIdb = null
  try {
    fromIdb = await idbGet(IDB_CONTENT_KEY)
  } catch {
    fromIdb = null
  }

  const legacy = readLegacyLocalStore()

  if (fromIdb) {
    memoryStore = normalizeStoreShape(fromIdb)
  } else if (legacy) {
    memoryStore = normalizeStoreShape(legacy)
    try {
      await idbSet(IDB_CONTENT_KEY, memoryStore)
    } catch {
      // Keep memory even if first IDB write fails; caller can retry.
    }
  } else {
    memoryStore = { courses: {} }
  }

  // Free the old ~5MB localStorage quota once migrated.
  if (legacy) {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // ignore
    }
  }
}

/** Call once before the app reads/writes drafts (see main.jsx). */
export function ensureContentStoreReady() {
  if (!hydratePromise) {
    hydratePromise = hydrateFromDisk().catch((error) => {
      console.error('Draft storage failed to load', error)
      memoryStore = normalizeStoreShape(readLegacyLocalStore()) || { courses: {} }
    })
  }
  return hydratePromise
}

function readStore() {
  return memoryStore
}

function persistStore(store) {
  memoryStore = store
  lastPersistError = null
  const snapshot = structuredClone(store)
  writeChain = writeChain
    .catch(() => {})
    .then(async () => {
      await idbSet(IDB_CONTENT_KEY, snapshot)
    })
    .catch((error) => {
      lastPersistError = error
      throw error
    })
  return writeChain
}

/** Wait for queued IndexedDB writes to finish (or throw). */
export async function flushContentStore() {
  await ensureContentStoreReady()
  await writeChain
  if (lastPersistError) {
    const error = lastPersistError
    lastPersistError = null
    throw error
  }
}

export function getDraftStorageEstimate() {
  const json = JSON.stringify(readStore())
  const bytes = new Blob([json]).size
  const courseIds = Object.keys(readStore().courses ?? {})
  let moduleCount = 0
  for (const course of Object.values(readStore().courses ?? {})) {
    moduleCount += Object.keys(course?.modules ?? {}).length
  }
  return {
    bytes,
    mb: bytes / (1024 * 1024),
    courseCount: courseIds.length,
    moduleCount,
    courseIds,
  }
}

/** Removes every local course draft from this browser (IndexedDB + legacy key). */
export async function clearAllDraftStorage() {
  await ensureContentStoreReady()
  memoryStore = { courses: {} }
  lastPersistError = null
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // ignore
  }
  try {
    await idbDelete(IDB_CONTENT_KEY)
  } catch {
    await idbSet(IDB_CONTENT_KEY, memoryStore)
  }
  writeChain = Promise.resolve()
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
    banks: store.courses[courseId]?.banks ?? {},
  }
  return persistStore(store)
}

export function saveCustomModule(courseId, moduleId, moduleData) {
  const store = readStore()
  if (!store.courses[courseId]) {
    store.courses[courseId] = { outline: null, modules: {}, banks: {} }
  }
  store.courses[courseId].modules[moduleId] = moduleData
  return persistStore(store)
}

/** Update outline + module in one write (used by import). */
export function saveCustomModuleAndOutline(courseId, moduleId, moduleData, outline) {
  const store = readStore()
  if (!store.courses[courseId]) {
    store.courses[courseId] = { outline: null, modules: {}, banks: {} }
  }
  store.courses[courseId].modules[moduleId] = moduleData
  store.courses[courseId].outline = normalizeOutline(outline)
  if (!store.courses[courseId].banks) {
    store.courses[courseId].banks = {}
  }
  return persistStore(store)
}

export function saveCustomBank(courseId, bankId, bankData) {
  const store = readStore()
  if (!store.courses[courseId]) {
    store.courses[courseId] = { outline: null, modules: {}, banks: {} }
  }
  if (!store.courses[courseId].banks) {
    store.courses[courseId].banks = {}
  }
  store.courses[courseId].banks[bankId] = bankData
  return persistStore(store)
}

export function getCustomBank(courseId, bankId) {
  return readStore().courses[courseId]?.banks?.[bankId] ?? null
}

export function listCustomBankIds(courseId) {
  return Object.keys(readStore().courses[courseId]?.banks ?? {})
}

export function deleteCustomModule(courseId, moduleId) {
  const store = readStore()
  if (!store.courses[courseId]) {
    return persistStore(store)
  }
  delete store.courses[courseId].modules[moduleId]
  return persistStore(store)
}

export function createCustomCourse(outline) {
  const store = readStore()
  store.courses[outline.id] = {
    outline: normalizeOutline(outline),
    modules: {},
    banks: {},
  }
  return persistStore(store)
}

export function deleteCustomCourse(courseId) {
  const store = readStore()
  delete store.courses[courseId]
  return persistStore(store)
}

export function resetCourseToBundled(courseId) {
  const store = readStore()
  delete store.courses[courseId]
  return persistStore(store)
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

function isOutlinePayload(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function isUsableCustomOutline(outline) {
  if (!isOutlinePayload(outline)) {
    return false
  }
  if (outline.chapters != null && !Array.isArray(outline.chapters)) {
    return false
  }
  return true
}

async function fetchBundledOutline(courseId) {
  const response = await fetch(`/courses/${courseId}/course.json`)
  if (!response.ok) {
    return null
  }

  const text = (await response.text()).trim()
  if (!text.startsWith('{')) {
    return null
  }

  try {
    const payload = JSON.parse(text)
    return isOutlinePayload(payload) ? normalizeOutline(payload) : null
  } catch {
    return null
  }
}

function outlineFromFirestoreCourse(courseId, firestoreCourse) {
  return normalizeOutline({
    id: firestoreCourse.id ?? courseId,
    title: firestoreCourse.title ?? courseId,
    description: firestoreCourse.description ?? '',
    iconStyle: firestoreCourse.iconStyle ?? null,
    accentIndex: firestoreCourse.accentIndex ?? null,
    logoUrl: firestoreCourse.logoUrl ?? null,
    chapters: firestoreCourse.chapters ?? [],
  })
}

async function loadRemoteOutline(courseId) {
  const [bundled, firestoreCourse] = await Promise.all([
    fetchBundledOutline(courseId),
    getFirestoreCourse(courseId),
  ])
  const firestoreOutline = firestoreCourse
    ? outlineFromFirestoreCourse(courseId, firestoreCourse)
    : null

  // Hub/Firestore is authoritative when it has modules. Do not re-add deleted
  // chapters from bundled course.json — that made intentional deletions bounce back.
  if (firestoreOutline && countModules(firestoreOutline) > 0) {
    return firestoreOutline
  }
  if (bundled && countModules(bundled) > 0) {
    return bundled
  }

  return firestoreOutline ?? bundled ?? null
}

/**
 * @param {string} courseId
 * @param {{ source?: 'auto' | 'bundled' | 'hub' }} [options]
 * auto — local draft if present (healed with any Hub/bundled chapters the draft lacks),
 *        else Hub (if non-empty), else bundled
 * bundled — ignore draft + Hub; load shipped /courses/{id}/course.json only
 * hub — ignore draft; load Firestore course only
 */
export async function loadOutline(courseId, { source = 'auto' } = {}) {
  await ensureContentStoreReady()

  if (source === 'bundled') {
    const bundled = await fetchBundledOutline(courseId)
    if (!bundled) {
      throw new Error('Bundled course not found')
    }
    return bundled
  }

  if (source === 'hub') {
    const firestoreCourse = await getFirestoreCourse(courseId)
    if (!firestoreCourse) {
      throw new Error('Course not found on Hub')
    }
    const outline = outlineFromFirestoreCourse(courseId, firestoreCourse)
    if (countModules(outline) === 0) {
      throw new Error('Hub course has no modules')
    }
    return normalizeOutline(outline)
  }

  const remote = await loadRemoteOutline(courseId)
  const custom = getCustomCourse(courseId)

  if (custom?.outline) {
    if (!isUsableCustomOutline(custom.outline)) {
      await resetCourseToBundled(courseId)
    } else {
      try {
        // Keep the author's draft chapters/modules, but pull in whole chapters that
        // exist on Hub or in shipped course.json and are missing locally.
        // A thin stale draft (or a Hub outline thinned by a bad publish) used to hide
        // published chapters (Statistics Ch 4–5). Module JSON bodies are untouched.
        // In-chapter deletions stay deleted until Reload from Hub.
        let outline = normalizeOutline(custom.outline)
        const [bundled, firestoreCourse] = await Promise.all([
          fetchBundledOutline(courseId),
          getFirestoreCourse(courseId),
        ])
        const hubOutline = firestoreCourse
          ? outlineFromFirestoreCourse(courseId, firestoreCourse)
          : null
        const healCandidates = [hubOutline, bundled].filter(
          (candidate) => candidate && countModules(candidate) > 0,
        )
        const healFrom =
          healCandidates.length === 0
            ? null
            : healCandidates.reduce((best, next) =>
                countModules(next) > countModules(best) ? next : best,
              )
        if (healFrom) {
          const beforeIds = new Set(
            (outline.chapters ?? []).map((chapter) => chapter.id).filter(Boolean),
          )
          const healed = mergeMissingChaptersFromSource(outline, healFrom)
          const added = (healed.chapters ?? []).some(
            (chapter) => chapter?.id && !beforeIds.has(chapter.id),
          )
          if (added) {
            outline = healed
            await saveCustomOutline(courseId, outline)
          }
        }
        return outline
      } catch {
        await resetCourseToBundled(courseId)
      }
    }
  }

  if (remote) {
    return remote
  }

  throw new Error('Course not found')
}

async function resolveModuleBank(courseId, moduleData) {
  if (!moduleData?.bankRef) {
    return moduleData
  }

  const customBank = getCustomBank(courseId, moduleData.bankRef)
  if (customBank?.items?.length) {
    return { ...moduleData, bank: customBank.items }
  }

  try {
    const response = await fetch(`/banks/${courseId}/${moduleData.bankRef}.json`)
    if (response.ok) {
      const bankFile = await response.json()
      const items = Array.isArray(bankFile) ? bankFile : bankFile.items ?? []
      if (items.length > 0) {
        return { ...moduleData, bank: items }
      }
    }
  } catch {
    // fall through
  }

  return moduleData
}

export async function loadModule(courseId, moduleId) {
  await ensureContentStoreReady()
  const customModule = getCustomModule(courseId, moduleId)
  if (customModule) {
    return resolveModuleBank(courseId, customModule)
  }

  const response = await fetch(`/lessons/${courseId}/${moduleId}.json`)
  if (!response.ok) {
    throw new Error('Module not found')
  }
  const moduleData = await response.json()
  return resolveModuleBank(courseId, moduleData)
}

function readExportMeta() {
  try {
    const raw = localStorage.getItem(EXPORT_META_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function markCourseDraftExported(courseId) {
  if (!courseId) {
    return
  }
  const meta = readExportMeta()
  meta[courseId] = new Date().toISOString()
  try {
    localStorage.setItem(EXPORT_META_KEY, JSON.stringify(meta))
  } catch {
    // Tiny meta only — ignore if still blocked.
  }
}

export function getCourseDraftExportedAt(courseId) {
  return readExportMeta()[courseId] ?? null
}
