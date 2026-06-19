import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import { exportCoursePackage, getCustomModule } from './contentStore'
import { flattenModules } from '../utils/courseOutline'

export async function listFirestoreCourses() {
  if (!db) {
    return []
  }

  try {
    const snap = await getDocs(collection(db, 'courses'))
    return snap.docs.map((item) => ({ id: item.id, ...item.data() }))
  } catch {
    return []
  }
}

export async function getFirestoreCourse(courseId) {
  if (!db || !courseId) {
    return null
  }

  try {
    const snap = await getDoc(doc(db, 'courses', courseId))
    return snap.exists() ? { id: snap.id, ...snap.data() } : null
  } catch {
    return null
  }
}

export async function getFirestoreModule(courseId, moduleId) {
  if (!db || !courseId || !moduleId) {
    return null
  }

  try {
    const snap = await getDoc(doc(db, 'courses', courseId, 'modules', moduleId))
    return snap.exists() ? snap.data() : null
  } catch {
    return null
  }
}

export async function isFirestoreCourse(courseId) {
  const course = await getFirestoreCourse(courseId)
  return Boolean(course?.published)
}

export async function gatherCoursePackageForPublish(courseId, outlineOverride = null) {
  const customPack = exportCoursePackage(courseId)
  if (customPack?.courseJson) {
    return {
      courseJson: outlineOverride ?? customPack.courseJson,
      modules: customPack.modules ?? {},
    }
  }

  const outlineResponse = await fetch(`/courses/${courseId}/course.json`)
  if (!outlineResponse.ok) {
    throw new Error('Course outline not found')
  }

  const courseJson = outlineOverride ?? (await outlineResponse.json())
  const modules = {}

  for (const module of flattenModules(courseJson)) {
    const customModule = getCustomModule(courseId, module.id)
    if (customModule) {
      modules[module.id] = customModule
      continue
    }

    const response = await fetch(`/lessons/${courseId}/${module.id}.json`)
    if (response.ok) {
      modules[module.id] = await response.json()
    }
  }

  return { courseJson, modules }
}

export async function publishCourseToFirestore({ courseId, outline, modules, uid, email }) {
  if (!db) {
    throw new Error('Firestore is not configured')
  }

  const courseRef = doc(db, 'courses', courseId)
  const batch = writeBatch(db)

  batch.set(
    courseRef,
    {
      id: courseId,
      title: outline.title,
      description: outline.description ?? '',
      chapters: outline.chapters,
      published: true,
      updatedAt: serverTimestamp(),
      updatedBy: uid ?? null,
      ownerEmail: email ?? null,
    },
    { merge: true },
  )

  Object.entries(modules).forEach(([moduleId, moduleData]) => {
    batch.set(doc(db, 'courses', courseId, 'modules', moduleId), {
      ...moduleData,
      updatedAt: serverTimestamp(),
    })
  })

  await batch.commit()
}

export async function deleteFirestoreCourse(courseId) {
  if (!db) {
    return
  }

  const modulesSnap = await getDocs(collection(db, 'courses', courseId, 'modules'))
  const batch = writeBatch(db)
  modulesSnap.docs.forEach((item) => batch.delete(item.ref))
  batch.delete(doc(db, 'courses', courseId))
  await batch.commit()
}

export async function listCourseAssets(courseId) {
  if (!db) {
    return []
  }

  const snap = await getDocs(collection(db, 'courses', courseId, 'assets'))
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function saveCourseAsset(courseId, asset) {
  if (!db) {
    throw new Error('Firestore is not configured')
  }

  const assetRef = doc(collection(db, 'courses', courseId, 'assets'))
  await setDoc(assetRef, {
    ...asset,
    createdAt: serverTimestamp(),
  })
  return assetRef.id
}

export async function deleteCourseAsset(courseId, assetId) {
  if (!db) {
    return
  }

  await deleteDoc(doc(db, 'courses', courseId, 'assets', assetId))
}
