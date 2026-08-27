import { useMemo, useState } from 'react'
import { summarizeModule } from '../../utils/moduleImport'
import { parseModuleJson } from '../../utils/validateContent'
import ValidationFeedback from '../courseEditor/ValidationFeedback'

function GameJsonImport({ courseId, courseTitle, disabled = false, onImported, onClose }) {
  const [text, setText] = useState('')
  const [localErrors, setLocalErrors] = useState([])
  const [busy, setBusy] = useState(false)

  const preview = useMemo(() => {
    if (!text.trim()) {
      return null
    }
    return parseModuleJson(text)
  }, [text])

  const finishImport = async (moduleData) => {
    if (moduleData.type !== 'math-game') {
      setLocalErrors(['Imported JSON must have type "math-game".'])
      return false
    }
    setBusy(true)
    try {
      const result = await onImported?.(moduleData)
      if (result?.ok === false) {
        setLocalErrors([result.error || 'Import failed.'])
        return false
      }
      setText('')
      setLocalErrors([])
      onClose?.()
      return true
    } catch (error) {
      setLocalErrors([error?.message || 'Import failed unexpectedly.'])
      return false
    } finally {
      setBusy(false)
    }
  }

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    const reader = new FileReader()
    reader.onload = (loadEvent) => {
      const nextText = String(loadEvent.target?.result ?? '')
      setText(nextText)
      setLocalErrors([])
      const result = parseModuleJson(nextText)
      if (result.valid && result.data) {
        void finishImport(result.data)
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const errors =
    localErrors.length > 0
      ? localErrors
      : preview && !preview.valid
        ? preview.errors
        : []
  const warnings = preview?.warnings ?? []

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">Import math-game JSON</p>
          <p className="mt-1 text-sm text-slate-600">
            Into <strong>{courseTitle}</strong> ({courseId}). Arcade games:{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">docs/GAME_BUILDER_PROMPT.md</code>
            . Chapter concept games:{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">docs/CHAPTER_CONCEPT_GAME_PROMPT.md</code>
            .
          </p>
        </div>
        <button type="button" className="btn-secondary !py-1.5 !text-sm" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="mt-3">
        <a
          href="/templates/math-game.template.json"
          download="math-game.template.json"
          className="text-sm font-semibold text-indigo-700 no-underline hover:underline"
        >
          Download template →
        </a>
      </p>

      <label className="mt-4 block">
        <span className="text-sm font-semibold text-slate-700">Upload JSON file</span>
        <input
          type="file"
          accept=".json,application/json"
          disabled={disabled || busy}
          onChange={handleFileUpload}
          className="mt-1 block w-full text-sm"
        />
      </label>

      <textarea
        value={text}
        disabled={disabled || busy}
        onChange={(event) => {
          setText(event.target.value)
          setLocalErrors([])
        }}
        rows={10}
        className="input-modern mt-3 w-full font-mono text-sm"
        placeholder='Paste math-game JSON — markdown ```json fences are OK…'
        spellCheck={false}
      />

      {preview?.valid && preview.data ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Math game</p>
          <p className="mt-1 font-semibold text-slate-900">{preview.data.title}</p>
          <p className="text-xs text-slate-500">
            ID: <code>{preview.data.id}</code>
            {preview.data.courseId ? (
              <>
                {' · '}courseId: <code>{preview.data.courseId}</code>
              </>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-slate-600">{summarizeModule(preview.data)}</p>
        </div>
      ) : null}

      <ValidationFeedback errors={errors} warnings={warnings} />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary !py-1.5 !text-sm"
          disabled={disabled || busy || !preview?.valid || preview.data?.type !== 'math-game'}
          onClick={() => void finishImport(preview.data)}
        >
          {busy ? 'Importing…' : 'Import to draft'}
        </button>
      </div>
    </div>
  )
}

export default GameJsonImport
