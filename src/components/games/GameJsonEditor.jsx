import { useEffect, useState } from 'react'
import { loadGameModuleAsync } from '../../data/mathGames'
import { saveDraftGameImport } from '../../services/gameCatalogStore'
import { toExportableGame } from '../../utils/gameExport'
import { parseModuleJson } from '../../utils/validateContent'
import ValidationFeedback from '../courseEditor/ValidationFeedback'

function GameJsonEditor({
  courseId,
  gameId,
  gameTitle,
  courseTitle,
  courseDescription,
  onSaved,
  onClose,
}) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState([])
  const [warnings, setWarnings] = useState([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErrors([])
    setWarnings([])
    setMessage('')

    loadGameModuleAsync(courseId, gameId, { includeDraft: true })
      .then((data) => {
        if (!cancelled) {
          setText(JSON.stringify(toExportableGame(data, { courseId, gameId }), null, 2))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setText('')
          setErrors(['Could not load game JSON.'])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [courseId, gameId])

  const handleSave = async () => {
    const result = parseModuleJson(text)
    if (!result.valid) {
      setErrors(result.errors)
      setWarnings(result.warnings ?? [])
      setMessage('')
      return
    }

    if (result.data.type !== 'math-game') {
      setErrors(['Game JSON must have type "math-game".'])
      setWarnings([])
      setMessage('')
      return
    }

    if (result.data.id !== gameId) {
      setErrors([`Game id must stay "${gameId}" when editing in place.`])
      setWarnings([])
      setMessage('')
      return
    }

    setBusy(true)
    try {
      const payload = { ...result.data, courseId }
      await saveDraftGameImport(courseId, payload, {
        title: courseTitle,
        description: courseDescription,
      })
      setErrors([])
      setWarnings(result.warnings ?? [])
      setMessage(
        result.warnings?.length
          ? 'Game JSON saved to local draft with warnings — review amber items above. Publish to Hub when ready.'
          : 'Game JSON saved to local draft. Publish to Hub when ready.',
      )
      onSaved?.(payload)
    } catch (error) {
      setErrors([error?.message || 'Could not save game draft.'])
      setMessage('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="module-json-editor mt-4 border-t border-slate-200 pt-4">
      <div className="module-json-editor-header">
        <div>
          <p className="module-json-editor-title">Edit game JSON</p>
          <p className="module-json-editor-subtitle">{gameTitle}</p>
        </div>
        <button type="button" onClick={onClose} className="course-editor-text-btn">
          Close editor
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading JSON…</p>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setErrors([])
              setWarnings([])
              setMessage('')
            }}
            rows={16}
            className="input-modern mt-3 w-full font-mono text-xs"
            spellCheck={false}
          />
          <ValidationFeedback errors={errors} warnings={warnings} />
          {message ? <p className="mt-2 text-sm font-medium text-emerald-700">{message}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy}
              className="btn-primary !py-1.5 !text-sm disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Validate & save'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default GameJsonEditor
