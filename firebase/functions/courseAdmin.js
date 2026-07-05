const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { getFirestore } = require('firebase-admin/firestore')
const { getStorage } = require('firebase-admin/storage')
require('./adminInit')

const COURSE_ID_PATTERN = /^[A-Za-z0-9._-]+$/

async function assertCourseManager(db, uid, courseSnap) {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required')
  }

  const userSnap = await db.doc(`users/${uid}`).get()
  const role = userSnap.data()?.role
  if (role !== 'teacher' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'Teacher access required')
  }

  const course = courseSnap.data() ?? {}
  const ownerUid = course.updatedBy ?? course.createdBy ?? null
  if (role !== 'admin' && ownerUid && ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'Only the course owner can unpublish this course')
  }
}

async function deleteCollectionRecursive(collectionRef, batchSize = 250) {
  let deleted = 0

  while (true) {
    const snap = await collectionRef.limit(batchSize).get()
    if (snap.empty) {
      return deleted
    }

    const batch = collectionRef.firestore.batch()

    for (const docSnap of snap.docs) {
      const childCollections = await docSnap.ref.listCollections()
      for (const childCollection of childCollections) {
        deleted += await deleteCollectionRecursive(childCollection, batchSize)
      }
      batch.delete(docSnap.ref)
      deleted += 1
    }

    await batch.commit()
  }
}

async function deleteCourseStorage(courseId) {
  const bucket = getStorage().bucket()
  await bucket.deleteFiles({ prefix: `courses/${courseId}/` })
}

exports.unpublishCourse = onCall(async (request) => {
  const uid = request.auth?.uid
  const courseId = String(request.data?.courseId ?? '').trim()

  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required')
  }

  if (!courseId || !COURSE_ID_PATTERN.test(courseId)) {
    throw new HttpsError('invalid-argument', 'Valid courseId is required')
  }

  const db = getFirestore()
  const courseRef = db.doc(`courses/${courseId}`)
  const courseSnap = await courseRef.get()

  if (!courseSnap.exists) {
    return { courseId, deleted: false }
  }

  await assertCourseManager(db, uid, courseSnap)

  const subcollections = await courseRef.listCollections()
  let deletedDocs = 0
  for (const collectionRef of subcollections) {
    deletedDocs += await deleteCollectionRecursive(collectionRef)
  }

  await courseRef.delete()
  await db.doc(`liveSessions/${courseId}`).delete()
  await deleteCourseStorage(courseId)

  return { courseId, deleted: true, deletedDocs }
})
