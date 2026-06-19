import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../utils/roles'
import {
  endLiveSession,
  startLiveSession,
  subscribeLiveSession,
  updateLiveModule,
} from '../services/liveClassService'

function LiveClassControl({ courseId, moduleId, moduleTitle }) {
  const { user, profile, role } = useAuth()
  const [session, setSession] = useState(null)
  const [busy, setBusy] = useState(false)

  const isTeacher = role === ROLES.TEACHER || role === ROLES.ADMIN
  const isLive = session?.active && session?.teacherUid === user?.uid

  useEffect(() => {
    if (!isTeacher || !courseId) {
      return undefined
    }
    return subscribeLiveSession(courseId, setSession)
  }, [courseId, isTeacher])

  useEffect(() => {
    if (!isLive || !moduleId || session?.moduleId === moduleId) {
      return
    }
    updateLiveModule({ courseId, moduleId, moduleTitle }).catch(() => {})
  }, [isLive, courseId, moduleId, moduleTitle, session?.moduleId])

  if (!isTeacher) {
    return null
  }

  const handleToggle = async () => {
    setBusy(true)
    try {
      if (isLive) {
        await endLiveSession(courseId)
      } else {
        await startLiveSession({
          courseId,
          moduleId,
          moduleTitle,
          teacherUid: user.uid,
          teacherName: profile?.displayName || profile?.email || 'Teacher',
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={busy || !moduleId}
        className={`rounded px-3 py-1.5 text-sm font-medium ${
          isLive
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-rose-600 text-white hover:bg-rose-700'
        } disabled:opacity-50`}
      >
        {busy ? '…' : isLive ? 'End live class' : 'Go live'}
      </button>
      {isLive && (
        <span className="flex items-center gap-1.5 text-xs font-medium text-rose-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          Students follow this screen
        </span>
      )}
      {session?.active && session.teacherUid !== user?.uid && (
        <span className="text-xs text-amber-700">
          Another teacher is live on this course
        </span>
      )}
    </div>
  )
}

export default LiveClassControl
