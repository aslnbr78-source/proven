import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listStudents } from '../services/userAdminService'
import {
  getFinalTestConfig,
  getFinalTestOptions,
  grantFinalTestPermission,
  revokeFinalTestPermission,
  saveFinalTestOptions,
  setFinalTestPasscode,
} from '../services/finalTestService'
import { getModuleAiOptions, saveModuleAiOptions } from '../services/aiInsightsService'

const MIN_PASSCODE_LENGTH = 6

function formatExpiry(date) {
  if (!date) {
    return ''
  }
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function FinalTestControl({ courseId, moduleId, moduleTitle }) {
  const { user } = useAuth()
  const [accessMode, setAccessMode] = useState('either')
  const [passcode, setPasscode] = useState('')
  const [passcodeValidMinutes, setPasscodeValidMinutes] = useState('60')
  const [passcodeSet, setPasscodeSet] = useState(false)
  const [passcodeExpiresAt, setPasscodeExpiresAt] = useState(null)
  const [allowAiAssistant, setAllowAiAssistant] = useState(false)
  const [finalTestHintOnly, setFinalTestHintOnly] = useState(true)
  const [finalTestAllowFullAnswers, setFinalTestAllowFullAnswers] = useState(false)
  const [maxAttempts, setMaxAttempts] = useState('1')
  const [studentMaxAttempts, setStudentMaxAttempts] = useState('')
  const [students, setStudents] = useState([])
  const [selectedStudentUid, setSelectedStudentUid] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([
      getFinalTestConfig(courseId, moduleId),
      getFinalTestOptions(courseId, moduleId),
      getModuleAiOptions(courseId, moduleId),
    ]).then(([config, options, moduleAi]) => {
      setAccessMode(options?.accessMode ?? config?.accessMode ?? 'either')
      setPasscodeSet(Boolean(config?.passcodeSet))
      setPasscodeExpiresAt(config?.passcodeExpiresAt ?? null)
      setAllowAiAssistant(Boolean(options?.allowAiAssistant))
      setMaxAttempts(String(options?.maxAttempts ?? 1))
      setFinalTestHintOnly(moduleAi.finalTestHintOnly)
      setFinalTestAllowFullAnswers(moduleAi.finalTestAllowFullAnswers)
    })
    listStudents().then(setStudents).catch(() => setStudents([]))
  }, [courseId, moduleId])

  const passcodeExpired = passcodeExpiresAt ? Date.now() > passcodeExpiresAt.getTime() : false

  const handleSavePasscode = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    const trimmedPasscode = passcode.trim()
    const minutes = Number(passcodeValidMinutes)
    const attempts = Number(maxAttempts)

    if (trimmedPasscode && (!Number.isFinite(minutes) || minutes <= 0)) {
      setMessage('Enter how many minutes the passcode should stay valid.')
      setBusy(false)
      return
    }

    if (trimmedPasscode && trimmedPasscode.length < MIN_PASSCODE_LENGTH) {
      setMessage(`Passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`)
      setBusy(false)
      return
    }

    if (!Number.isFinite(attempts) || attempts <= 0) {
      setMessage('Enter how many attempts each student may take.')
      setBusy(false)
      return
    }

    try {
      await Promise.all([
        setFinalTestPasscode({
          courseId,
          moduleId,
          passcode: trimmedPasscode,
          accessMode,
          passcodeValidMinutes: trimmedPasscode ? minutes : undefined,
        }),
        saveFinalTestOptions({
          courseId,
          moduleId,
          allowAiAssistant,
          maxAttempts: attempts,
          accessMode,
        }),
        saveModuleAiOptions({
          courseId,
          moduleId,
          patch: { finalTestHintOnly, finalTestAllowFullAnswers },
        }),
      ])
      if (trimmedPasscode) {
        setPasscodeSet(true)
        setPasscodeExpiresAt(new Date(Date.now() + minutes * 60 * 1000))
        setPasscode('')
      }
      setMessage('Final test settings saved.')
    } catch (error) {
      setMessage(error.message || 'Could not save settings.')
    } finally {
      setBusy(false)
    }
  }

  const handleGrant = async () => {
    if (!selectedStudentUid) {
      return
    }
    setBusy(true)
    try {
      await grantFinalTestPermission({
        courseId,
        moduleId,
        studentUid: selectedStudentUid,
        teacherUid: user?.uid,
        maxAttempts: studentMaxAttempts.trim() ? Number(studentMaxAttempts) : undefined,
      })
      setMessage('Student granted access.')
    } catch (error) {
      setMessage(error.message || 'Grant failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleRevoke = async () => {
    if (!selectedStudentUid) {
      return
    }
    setBusy(true)
    try {
      await revokeFinalTestPermission(courseId, moduleId, selectedStudentUid)
      setMessage('Student access revoked.')
    } catch (error) {
      setMessage(error.message || 'Revoke failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card-modern !p-4">
      <h3 className="font-bold text-rose-900">Final test controls</h3>
      <p className="mt-1 text-xs text-slate-600">{moduleTitle}</p>

      {message && (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{message}</p>
      )}

      <form onSubmit={handleSavePasscode} className="mt-4 space-y-3">
        <div>
          <label htmlFor="access-mode" className="block text-xs font-semibold text-slate-700">
            Access mode
          </label>
          <select
            id="access-mode"
            value={accessMode}
            onChange={(e) => setAccessMode(e.target.value)}
            className="input-modern mt-1 w-full !py-1.5 text-sm"
          >
            <option value="either">Passcode or teacher grant</option>
            <option value="passcode">Passcode only</option>
            <option value="teacher">Teacher grant only</option>
          </select>
        </div>

        <div>
          <label htmlFor="ft-passcode" className="block text-xs font-semibold text-slate-700">
            {passcodeSet ? 'Set new passcode' : 'Passcode'}
          </label>
          <input
            id="ft-passcode"
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder={passcodeSet ? 'Enter new passcode' : 'Create passcode'}
            minLength={MIN_PASSCODE_LENGTH}
            className="input-modern mt-1 w-full !py-1.5 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            Use at least {MIN_PASSCODE_LENGTH} characters to resist guessing.
          </p>
        </div>

        <div>
          <label htmlFor="ft-passcode-minutes" className="block text-xs font-semibold text-slate-700">
            Passcode valid for (minutes)
          </label>
          <input
            id="ft-passcode-minutes"
            type="number"
            min="1"
            step="1"
            value={passcodeValidMinutes}
            onChange={(e) => setPasscodeValidMinutes(e.target.value)}
            placeholder="60"
            className="input-modern mt-1 w-full !py-1.5 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            After this time, the passcode stops working. Set a new passcode to open access again.
          </p>
        </div>

        {passcodeSet && passcodeExpiresAt && (
          <p
            className={`rounded-lg px-3 py-2 text-xs ${
              passcodeExpired
                ? 'bg-rose-50 text-rose-800'
                : 'bg-slate-50 text-slate-700'
            }`}
          >
            {passcodeExpired
              ? `Passcode expired on ${formatExpiry(passcodeExpiresAt)}.`
              : `Passcode active until ${formatExpiry(passcodeExpiresAt)}.`}
          </p>
        )}

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <input
            type="checkbox"
            checked={allowAiAssistant}
            onChange={(e) => setAllowAiAssistant(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-xs leading-relaxed text-slate-700">
            <span className="font-semibold text-slate-900">Allow AI assistant during test</span>
            <span className="mt-0.5 block text-slate-500">
              Opens inside the fullscreen test as a floating tutor panel.
            </span>
          </span>
        </label>

        {allowAiAssistant && (
          <>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <input
                type="checkbox"
                checked={finalTestHintOnly}
                onChange={(e) => setFinalTestHintOnly(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-xs leading-relaxed text-slate-700">
                <span className="font-semibold text-slate-900">Hint-only AI during test</span>
                <span className="mt-0.5 block text-slate-500">
                  Tutor gives hints only — no final answers during the proctored test.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <input
                type="checkbox"
                checked={finalTestAllowFullAnswers}
                onChange={(e) => setFinalTestAllowFullAnswers(e.target.checked)}
                disabled={!finalTestHintOnly}
                className="mt-0.5"
              />
              <span className="text-xs leading-relaxed text-slate-700">
                <span className="font-semibold text-slate-900">Allow full AI explanations on test</span>
              </span>
            </label>
          </>
        )}

        <div>
          <label htmlFor="ft-max-attempts" className="block text-xs font-semibold text-slate-700">
            Attempts allowed per student
          </label>
          <input
            id="ft-max-attempts"
            type="number"
            min="1"
            step="1"
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(e.target.value)}
            className="input-modern mt-1 w-full !py-1.5 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            Each started test counts as one attempt. Signed-in students are tracked by account.
          </p>
        </div>

        <button type="submit" disabled={busy} className="btn-primary !py-1.5 !text-xs">
          Save test settings
        </button>
      </form>

      <p className="mt-3 text-xs">
        <Link
          to={`/teacher/reports?course=${courseId}&test=${moduleId}`}
          className="font-medium text-indigo-700 hover:underline"
        >
          View proctoring report & export →
        </Link>
        {' · '}
        <Link
          to={`/teacher/ai-insights?course=${courseId}`}
          className="font-medium text-indigo-700 hover:underline"
        >
          View AI tutor insights →
        </Link>
      </p>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <label htmlFor="grant-student" className="block text-xs font-semibold text-slate-700">
          Grant student access
        </label>
        <select
          id="grant-student"
          value={selectedStudentUid}
          onChange={(e) => setSelectedStudentUid(e.target.value)}
          className="input-modern mt-1 w-full !py-1.5 text-sm"
        >
          <option value="">Select student…</option>
          {students.map((student) => (
            <option key={student.uid} value={student.uid}>
              {student.displayName || student.email || student.uid}
            </option>
          ))}
        </select>
        <div className="mt-2">
          <label htmlFor="student-max-attempts" className="block text-xs text-slate-600">
            Max attempts for this student (optional override)
          </label>
          <input
            id="student-max-attempts"
            type="number"
            min="1"
            step="1"
            value={studentMaxAttempts}
            onChange={(e) => setStudentMaxAttempts(e.target.value)}
            placeholder="Uses test default if blank"
            className="input-modern mt-1 w-full !py-1.5 text-sm"
          />
        </div>
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={busy || !selectedStudentUid} onClick={handleGrant} className="btn-secondary !py-1 !text-xs">
            Grant
          </button>
          <button type="button" disabled={busy || !selectedStudentUid} onClick={handleRevoke} className="rounded-lg border border-rose-200 px-3 py-1 text-xs text-rose-700">
            Revoke
          </button>
        </div>
      </div>
    </div>
  )
}

export default FinalTestControl
