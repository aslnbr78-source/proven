import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { courses as bundledCourses } from '../data/courses'
import { useAuth } from '../context/AuthContext'
import { listFirestoreCourses } from '../services/courseFirestore'
import { getAllStudentProgress } from '../services/progressService'
import { listStudents } from '../services/userAdminService'
import { flattenModules, fetchCourseOutline } from '../services/contentLoader'
import { listAllFinalTestSessionsForCourse } from '../services/finalTestService'
import { downloadCsv, formatFirestoreTimestamp, formatScorePercent } from '../utils/exportCsv'
import { ROLES } from '../utils/roles'

function ReportingDashboard({ adminView = false }) {
  const { role } = useAuth()
  const [searchParams] = useSearchParams()
  const [students, setStudents] = useState([])
  const [progressRows, setProgressRows] = useState([])
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [moduleTitles, setModuleTitles] = useState({})
  const [finalTestModules, setFinalTestModules] = useState([])
  const [selectedFinalTestId, setSelectedFinalTestId] = useState('')
  const [finalTestSessions, setFinalTestSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [studentRows, progress, firestoreCourses] = await Promise.all([
          listStudents(),
          getAllStudentProgress(),
          listFirestoreCourses(),
        ])
        setStudents(studentRows)
        setProgressRows(progress)

        const courseMap = new Map()
        bundledCourses.forEach((course) => courseMap.set(course.id, course))
        firestoreCourses
          .filter((course) => course.published)
          .forEach((course) => courseMap.set(course.id, course))
        const merged = [...courseMap.values()]
        setCourses(merged)
        if (merged.length > 0) {
          setSelectedCourseId(merged[0].id)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    const courseFromQuery = searchParams.get('course')
    const testFromQuery = searchParams.get('test')
    if (courseFromQuery) {
      setSelectedCourseId(courseFromQuery)
    }
    if (testFromQuery) {
      setSelectedFinalTestId(testFromQuery)
    }
  }, [searchParams])

  useEffect(() => {
    if (!selectedCourseId) {
      return
    }

    fetchCourseOutline(selectedCourseId)
      .then((outline) => {
        const titles = {}
        const tests = []
        flattenModules(outline).forEach((module) => {
          titles[module.id] = module.title
          if (module.type === 'final-test') {
            tests.push({ id: module.id, title: module.title })
          }
        })
        setModuleTitles(titles)
        setFinalTestModules(tests)
        setSelectedFinalTestId('')

        return listAllFinalTestSessionsForCourse(
          selectedCourseId,
          tests.map((item) => item.id),
        )
      })
      .then((sessions) => {
        if (sessions) {
          setFinalTestSessions(sessions)
        }
      })
      .catch(() => {
        setModuleTitles({})
        setFinalTestModules([])
        setSelectedFinalTestId('')
        setFinalTestSessions([])
      })
  }, [selectedCourseId])

  const gradebook = useMemo(() => {
    if (!selectedCourseId) {
      return []
    }

    return students.map((student) => {
      const completed = progressRows.filter(
        (row) => row.uid === student.uid && row.courseId === selectedCourseId && row.completed,
      )
      return {
        uid: student.uid,
        name: student.displayName || student.email || student.uid,
        email: student.email ?? '',
        completedCount: completed.length,
        modules: completed.map((row) => row.moduleId),
      }
    })
  }, [students, progressRows, selectedCourseId])

  const filteredFinalTestSessions = useMemo(() => {
    if (!selectedFinalTestId) {
      return finalTestSessions
    }
    return finalTestSessions.filter((session) => session.moduleId === selectedFinalTestId)
  }, [finalTestSessions, selectedFinalTestId])

  const sessionsWithAttemptNumbers = useMemo(() => {
    const attemptMap = new Map()

    const sorted = [...filteredFinalTestSessions].sort((a, b) => {
      const aTime = a.startedAt?.seconds ?? 0
      const bTime = b.startedAt?.seconds ?? 0
      return aTime - bTime
    })

    return sorted
      .map((session) => {
        const key = `${session.uid}:${session.moduleId}`
        const attemptNumber = (attemptMap.get(key) ?? 0) + 1
        attemptMap.set(key, attemptNumber)
        return { ...session, attemptNumber }
      })
      .sort((a, b) => (b.startedAt?.seconds ?? 0) - (a.startedAt?.seconds ?? 0))
  }, [filteredFinalTestSessions])

  const exportGradebook = () => {
    const header = ['Name', 'Email', 'Modules Completed', 'Module IDs']
    const rows = gradebook.map((row) => [
      row.name,
      row.email,
      row.completedCount,
      row.modules.join('; '),
    ])
    downloadCsv(`gradebook-${selectedCourseId}.csv`, [header, ...rows])
  }

  const exportRoster = () => {
    const header = ['Name', 'Email', 'Role']
    const rows = students.map((student) => [
      student.displayName ?? '',
      student.email ?? '',
      student.role ?? ROLES.STUDENT,
    ])
    downloadCsv('student-roster.csv', [header, ...rows])
  }

  const exportFinalTestReport = () => {
    const header = [
      'Student Name',
      'Student Email',
      'Test',
      'Attempt',
      'Score',
      'Score Percent',
      'Questions Correct',
      'Questions Total',
      'Time Used (sec)',
      'Time Limit (sec)',
      'Fullscreen Exits',
      'Tab Switches',
      'Copy Attempts',
      'Status',
      'Started',
      'Ended',
    ]
    const rows = sessionsWithAttemptNumbers.map((session) => [
      session.studentName || session.uid,
      session.studentEmail ?? '',
      moduleTitles[session.moduleId] ?? session.moduleTitle ?? session.moduleId,
      session.attemptNumber,
      session.scoreCorrect != null ? `${session.scoreCorrect}/${session.scoreTotal}` : '',
      formatScorePercent(session.scoreCorrect, session.scoreTotal),
      session.scoreCorrect ?? '',
      session.scoreTotal ?? '',
      session.elapsedSeconds ?? '',
      session.timeLimitSeconds ?? '',
      session.fullscreenExits ?? 0,
      session.tabSwitches ?? 0,
      session.copyAttempts ?? 0,
      session.status ?? '',
      formatFirestoreTimestamp(session.startedAt),
      formatFirestoreTimestamp(session.endedAt),
    ])
    const suffix = selectedFinalTestId ? `-${selectedFinalTestId}` : ''
    downloadCsv(`final-tests-${selectedCourseId}${suffix}.csv`, [header, ...rows])
  }

  const backPath = adminView || role === ROLES.ADMIN ? '/admin' : '/teacher'

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Reports & Gradebook</h1>
          <p className="mt-2 text-slate-600">
            Student roster, module completion, and final test proctoring data. Export CSV files
            open directly in Excel.
          </p>
        </div>
        <Link to={backPath} className="text-sm text-blue-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={exportRoster}
          className="rounded border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50"
        >
          Export roster (CSV)
        </button>
        <button
          type="button"
          onClick={exportGradebook}
          disabled={!selectedCourseId}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Export gradebook (CSV)
        </button>
        <button
          type="button"
          onClick={exportFinalTestReport}
          disabled={!selectedCourseId || sessionsWithAttemptNumbers.length === 0}
          className="rounded border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800 hover:bg-rose-100 disabled:opacity-50"
        >
          Export final test report (CSV / Excel)
        </button>
      </div>

      {loading ? (
        <p className="mt-8 text-slate-500">Loading reports…</p>
      ) : (
        <>
          <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Roster ({students.length} students)</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.uid} className="border-b border-slate-100">
                      <td className="py-2 pr-4">{student.displayName ?? '—'}</td>
                      <td className="py-2 pr-4">{student.email ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-end gap-4">
              <h2 className="text-lg font-semibold">Gradebook</h2>
              <select
                value={selectedCourseId}
                onChange={(event) => setSelectedCourseId(event.target.value)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm"
              >
                {courses.length === 0 && <option value="">No courses</option>}
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2 pr-4">Student</th>
                    <th className="py-2 pr-4">Completed</th>
                    <th className="py-2 pr-4">Modules</th>
                  </tr>
                </thead>
                <tbody>
                  {gradebook.map((row) => (
                    <tr key={row.uid} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-4">
                        <p className="font-medium">{row.name}</p>
                        <p className="text-xs text-slate-500">{row.email}</p>
                      </td>
                      <td className="py-2 pr-4">{row.completedCount}</td>
                      <td className="py-2 pr-4 text-xs text-slate-600">
                        {row.modules.length === 0
                          ? '—'
                          : row.modules
                              .map((moduleId) => moduleTitles[moduleId] ?? moduleId)
                              .join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8 rounded-lg border border-rose-200 bg-rose-50/30 p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-rose-900">
                  Final test proctoring ({sessionsWithAttemptNumbers.length})
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Scores, timer, fullscreen exits, tab switches, and copy attempts per attempt.
                </p>
              </div>
              <select
                value={selectedFinalTestId}
                onChange={(event) => setSelectedFinalTestId(event.target.value)}
                className="rounded border border-rose-200 bg-white px-3 py-1.5 text-sm"
              >
                <option value="">All final tests</option>
                {finalTestModules.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2 pr-4">Student</th>
                    <th className="py-2 pr-4">Test</th>
                    <th className="py-2 pr-4">Attempt</th>
                    <th className="py-2 pr-4">Score</th>
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">Fullscreen exits</th>
                    <th className="py-2 pr-4">Tab switches</th>
                    <th className="py-2 pr-4">Copy attempts</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Started</th>
                    <th className="py-2 pr-4">Ended</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionsWithAttemptNumbers.length === 0 && (
                    <tr>
                      <td colSpan={11} className="py-4 text-slate-500">
                        No final test sessions recorded yet.
                      </td>
                    </tr>
                  )}
                  {sessionsWithAttemptNumbers.map((session) => (
                    <tr key={session.id} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-4">
                        <p className="font-medium">{session.studentName || session.uid}</p>
                        <p className="text-xs text-slate-500">{session.studentEmail}</p>
                      </td>
                      <td className="py-2 pr-4">
                        {moduleTitles[session.moduleId] ?? session.moduleTitle ?? session.moduleId}
                      </td>
                      <td className="py-2 pr-4">{session.attemptNumber}</td>
                      <td className="py-2 pr-4">
                        {session.scoreCorrect != null
                          ? `${session.scoreCorrect}/${session.scoreTotal} (${formatScorePercent(session.scoreCorrect, session.scoreTotal)})`
                          : '—'}
                      </td>
                      <td className="py-2 pr-4">
                        {session.elapsedSeconds ?? 0}s / {session.timeLimitSeconds ?? '—'}s
                      </td>
                      <td className="py-2 pr-4">{session.fullscreenExits ?? 0}</td>
                      <td className="py-2 pr-4">{session.tabSwitches ?? 0}</td>
                      <td className="py-2 pr-4">{session.copyAttempts ?? 0}</td>
                      <td className="py-2 pr-4 capitalize">{session.status ?? '—'}</td>
                      <td className="py-2 pr-4 text-xs">
                        {formatFirestoreTimestamp(session.startedAt) || '—'}
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {formatFirestoreTimestamp(session.endedAt) || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

export default ReportingDashboard
