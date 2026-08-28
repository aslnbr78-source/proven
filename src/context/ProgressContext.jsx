import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { syncModuleCompletion } from '../services/progressService'

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

export function ProgressProvider({ children }) {
  const { user } = useAuth()
  const uid = user?.uid ?? 'guest'
  const [progress, setProgress] = useState(() => loadProgress(uid))

  useEffect(() => {
    setProgress(loadProgress(uid))
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
        localStorage.setItem(`${STORAGE_PREFIX}-${uid}`, JSON.stringify(next))
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

  const saveExitTicket = useCallback(
    (courseId, moduleId, result) => {
      if (!courseId || !moduleId || !result) {
        return
      }
      setProgress((previous) => {
        const moduleProgress = previous[courseId]?.[moduleId] ?? {}
        const exitTickets = [
          ...(moduleProgress.exitTickets ?? []).slice(-4),
          {
            ...result,
            savedAt: new Date().toISOString(),
          },
        ]
        const next = {
          ...previous,
          [courseId]: {
            ...previous[courseId],
            [moduleId]: {
              ...moduleProgress,
              exitTicket: exitTickets[exitTickets.length - 1],
              exitTickets,
            },
          },
        }
        localStorage.setItem(`${STORAGE_PREFIX}-${uid}`, JSON.stringify(next))
        return next
      })
    },
    [uid],
  )

  const value = useMemo(
    () => ({ progress, markComplete, isComplete, saveExitTicket }),
    [progress, markComplete, isComplete, saveExitTicket],
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
