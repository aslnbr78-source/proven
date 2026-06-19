import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { ROLES } from '../utils/roles'

export async function ensureUserProfile(firebaseUser) {
  if (!db || !firebaseUser) {
    return null
  }

  const ref = doc(db, 'users', firebaseUser.uid)
  const snap = await getDoc(ref)

  if (snap.exists()) {
    return { uid: firebaseUser.uid, ...snap.data() }
  }

  const profile = {
    email: firebaseUser.email ?? null,
    displayName: firebaseUser.displayName ?? null,
    role: ROLES.STUDENT,
    isAnonymous: firebaseUser.isAnonymous,
    createdAt: serverTimestamp(),
  }

  await setDoc(ref, profile)
  return { uid: firebaseUser.uid, ...profile }
}

export async function getUserProfile(uid) {
  if (!db || !uid) {
    return null
  }

  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? { uid, ...snap.data() } : null
}
