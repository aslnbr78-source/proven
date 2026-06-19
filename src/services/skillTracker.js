import {
  arrayUnion,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from './firebase'

export function getSkillId(courseId, moduleId) {
  return `${courseId}__${moduleId}`
}

export async function getSkillProfile(uid, courseId, moduleId) {
  if (!db || !uid) {
    return null
  }

  const skillId = getSkillId(courseId, moduleId)
  const snap = await getDoc(doc(db, 'users', uid, 'skills', skillId))
  return snap.exists() ? { id: skillId, ...snap.data() } : null
}

export async function recordWrongAnswer(uid, courseId, moduleId, wrongAnswer) {
  if (!db || !uid || !wrongAnswer) {
    return
  }

  const skillId = getSkillId(courseId, moduleId)
  const ref = doc(db, 'users', uid, 'skills', skillId)

  const snap = await getDoc(ref)
  if (snap.exists()) {
    await updateDoc(ref, {
      courseId,
      moduleId,
      wrongAnswers: arrayUnion(wrongAnswer),
      mastery: Math.max(0, (snap.data().mastery ?? 0.5) - 0.1),
      lastSeen: serverTimestamp(),
    })
  } else {
    await setDoc(ref, {
      courseId,
      moduleId,
      mastery: 0.4,
      wrongAnswers: [wrongAnswer],
      lastSeen: serverTimestamp(),
    })
  }
}

export async function recordMasteryGain(uid, courseId, moduleId) {
  if (!db || !uid) {
    return
  }

  const skillId = getSkillId(courseId, moduleId)
  const ref = doc(db, 'users', uid, 'skills', skillId)
  const snap = await getDoc(ref)

  if (snap.exists()) {
    await updateDoc(ref, {
      mastery: Math.min(1, (snap.data().mastery ?? 0.5) + 0.15),
      lastSeen: serverTimestamp(),
    })
  } else {
    await setDoc(ref, {
      courseId,
      moduleId,
      mastery: 0.6,
      wrongAnswers: [],
      lastSeen: serverTimestamp(),
    })
  }
}
