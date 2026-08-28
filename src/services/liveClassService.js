import { addDoc, collection, doc, serverTimestamp, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from './firebase'

function liveSessionRef(courseId) {
  return doc(db, 'liveSessions', courseId)
}

function liveExitAnswerKeyRef(courseId) {
  return doc(db, 'liveSessions', courseId, 'private', 'exitTicket')
}

function liveExitResponsesRef(courseId) {
  return collection(db, 'liveSessions', courseId, 'exitResponses')
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
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function updateLiveSessionView(courseId, updates = {}) {
  if (!db || !courseId) {
    return
  }

  const { clearExitTicket, ...rest } = updates
  await setDoc(
    liveSessionRef(courseId),
    {
      ...rest,
      ...(clearExitTicket ? { exitTicket: null } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function startLiveExitTicket(courseId, { items = [], answerKey = [], durationSec = 60 } = {}) {
  if (!db || !courseId || items.length === 0) {
    return
  }

  const startedAtMs = Date.now()
  const durationMs = Math.max(1, Number(durationSec) || 60) * 1000

  await setDoc(
    liveExitAnswerKeyRef(courseId),
    {
      answerKey,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  await setDoc(
    liveSessionRef(courseId),
    {
      livePhase: 'exit-ticket',
      exitTicket: {
        items,
        itemCount: items.length,
        startedAtMs,
        endsAtMs: startedAtMs + durationMs,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function submitLiveExitTicketResponse({
  courseId,
  moduleId,
  studentUid,
  studentName = '',
  studentEmail = '',
  result,
}) {
  if (!db || !courseId || !studentUid || !result) {
    return
  }

  await addDoc(liveExitResponsesRef(courseId), {
    ...result,
    kind: result.kind ?? 'exit-ticket',
    questionId: 'exit-ticket',
    courseId,
    moduleId,
    uid: studentUid,
    displayName: studentName,
    email: studentEmail,
    submittedAt: serverTimestamp(),
  })
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
