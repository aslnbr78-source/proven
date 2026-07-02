import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app, db } from './firebase'

function getFns() {
  if (!app) {
    return null
  }
  return getFunctions(app, 'us-central1')
}

function configPath(courseId, moduleId) {
  return doc(db, 'courses', courseId, 'finalTests', moduleId)
}

function optionsPath(courseId, moduleId) {
  return doc(db, 'courses', courseId, 'finalTestOptions', moduleId)
}

function permissionPath(courseId, moduleId, uid) {
  return doc(db, 'courses', courseId, 'finalTests', moduleId, 'permissions', uid)
}

function sessionsCollection(courseId, moduleId) {
  return collection(db, 'courses', courseId, 'finalTests', moduleId, 'sessions')
}

export async function getStudentFinalTestPermission(courseId, moduleId, uid) {
  if (!db || !uid) {
    return null
  }

  const snap = await getDoc(permissionPath(courseId, moduleId, uid))
  return snap.exists() ? snap.data() : null
}

export async function grantFinalTestPermission({
  courseId,
  moduleId,
  studentUid,
  teacherUid,
  maxAttempts,
}) {
  if (!db) {
    throw new Error('Firestore is not configured')
  }

  const payload = {
    allowed: true,
    method: 'teacher',
    grantedBy: teacherUid,
    grantedAt: serverTimestamp(),
  }

  const parsedAttempts = Number(maxAttempts)
  if (Number.isFinite(parsedAttempts) && parsedAttempts > 0) {
    payload.maxAttempts = parsedAttempts
  }

  await setDoc(permissionPath(courseId, moduleId, studentUid), payload, { merge: true })
}

export async function revokeFinalTestPermission(courseId, moduleId, studentUid) {
  if (!db) {
    return
  }

  await setDoc(
    permissionPath(courseId, moduleId, studentUid),
    {
      allowed: false,
      revokedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function setFinalTestPasscode({
  courseId,
  moduleId,
  passcode,
  accessMode,
  passcodeValidMinutes,
}) {
  const fns = getFns()
  if (!fns) {
    throw new Error('Cloud Functions are not configured')
  }

  const callable = httpsCallable(fns, 'setFinalTestPasscode')
  await callable({ courseId, moduleId, passcode, accessMode, passcodeValidMinutes })
}

export async function verifyFinalTestPasscode({ courseId, moduleId, passcode }) {
  const fns = getFns()
  if (!fns) {
    throw new Error('Cloud Functions are not configured')
  }

  const callable = httpsCallable(fns, 'verifyFinalTestPasscode')
  const result = await callable({ courseId, moduleId, passcode })
  const data = result.data ?? {}

  if (data.reason === 'expired') {
    return { ok: false, expired: true }
  }

  return { ok: Boolean(data.ok) }
}

function timestampToDate(value) {
  if (!value) {
    return null
  }
  if (value instanceof Date) {
    return value
  }
  if (typeof value.toDate === 'function') {
    return value.toDate()
  }
  if (typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000)
  }
  return null
}

export function getEffectiveMaxAttempts(options, permission) {
  const studentLimit = Number(permission?.maxAttempts)
  if (Number.isFinite(studentLimit) && studentLimit > 0) {
    return studentLimit
  }

  const globalLimit = Number(options?.maxAttempts)
  if (Number.isFinite(globalLimit) && globalLimit > 0) {
    return globalLimit
  }

  return 1
}

export async function countStudentFinalTestAttempts(courseId, moduleId, uid) {
  if (!db || !uid) {
    return 0
  }

  const snap = await getDocs(
    query(sessionsCollection(courseId, moduleId), where('uid', '==', uid)),
  )

  return snap.docs.filter((item) => isFinalTestAttemptCounted(item.data())).length
}

export function hasAttemptsRemaining(attemptCount, maxAttempts) {
  return attemptCount < maxAttempts
}

export function isPasscodeAccessExpired(permission) {
  if (!permission?.allowed || permission.method !== 'passcode') {
    return false
  }

  const expiresAt = timestampToDate(permission.passcodeExpiresAt)
  if (!expiresAt) {
    return false
  }

  return Date.now() > expiresAt.getTime()
}

export function isFinalTestAttemptCounted(session, nowMs = Date.now()) {
  if (session?.status === 'completed') {
    return true
  }

  if (session?.status !== 'in-progress') {
    return false
  }

  const timeLimitSeconds = Number(session.timeLimitSeconds)
  if (!Number.isFinite(timeLimitSeconds) || timeLimitSeconds <= 0) {
    return true
  }

  const startedAt = timestampToDate(session.startedAt)
  if (!startedAt) {
    return true
  }

  return startedAt.getTime() + timeLimitSeconds * 1000 > nowMs
}

export async function createFinalTestSession({
  courseId,
  moduleId,
  moduleTitle,
  uid,
  studentEmail,
  studentName,
  timeLimitSeconds,
}) {
  if (!db || !uid) {
    throw new Error('Sign in required')
  }

  const ref = await addDoc(sessionsCollection(courseId, moduleId), {
    uid,
    studentEmail: studentEmail ?? '',
    studentName: studentName ?? '',
    courseId,
    moduleId,
    moduleTitle: moduleTitle ?? '',
    startedAt: serverTimestamp(),
    endedAt: null,
    timeLimitSeconds: timeLimitSeconds ?? null,
    elapsedSeconds: 0,
    fullscreenExits: 0,
    tabSwitches: 0,
    copyAttempts: 0,
    scoreCorrect: null,
    scoreTotal: null,
    status: 'in-progress',
  })

  return ref.id
}

export async function updateFinalTestSession(courseId, moduleId, sessionId, patch) {
  if (!db || !sessionId) {
    return
  }

  await updateDoc(doc(db, 'courses', courseId, 'finalTests', moduleId, 'sessions', sessionId), patch)
}

export async function completeFinalTestSession({
  courseId,
  moduleId,
  sessionId,
  elapsedSeconds,
  scoreCorrect,
  scoreTotal,
  fullscreenExits,
  tabSwitches,
  copyAttempts,
}) {
  if (!db || !sessionId) {
    return
  }

  await updateDoc(doc(db, 'courses', courseId, 'finalTests', moduleId, 'sessions', sessionId), {
    endedAt: serverTimestamp(),
    elapsedSeconds,
    scoreCorrect,
    scoreTotal,
    fullscreenExits,
    tabSwitches,
    copyAttempts,
    status: 'completed',
  })
}

export async function listFinalTestSessions(courseId, moduleId) {
  if (!db) {
    return []
  }

  const snap = await getDocs(
    query(sessionsCollection(courseId, moduleId), orderBy('startedAt', 'desc')),
  )

  return snap.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function listAllFinalTestSessionsForCourse(courseId, knownModuleIds = []) {
  if (!db) {
    return []
  }

  const moduleIdSet = new Set(knownModuleIds.filter(Boolean))
  const rows = []

  const [configSnap, optionsSnap] = await Promise.all([
    getDocs(collection(db, 'courses', courseId, 'finalTests')),
    getDocs(collection(db, 'courses', courseId, 'finalTestOptions')),
  ])

  configSnap.docs.forEach((item) => moduleIdSet.add(item.id))
  optionsSnap.docs.forEach((item) => moduleIdSet.add(item.id))

  for (const moduleId of moduleIdSet) {
    const sessions = await listFinalTestSessions(courseId, moduleId)
    rows.push(...sessions.map((session) => ({ ...session, moduleId })))
  }

  return rows.sort((a, b) => {
    const aTime = a.startedAt?.seconds ?? 0
    const bTime = b.startedAt?.seconds ?? 0
    return bTime - aTime
  })
}

export async function getFinalTestConfig(courseId, moduleId) {
  if (!db) {
    return null
  }

  const snap = await getDoc(configPath(courseId, moduleId))
  if (!snap.exists()) {
    return { accessMode: 'either', passcodeSet: false }
  }

  const data = snap.data()
  return {
    accessMode: data.accessMode ?? 'either',
    passcodeSet: Boolean(data.passcodeSet),
    passcodeExpiresAt: timestampToDate(data.passcodeExpiresAt),
  }
}

export async function getFinalTestOptions(courseId, moduleId) {
  if (!db) {
    return { allowAiAssistant: false, maxAttempts: 1, accessMode: 'either' }
  }

  const snap = await getDoc(optionsPath(courseId, moduleId))
  if (!snap.exists()) {
    return { allowAiAssistant: false, maxAttempts: 1, accessMode: 'either' }
  }

  const data = snap.data()
  const maxAttempts = Number(data.maxAttempts)
  return {
    allowAiAssistant: Boolean(data.allowAiAssistant),
    maxAttempts: Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : 1,
    accessMode: data.accessMode ?? 'either',
  }
}

export async function saveFinalTestOptions({
  courseId,
  moduleId,
  allowAiAssistant,
  maxAttempts,
  accessMode,
}) {
  if (!db) {
    throw new Error('Firestore is not configured')
  }

  const payload = {
    allowAiAssistant: Boolean(allowAiAssistant),
    updatedAt: serverTimestamp(),
  }

  const parsedAttempts = Number(maxAttempts)
  if (Number.isFinite(parsedAttempts) && parsedAttempts > 0) {
    payload.maxAttempts = parsedAttempts
  }

  if (accessMode) {
    payload.accessMode = accessMode
  }

  await setDoc(optionsPath(courseId, moduleId), payload, { merge: true })
}
