import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../services/firebase'
import { ROLES } from '../utils/roles'
import { useAuth } from '../context/AuthContext'

function LiveClassHubBanner() {
  const { role } = useAuth()
  const [liveSessions, setLiveSessions] = useState([])

  useEffect(() => {
    if (!db || role === ROLES.TEACHER || role === ROLES.ADMIN) {
      return undefined
    }

    const q = query(collection(db, 'liveSessions'), where('active', '==', true))
    return onSnapshot(
      q,
      (snap) => {
        setLiveSessions(snap.docs.map((item) => ({ id: item.id, ...item.data() })))
      },
      () => setLiveSessions([]),
    )
  }, [role])

  if (liveSessions.length === 0) {
    return null
  }

  return (
    <div className="mt-6 space-y-2">
      {liveSessions.map((session) => (
        <Link
          key={session.id}
          to={`/courses/${session.courseId}/modules/${session.moduleId}`}
          className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 no-underline hover:bg-rose-100"
        >
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          <span className="text-sm font-medium text-rose-900">
            Live now: {session.moduleTitle || session.courseId} — join {session.teacherName}&apos;s class
          </span>
        </Link>
      ))}
    </div>
  )
}

export default LiveClassHubBanner
