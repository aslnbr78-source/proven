import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../utils/roles'
import { subscribeLiveSession } from '../services/liveClassService'

function LiveClassFollower({ courseId, moduleId, autoSyncDisabled = false }) {
  const { role } = useAuth()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const lastSyncedModule = useRef(moduleId)

  const isStudent = role === ROLES.STUDENT || !role

  useEffect(() => {
    if (!courseId) {
      return undefined
    }
    return subscribeLiveSession(courseId, setSession)
  }, [courseId])

  useEffect(() => {
    lastSyncedModule.current = moduleId
  }, [moduleId])

  useEffect(() => {
    if (!isStudent || !session?.active || !session.moduleId) {
      return
    }
    if (autoSyncDisabled) {
      return
    }
    if (session.moduleId === lastSyncedModule.current) {
      return
    }
    lastSyncedModule.current = session.moduleId
    navigate(`/courses/${courseId}/modules/${session.moduleId}`, { replace: true })
  }, [session, courseId, isStudent, navigate, autoSyncDisabled])

  if (!session?.active || !isStudent) {
    return null
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
      <div>
        <p className="font-semibold">Live class in progress</p>
        <p className="text-rose-800">
          {session.teacherName} is teaching: {session.moduleTitle || session.moduleId}
        </p>
      </div>
      {session.moduleId !== moduleId && (
        <span className="text-xs font-medium text-rose-700">
          {autoSyncDisabled
            ? 'Finish this assessment before joining live class.'
            : 'Syncing to teacher&apos;s screen…'}
        </span>
      )}
    </div>
  )
}

export default LiveClassFollower
