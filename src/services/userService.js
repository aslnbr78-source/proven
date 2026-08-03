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
    const existing = snap.data()
    const updates = {}

    if (firebaseUser.email && existing.email !== firebaseUser.email) {
      updates.email = firebaseUser.email
    }
    if (firebaseUser.displayName && existing.displayName !== firebaseUser.displayName) {
      updates.displayName = firebaseUser.displayName
    }
    if (existing.isAnonymous !== firebaseUser.isAnonymous) {
      updates.isAnonymous = firebaseUser.isAnonymous
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = serverTimestamp()
      await setDoc(ref, updates, { merge: true })
    }

    return { uid: firebaseUser.uid, ...existing, ...updates }
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
