import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { useAuth } from './AuthContext'
import { db } from '../services/firebase'
import {
  BADGES,
  MAX_HEARTS,
  calculateXp,
  computeStreak,
  defaultGamificationState,
  evaluateBadges,
  getTodayDateString,
} from '../utils/gamification'

const GamificationContext = createContext(null)
const STORAGE_PREFIX = 'provenmath-gamification'
const moduleHints = { current: 0 }

function loadState(uid) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}-${uid ?? 'guest'}`)
    return raw ? { ...defaultGamificationState(), ...JSON.parse(raw) } : defaultGamificationState()
  } catch {
    return defaultGamificationState()
  }
}

function saveState(uid, state) {
  localStorage.setItem(`${STORAGE_PREFIX}-${uid}`, JSON.stringify(state))
}

async function syncLeaderboard(uid, profile, state) {
  if (!db || !uid || uid === 'guest') {
    return
  }

  await setDoc(
    doc(db, 'leaderboard', uid),
    {
      displayName: profile?.displayName || profile?.email || 'Student',
      xp: state.xp,
      streak: state.streak,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  )
}

export function GamificationProvider({ children }) {
  const { user, profile } = useAuth()
  const uid = user?.uid ?? 'guest'
  const [state, setState] = useState(() => loadState(uid))

  useEffect(() => {
    const loaded = loadState(uid)
    const today = getTodayDateString()
    if (loaded.lastActiveDate && loaded.lastActiveDate !== today) {
      loaded.hearts = MAX_HEARTS
    }
    setState(loaded)
    moduleHints.current = 0
  }, [uid])

  const persist = useCallback(
    (next) => {
      setState(next)
      saveState(uid, next)
      syncLeaderboard(uid, profile, next).catch(() => {})
      return next
    },
    [uid, profile],
  )

  const resetModuleHints = useCallback(() => {
    moduleHints.current = 0
  }, [])

  const recordHint = useCallback(() => {
    moduleHints.current += 1
  }, [])

  const recordWrong = useCallback(() => {
    setState((previous) => {
      const hearts = Math.max(0, previous.hearts - 1)
      const next = { ...previous, hearts }
      saveState(uid, next)
      return next
    })
  }, [uid])

  const awardModuleComplete = useCallback(
    (moduleType) => {
      const hintsUsed = moduleHints.current
      moduleHints.current = 0

      setState((previous) => {
        const today = getTodayDateString()
        const streak = computeStreak(previous.lastActiveDate, previous.streak)
        const xpGain = calculateXp(hintsUsed)
        const modulesCompleted = previous.modulesCompleted + 1

        const draft = {
          ...previous,
          xp: previous.xp + xpGain,
          streak,
          lastActiveDate: today,
          modulesCompleted,
          hearts: previous.hearts,
        }

        draft.badges = evaluateBadges(draft, { hintsUsed, moduleType })

        saveState(uid, draft)
        syncLeaderboard(uid, profile, draft).catch(() => {})

        return draft
      })

      return calculateXp(hintsUsed)
    },
    [uid, profile],
  )

  const canPlay = state.hearts > 0

  const value = useMemo(
    () => ({
      ...state,
      badgesCatalog: BADGES,
      canPlay,
      resetModuleHints,
      recordHint,
      recordWrong,
      awardModuleComplete,
      getModuleHintsUsed: () => moduleHints.current,
    }),
    [state, canPlay, resetModuleHints, recordHint, recordWrong, awardModuleComplete],
  )

  return <GamificationContext.Provider value={value}>{children}</GamificationContext.Provider>
}

export function useGamification() {
  const context = useContext(GamificationContext)
  if (!context) {
    throw new Error('useGamification must be used within GamificationProvider')
  }
  return context
}
