import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { getUserProgress, syncModuleCompletion } from '../services/progressService'

const ProgressContext = createContext(null)
const STORAGE_PREFIX = 'provenmath-progress'

function loadProgress(uid) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}-${uid ?? 'guest'}`)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveProgress(uid, progress) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}-${uid ?? 'guest'}`, JSON.stringify(progress))
  } catch {
    // Progress still remains in memory for this session if localStorage is unavailable.
  }
}

function completedAtToDate(value) {
  if (!value) {
    return null
  }
  if (value instanceof Date) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value.toDate === 'function') {
    return value.toDate()
  }
  if (typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000)
  }
  return null
}

function normalizeCompletedAt(value) {
  return completedAtToDate(value)?.toISOString()
}

function mergeProgressEntry(left, right) {
  if (!left) {
    return right
  }
  if (!right) {
    return left
  }

  const leftDate = completedAtToDate(left.completedAt)
  const rightDate = completedAtToDate(right.completedAt)
  const completedAt =
    rightDate && (!leftDate || rightDate.getTime() > leftDate.getTime())
      ? normalizeCompletedAt(right.completedAt)
      : normalizeCompletedAt(left.completedAt)

  return {
    completed: Boolean(left.completed || right.completed),
    ...(completedAt ? { completedAt } : {}),
  }
}

function mergeProgressMaps(...maps) {
  const merged = {}

  maps.forEach((map) => {
    Object.entries(map ?? {}).forEach(([courseId, modules]) => {
      merged[courseId] = merged[courseId] ?? {}
      Object.entries(modules ?? {}).forEach(([moduleId, entry]) => {
        merged[courseId][moduleId] = mergeProgressEntry(merged[courseId][moduleId], entry)
      })
    })
  })

  return merged
}

function rowsToProgress(rows) {
  return rows.reduce((next, row) => {
    if (!row.completed || !row.courseId || !row.moduleId) {
      return next
    }

    next[row.courseId] = next[row.courseId] ?? {}
    next[row.courseId][row.moduleId] = {
      completed: true,
      ...(normalizeCompletedAt(row.completedAt)
        ? { completedAt: normalizeCompletedAt(row.completedAt) }
        : {}),
    }
    return next
  }, {})
}

export function ProgressProvider({ children }) {
  const { user } = useAuth()
  const uid = user?.uid ?? 'guest'
  const [progress, setProgress] = useState(() => loadProgress(uid))

  useEffect(() => {
    let cancelled = false
    const localProgress = loadProgress(uid)
    setProgress(localProgress)

    if (uid === 'guest') {
      return () => {
        cancelled = true
      }
    }

    getUserProgress(uid)
      .then((rows) => {
        if (cancelled) {
          return
        }

        const remoteProgress = rowsToProgress(rows)
        setProgress((current) => {
          const next = mergeProgressMaps(localProgress, current, remoteProgress)
          saveProgress(uid, next)
          return next
        })
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [uid])

  const markComplete = useCallback(
    (courseId, moduleId) => {
      setProgress((previous) => {
        const next = {
          ...previous,
          [courseId]: {
            ...previous[courseId],
            [moduleId]: {
              completed: true,
              completedAt: new Date().toISOString(),
            },
          },
        }
        saveProgress(uid, next)
        syncModuleCompletion(uid, courseId, moduleId).catch(() => {})
        return next
      })
    },
    [uid],
  )

  const isComplete = useCallback(
    (courseId, moduleId) => Boolean(progress[courseId]?.[moduleId]?.completed),
    [progress],
  )

  const value = useMemo(
    () => ({ progress, markComplete, isComplete }),
    [progress, markComplete, isComplete],
  )

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>
}

export function useProgress() {
  const context = useContext(ProgressContext)
  if (!context) {
    throw new Error('useProgress must be used within ProgressProvider')
  }
  return context
}
