import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase'

const INITIAL_LIVE_VIEW = {
  blockIndex: 0,
  livePhase: 'content',
  exitTicket: null,
}

function liveSessionRef(courseId) {
  return doc(db, 'liveSessions', courseId)
}

export function subscribeLiveSession(courseId, callback) {
  if (!db || !courseId) {
    callback(null)
    return () => {}
  }

  return onSnapshot(
    liveSessionRef(courseId),
    (snap) => callback(snap.exists() ? snap.data() : null),
    () => callback(null),
  )
}

export async function startLiveSession({ courseId, moduleId, moduleTitle, teacherUid, teacherName }) {
  if (!db) {
    throw new Error('Firestore is not configured')
  }

  await setDoc(liveSessionRef(courseId), {
    active: true,
    courseId,
    moduleId,
    moduleTitle: moduleTitle ?? '',
    teacherUid,
    teacherName: teacherName ?? 'Teacher',
    ...INITIAL_LIVE_VIEW,
    updatedAt: serverTimestamp(),
  })
}

export async function updateLiveModule({ courseId, moduleId, moduleTitle }) {
  if (!db) {
    return
  }

  await setDoc(
    liveSessionRef(courseId),
    {
      moduleId,
      moduleTitle: moduleTitle ?? '',
      ...INITIAL_LIVE_VIEW,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function endLiveSession(courseId) {
  if (!db) {
    return
  }

  await setDoc(
    liveSessionRef(courseId),
    {
      active: false,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}
