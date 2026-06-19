import { findModuleLocation } from '../utils/courseOutline'

const STORAGE_PREFIX = 'provenmath-nav'

function storageKey(uid, courseId) {
  return `${STORAGE_PREFIX}-${uid ?? 'guest'}-${courseId}`
}

export function loadNavigationState(uid, courseId) {
  try {
    const raw = localStorage.getItem(storageKey(uid, courseId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveNavigationState(uid, courseId, state) {
  localStorage.setItem(storageKey(uid, courseId), JSON.stringify(state))
}

export function recordModuleAccess(uid, courseId, { chapterId, subchapterId, moduleId }) {
  saveNavigationState(uid, courseId, {
    visited: true,
    lastChapterId: chapterId,
    lastSubchapterId: subchapterId,
    lastModuleId: moduleId,
    updatedAt: new Date().toISOString(),
  })
}

/**
 * Fresh start → all collapsed.
 * Return visit → expand last-accessed chapter + subchapter.
 * Active module → expand that chapter + subchapter.
 */
export function getInitialExpandedState(uid, courseId, courseOutline, activeModuleId) {
  const activeLocation = activeModuleId
    ? findModuleLocation(courseOutline, activeModuleId)
    : null

  if (activeLocation) {
    return {
      expandedChapters: new Set([activeLocation.chapter.id]),
      expandedSubchapters: new Set([activeLocation.subchapter.id]),
    }
  }

  const nav = loadNavigationState(uid, courseId)
  if (nav?.visited && nav.lastChapterId) {
    const expandedChapters = new Set([nav.lastChapterId])
    const expandedSubchapters = nav.lastSubchapterId
      ? new Set([nav.lastSubchapterId])
      : new Set()
    return { expandedChapters, expandedSubchapters }
  }

  return {
    expandedChapters: new Set(),
    expandedSubchapters: new Set(),
  }
}
