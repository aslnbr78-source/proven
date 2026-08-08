import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { courses as bundledCourses } from '../data/courses'
import { getCustomCourseIds } from '../services/contentStore'
import { listCourseAssets, saveCourseAsset, deleteCourseAsset, listFirestoreCourses } from '../services/courseFirestore'
import { inferAssetKind, uploadCourseFile } from '../services/storageService'
import { useAuth } from '../context/AuthContext'

function CourseAssets() {
  const { user, profile } = useAuth()
  const [courseIds, setCourseIds] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('algebra-1')
  const [assets, setAssets] = useState([])
  const [linkTitle, setLinkTitle] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [message, setMessage] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    async function loadCourses() {
      const published = await listFirestoreCourses()
      const ids = [
        ...new Set([
          ...published.map((course) => course.id),
          ...bundledCourses.map((course) => course.id),
          ...getCustomCourseIds(),
        ]),
      ]
      setCourseIds(ids)
      if (ids.length > 0 && !ids.includes(selectedCourseId)) {
        setSelectedCourseId(ids[0])
      }
    }
    loadCourses()
  }, [selectedCourseId])

  const loadAssets = async (courseId) => {
    const rows = await listCourseAssets(courseId)
    setAssets(rows)
  }

  useEffect(() => {
    if (selectedCourseId) {
      loadAssets(selectedCourseId)
    }
  }, [selectedCourseId])

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !selectedCourseId) {
      return
    }

    setUploading(true)
    setMessage('')
    try {
      const uploaded = await uploadCourseFile(selectedCourseId, file)
      await saveCourseAsset(selectedCourseId, {
        kind: inferAssetKind(file),
        name: uploaded.name,
        url: uploaded.url,
        path: uploaded.path,
        contentType: uploaded.contentType,
        size: uploaded.size,
        createdBy: user?.uid ?? null,
        ownerEmail: profile?.email ?? null,
      })
      await loadAssets(selectedCourseId)
      setMessage(`Uploaded "${file.name}".`)
    } catch (error) {
      setMessage(error.message || 'Upload failed.')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const handleAddLink = async (event) => {
    event.preventDefault()
    if (!linkTitle.trim() || !linkUrl.trim()) {
      return
    }

    try {
      await saveCourseAsset(selectedCourseId, {
        kind: 'link',
        name: linkTitle.trim(),
        url: linkUrl.trim(),
        createdBy: user?.uid ?? null,
        ownerEmail: profile?.email ?? null,
      })
      setLinkTitle('')
      setLinkUrl('')
      await loadAssets(selectedCourseId)
      setMessage('Link saved.')
    } catch (error) {
      setMessage(error.message || 'Could not save link.')
    }
  }

  const handleDelete = async (asset) => {
    if (!window.confirm('Remove this asset from the course?')) {
      return
    }

    setUploading(true)
    setMessage('')
    try {
      await deleteCourseAsset(selectedCourseId, asset.id)
      await loadAssets(selectedCourseId)
      setMessage('Asset removed.')
    } catch (error) {
      setMessage(error.message || 'Could not remove asset. Try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Course Assets</h1>
          <p className="mt-2 text-slate-600">Upload PDFs, videos, and attach external links to a course.</p>
        </div>
        <Link to="/teacher" className="text-sm text-blue-600 hover:underline">
          ← Teacher Dashboard
        </Link>
      </div>

      {message && (
        <p className="mt-4 rounded bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>
      )}

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <label htmlFor="asset-course" className="block text-sm font-medium text-slate-700">
          Course
        </label>
        <select
          id="asset-course"
          value={selectedCourseId}
          onChange={(event) => setSelectedCourseId(event.target.value)}
          className="mt-1 rounded border border-slate-300 px-3 py-2"
        >
          {courseIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>

        <div className="mt-6">
          <label className="block text-sm font-medium text-slate-700">Upload file</label>
          <input
            type="file"
            accept=".pdf,video/*,image/*"
            disabled={uploading}
            onChange={handleUpload}
            className="mt-2 block text-sm"
          />
        </div>

        <form onSubmit={handleAddLink} className="mt-6 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Link title"
            value={linkTitle}
            onChange={(event) => setLinkTitle(event.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="url"
            placeholder="https://…"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            className="min-w-[16rem] flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add link
          </button>
        </form>
      </section>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Assets ({assets.length})</h2>
        {assets.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No assets yet for this course.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {assets.map((asset) => (
              <li
                key={asset.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 px-3 py-2 text-sm"
              >
                <div>
                  <span className="mr-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs uppercase">
                    {asset.kind}
                  </span>
                  <a href={asset.url} target="_blank" rel="noreferrer" className="font-medium text-blue-700">
                    {asset.name}
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(asset)}
                  disabled={uploading}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default CourseAssets
