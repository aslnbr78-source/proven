import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase'

export async function uploadCourseFile(courseId, file) {
  if (!storage) {
    throw new Error('Firebase Storage is not configured')
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `courses/${courseId}/${Date.now()}-${safeName}`
  const fileRef = ref(storage, path)
  await uploadBytes(fileRef, file)
  const url = await getDownloadURL(fileRef)

  return {
    name: file.name,
    path,
    url,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
  }
}

export function inferAssetKind(file) {
  if (file.type.startsWith('video/')) {
    return 'video'
  }
  if (file.type === 'application/pdf') {
    return 'pdf'
  }
  return 'file'
}

export async function deleteCourseFile(path) {
  if (!storage || !path) {
    return
  }

  try {
    await deleteObject(ref(storage, path))
  } catch (error) {
    if (error?.code === 'storage/object-not-found') {
      return
    }
    throw error
  }
}
