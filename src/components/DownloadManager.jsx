import { useEffect, useMemo, useState } from 'react'
import { fetchCourseOutline } from '../services/contentLoader'
import { listCourseAssets } from '../services/courseFirestore'
import { flattenMaterials } from '../utils/courseOutline'
import { openFormulaCheatSheet } from '../utils/formulaCheatSheet'

function DownloadManager({ courseId, courseTitle }) {
  const [firestoreAssets, setFirestoreAssets] = useState([])
  const [outlineMaterials, setOutlineMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!courseId) {
      return
    }
    setLoading(true)

    Promise.all([
      listCourseAssets(courseId).catch(() => []),
      fetchCourseOutline(courseId)
        .then((outline) => flattenMaterials(outline))
        .catch(() => []),
    ])
      .then(([assets, materials]) => {
        setFirestoreAssets(assets)
        setOutlineMaterials(materials)
      })
      .finally(() => setLoading(false))
  }, [courseId])

  const downloads = useMemo(() => {
    const seen = new Set()
    const rows = []

    const add = (item) => {
      const key = item.url || item.id
      if (!key || seen.has(key)) {
        return
      }
      seen.add(key)
      rows.push(item)
    }

    outlineMaterials.forEach((material) =>
      add({
        id: material.id,
        kind: material.kind ?? 'file',
        name: material.title,
        url: material.url,
        subchapterTitle: material.subchapterTitle,
      }),
    )

    firestoreAssets.forEach((asset) =>
      add({
        id: asset.id,
        kind: asset.kind,
        name: asset.name,
        url: asset.url,
      }),
    )

    return rows
  }, [outlineMaterials, firestoreAssets])

  const handleCheatSheet = () => {
    const opened = openFormulaCheatSheet(courseId, courseTitle)
    if (!opened) {
      setMessage('Allow pop-ups to print the formula sheet.')
    }
  }

  return (
    <div className="card-modern !p-4">
      <h3 className="font-bold text-slate-900">Downloads</h3>
      <p className="mt-1 text-xs text-slate-500">Printables, PDFs, links, and course files</p>

      {message && <p className="mt-2 text-xs text-amber-700">{message}</p>}

      <ul className="mt-3 space-y-2">
        <li>
          <button
            type="button"
            onClick={handleCheatSheet}
            className="flex w-full items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-left text-sm text-indigo-900 hover:bg-indigo-100"
          >
            <span aria-hidden="true">📄</span>
            <span>
              <span className="font-semibold">Formula cheat sheet</span>
              <span className="block text-xs text-indigo-700">Print-ready reference page</span>
            </span>
          </button>
        </li>

        {loading && <li className="text-xs text-slate-500">Loading…</li>}

        {!loading && downloads.length === 0 && (
          <li className="text-xs text-slate-500">No files or links for this course yet.</li>
        )}

        {downloads.map((asset) => (
          <li key={asset.id}>
            <a
              href={asset.url}
              target="_blank"
              rel="noreferrer"
              download={asset.kind !== 'link' ? asset.name : undefined}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 no-underline hover:bg-slate-50"
            >
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold uppercase">
                {asset.kind}
              </span>
              <span>
                <span className="font-medium">{asset.name}</span>
                {asset.subchapterTitle && (
                  <span className="block text-xs text-slate-400">{asset.subchapterTitle}</span>
                )}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default DownloadManager
