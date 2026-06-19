import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase'

export async function syncModuleCompletion(uid, courseId, moduleId) {
  if (!db || !uid || uid === 'guest') {
    return
  }

  await setDoc(
    doc(db, 'users', uid, 'progress', `${courseId}__${moduleId}`),
    {
      courseId,
      moduleId,
      completed: true,
      completedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function getUserProgress(uid) {
  if (!db || !uid) {
    return []
  }

  const snap = await getDocs(collection(db, 'users', uid, 'progress'))
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function getAllStudentProgress() {
  if (!db) {
    return []
  }

  const usersSnap = await getDocs(collection(db, 'users'))
  const rows = []

  for (const userDoc of usersSnap.docs) {
    const user = { uid: userDoc.id, ...userDoc.data() }
    if (user.role && user.role !== 'student') {
      continue
    }

    const progressSnap = await getDocs(collection(db, 'users', userDoc.id, 'progress'))
    progressSnap.docs.forEach((progressDoc) => {
      rows.push({
        uid: userDoc.id,
        email: user.email,
        displayName: user.displayName,
        ...progressDoc.data(),
      })
    })
  }

  return rows
}
