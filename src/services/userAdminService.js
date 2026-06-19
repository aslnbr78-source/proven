import {
  collection,
  doc,
  getDocs,
  updateDoc,
} from 'firebase/firestore'
import { db } from './firebase'
import { ROLES } from '../utils/roles'

export async function listUsers() {
  if (!db) {
    return []
  }

  const snap = await getDocs(collection(db, 'users'))
  return snap.docs
    .map((item) => ({ uid: item.id, ...item.data() }))
    .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''))
}

export async function updateUserRole(uid, role) {
  if (!db || !uid) {
    throw new Error('Firestore is not configured')
  }

  if (!Object.values(ROLES).includes(role)) {
    throw new Error('Invalid role')
  }

  await updateDoc(doc(db, 'users', uid), { role })
}

export async function listStudents() {
  const users = await listUsers()
  return users.filter((user) => user.role === ROLES.STUDENT || !user.role)
}
