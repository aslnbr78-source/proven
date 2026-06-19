import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { courses as bundledCourses } from '../data/courses'
import { listFirestoreCourses } from '../services/courseFirestore'
import { fetchCourseOutline, flattenModules } from '../services/contentLoader'
import {
  aggregateCourseMisconceptions,
  fetchCourseTutorInsights,
  summarizeStudentTutorActivity,
  updateTutorReviewStatus,
} from '../services/aiInsightsService'
import { formatFirestoreTimestamp } from '../utils/exportCsv'

const CONTEXT_LABELS = {
  lesson: 'Lesson',
  quiz: 'Quiz',
  'final-test': 'Final test',
}

function SortHeader({ label, sortKey, activeKey, direction, onSort }) {
  const active = activeKey === sortKey
  return (
    <th className="py-2 pr-4">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="font-medium text-slate-500 hover:text-slate-800"
      >
        {label}
        {active && <span className="ml-1">{direction === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  )
}

function sortStudents(rows, sortKey, direction) {
  const factor = direction === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => {
    if (sortKey === 'student') {
      const aLabel = (a.studentName || a.studentEmail || a.uid).toLowerCase()
      const bLabel = (b.studentName || b.studentEmail || b.uid).toLowerCase()
      return aLabel.localeCompare(bLabel) * factor
    }

    if (sortKey === 'lastActive') {
      return ((a.lastActiveMillis ?? 0) - (b.lastActiveMillis ?? 0)) * factor
    }

    return ((a[sortKey] ?? 0) - (b[sortKey] ?? 0)) * factor
  })
}

function AIInsightsDashboard({ adminView = false }) {
  const [searchParams] = useSearchParams()
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [moduleTitles, setModuleTitles] = useState({})
  const [misconceptions, setMisconceptions] = useState([])
  const [tutorChallenges, setTutorChallenges] = useState([])
  const [studentInsights, setStudentInsights] = useState([])
  const [tutorActivity, setTutorActivity] = useState([])
  const [reviewQueue, setReviewQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [message, setMessage] = useState('')
  const [tutorView, setTutorView] = useState('student')
  const [studentSortKey, setStudentSortKey] = useState('messageCount')
  const [studentSortDir, setStudentSortDir] = useState('desc')
  const [selectedStudentUid, setSelectedStudentUid] = useState('')
  const [aiSummary, setAiSummary] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryMeta, setSummaryMeta] = useState(null)

  useEffect(() => {
    listFirestoreCourses().then((firestoreCourses) => {
      const courseMap = new Map()
      bundledCourses.forEach((course) => courseMap.set(course.id, course))
      firestoreCourses.forEach((course) => courseMap.set(course.id, course))
      const merged = [...courseMap.values()]
      setCourses(merged)

      const courseFromUrl = searchParams.get('course')
      if (courseFromUrl && merged.some((course) => course.id === courseFromUrl)) {
        setSelectedCourseId(courseFromUrl)
      } else if (merged.length > 0) {
        setSelectedCourseId(merged[0].id)
      }
      setLoading(false)
    })
  }, [searchParams])

  useEffect(() => {
    if (!selectedCourseId) {
      return
    }

    setLoadError('')
    setSelectedStudentUid('')
    setAiSummary('')
    setSummaryMeta(null)

    fetchCourseOutline(selectedCourseId)
      .then((outline) => {
        const titles = {}
        flattenModules(outline).forEach((module) => {
          titles[module.id] = module.title
        })
        setModuleTitles(titles)
        return Promise.all([
          aggregateCourseMisconceptions(selectedCourseId, titles).catch((error) => {
            console.warn('misconceptions load failed', error)
            return []
          }),
          fetchCourseTutorInsights(selectedCourseId, titles),
        ])
      })
      .then(([misconceptionRows, tutorInsights]) => {
        setMisconceptions(misconceptionRows)
        setTutorChallenges(tutorInsights.tutorChallenges ?? [])
        setStudentInsights(tutorInsights.studentInsights ?? [])
        setTutorActivity(tutorInsights.tutorActivity ?? [])
        setReviewQueue(tutorInsights.reviewQueue ?? [])
        if (tutorInsights.loadError) {
          setLoadError(tutorInsights.loadError)
        }
      })
      .catch((error) => {
        console.warn('AI insights load failed', error)
        setMisconceptions([])
        setTutorChallenges([])
        setStudentInsights([])
        setTutorActivity([])
        setReviewQueue([])
        setLoadError(error?.message ?? 'Could not load AI insights for this course.')
      })
  }, [selectedCourseId])

  const sortedStudents = useMemo(
    () => sortStudents(studentInsights, studentSortKey, studentSortDir),
    [studentInsights, studentSortKey, studentSortDir],
  )

  const selectedStudent = useMemo(
    () => studentInsights.find((row) => row.uid === selectedStudentUid) ?? null,
    [studentInsights, selectedStudentUid],
  )

  const selectedStudentMessages = useMemo(() => {
    if (!selectedStudentUid) {
      return tutorActivity
    }
    return tutorActivity.filter((row) => row.uid === selectedStudentUid)
  }, [tutorActivity, selectedStudentUid])

  const handleStudentSort = (key) => {
    if (studentSortKey === key) {
      setStudentSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      return
    }
    setStudentSortKey(key)
    setStudentSortDir(key === 'student' ? 'asc' : 'desc')
  }

  const handleSelectStudent = (uid) => {
    setSelectedStudentUid(uid)
    setAiSummary('')
    setSummaryMeta(null)
  }

  const handleGenerateSummary = async (forceRefresh = false) => {
    if (!selectedStudentUid || !selectedCourseId) {
      return
    }

    setSummaryLoading(true)
    setMessage('')
    try {
      const result = await summarizeStudentTutorActivity({
        courseId: selectedCourseId,
        studentUid: selectedStudentUid,
        moduleTitles,
        forceRefresh,
      })
      setAiSummary(result.summary ?? '')
      setSummaryMeta({
        cached: Boolean(result.cached),
        messageCount: result.messageCount ?? 0,
        generatedAtMillis: result.generatedAtMillis ?? null,
      })
      setMessage(result.cached ? 'Loaded cached AI summary.' : 'AI summary generated.')
    } catch (error) {
      setAiSummary('')
      setSummaryMeta(null)
      setMessage(error.message ?? 'Could not generate summary.')
    } finally {
      setSummaryLoading(false)
    }
  }

  const handleReview = async (flagId, status) => {
    await updateTutorReviewStatus(selectedCourseId, flagId, status)
    setReviewQueue((rows) => rows.filter((row) => row.id !== flagId))
    setMessage(status === 'reviewed' ? 'Marked as reviewed.' : 'Flag dismissed.')
  }

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">AI Insights</h1>
          <p className="mt-2 text-slate-600">
            Wrong-answer patterns, per-student tutor activity, and AI-generated student reports.
          </p>
        </div>
        <Link to={adminView ? '/admin' : '/teacher'} className="text-sm text-blue-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <div className="mt-6">
        <label htmlFor="ai-course" className="block text-sm font-semibold text-slate-700">
          Course
        </label>
        <select
          id="ai-course"
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          className="input-modern mt-1 max-w-md"
        >
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
        </select>
      </div>

      {loadError && (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-800">{loadError}</p>
      )}

      {message && (
        <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{message}</p>
      )}

      {loading ? (
        <p className="mt-8 text-slate-500">Loading…</p>
      ) : (
        <>
          <section className="mt-8 rounded-lg border border-violet-200 bg-violet-50/30 p-6">
            <h2 className="text-lg font-semibold text-violet-900">Misconception reports</h2>
            <p className="mt-1 text-sm text-slate-600">
              Aggregated from wrong answers on quizzes, lessons, and final tests.
            </p>
            <div className="mt-4 space-y-4">
              {misconceptions.length === 0 && (
                <p className="text-sm text-slate-500">No misconception data yet for this course.</p>
              )}
              {misconceptions.map((row) => (
                <div key={row.moduleId} className="rounded-xl border border-violet-200 bg-white p-4">
                  <p className="font-semibold text-slate-900">
                    {moduleTitles[row.moduleId] ?? row.moduleTitle}
                  </p>
                  <p className="mt-1 text-sm text-violet-800">{row.summary}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.studentCount} students tracked · {row.lowMasteryCount} below 50% mastery
                  </p>
                  {row.topMisconceptions.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-slate-700">
                      {row.topMisconceptions.map((item) => (
                        <li key={item.label}>
                          <span className="font-medium">{item.count}×</span> {item.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-lg border border-blue-200 bg-blue-50/30 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-blue-900">Tutor insights</h2>
                <p className="mt-1 text-sm text-slate-600">
                  View by student, by module, or browse the full activity log.
                </p>
              </div>
              <div className="flex gap-2">
                {[
                  ['student', 'By student'],
                  ['module', 'By module'],
                  ['activity', 'All activity'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTutorView(id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      tutorView === id
                        ? 'bg-blue-600 text-white'
                        : 'border border-blue-200 bg-white text-blue-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {tutorView === 'student' && (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <SortHeader
                        label="Student"
                        sortKey="student"
                        activeKey={studentSortKey}
                        direction={studentSortDir}
                        onSort={handleStudentSort}
                      />
                      <SortHeader
                        label="Messages"
                        sortKey="messageCount"
                        activeKey={studentSortKey}
                        direction={studentSortDir}
                        onSort={handleStudentSort}
                      />
                      <SortHeader
                        label="Answer-seeking"
                        sortKey="answerSeekingCount"
                        activeKey={studentSortKey}
                        direction={studentSortDir}
                        onSort={handleStudentSort}
                      />
                      <SortHeader
                        label="Modules"
                        sortKey="moduleCount"
                        activeKey={studentSortKey}
                        direction={studentSortDir}
                        onSort={handleStudentSort}
                      />
                      <SortHeader
                        label="Last active"
                        sortKey="lastActive"
                        activeKey={studentSortKey}
                        direction={studentSortDir}
                        onSort={handleStudentSort}
                      />
                      <th className="py-2 pr-4">Summary</th>
                      <th className="py-2 pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStudents.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-4 text-slate-500">
                          No tutor activity yet for this course.
                        </td>
                      </tr>
                    )}
                    {sortedStudents.map((row) => (
                      <tr
                        key={row.uid}
                        className={`border-b border-slate-100 align-top ${
                          selectedStudentUid === row.uid ? 'bg-blue-50/80' : ''
                        }`}
                      >
                        <td className="py-2 pr-4">
                          <p className="font-medium">{row.studentName || row.uid}</p>
                          <p className="text-xs text-slate-500">{row.studentEmail}</p>
                        </td>
                        <td className="py-2 pr-4">{row.messageCount}</td>
                        <td className="py-2 pr-4">{row.answerSeekingCount}</td>
                        <td className="py-2 pr-4">{row.moduleCount}</td>
                        <td className="py-2 pr-4 text-xs">
                          {row.lastActiveMillis
                            ? new Date(row.lastActiveMillis).toLocaleString()
                            : '—'}
                        </td>
                        <td className="max-w-xs py-2 pr-4 text-xs text-slate-600">{row.summary}</td>
                        <td className="py-2 pr-4">
                          <button
                            type="button"
                            onClick={() => handleSelectStudent(row.uid)}
                            className="rounded-lg border border-blue-200 px-2 py-1 text-xs text-blue-800"
                          >
                            View & report
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tutorView === 'module' && (
              <div className="mt-4 space-y-4">
                {tutorChallenges.length === 0 && (
                  <p className="text-sm text-slate-500">No tutor activity yet for this course.</p>
                )}
                {tutorChallenges.map((row) => (
                  <div key={row.moduleId} className="rounded-xl border border-blue-200 bg-white p-4">
                    <p className="font-semibold text-slate-900">
                      {moduleTitles[row.moduleId] ?? row.moduleTitle}
                    </p>
                    <p className="mt-1 text-sm text-blue-800">{row.summary}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.messageCount} message(s) · {row.studentCount} student(s) ·{' '}
                      {row.contextSummary}
                      {row.answerSeekingCount > 0 && (
                        <> · {row.answerSeekingCount} answer-seeking</>
                      )}
                    </p>
                    {row.topQuestions.length > 0 && (
                      <ul className="mt-3 space-y-1 text-sm text-slate-700">
                        {row.topQuestions.map((item) => (
                          <li key={item.label}>
                            <span className="font-medium">{item.count}×</span> “{item.label}”
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tutorView === 'activity' && (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2 pr-4">Student</th>
                      <th className="py-2 pr-4">Module</th>
                      <th className="py-2 pr-4">Context</th>
                      <th className="py-2 pr-4">Question</th>
                      <th className="py-2 pr-4">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tutorActivity.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-4 text-slate-500">
                          No tutor messages logged yet.
                        </td>
                      </tr>
                    )}
                    {tutorActivity.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 align-top">
                        <td className="py-2 pr-4">
                          <p className="font-medium">{row.studentName || row.uid}</p>
                          <p className="text-xs text-slate-500">{row.studentEmail}</p>
                        </td>
                        <td className="py-2 pr-4">
                          {moduleTitles[row.moduleId] ?? row.moduleTitle ?? row.moduleId}
                        </td>
                        <td className="py-2 pr-4 capitalize text-slate-600">
                          {CONTEXT_LABELS[row.contextType] ?? row.contextType ?? '—'}
                          {row.answerSeeking && (
                            <span className="mt-0.5 block text-xs font-medium text-amber-700">
                              Answer-seeking
                            </span>
                          )}
                        </td>
                        <td className="max-w-sm py-2 pr-4 text-slate-700">{row.studentMessage}</td>
                        <td className="py-2 pr-4 text-xs">
                          {formatFirestoreTimestamp(row.createdAt) || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {selectedStudent && (
            <section className="mt-8 rounded-lg border border-indigo-200 bg-indigo-50/30 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-indigo-900">
                    {selectedStudent.studentName || selectedStudent.uid}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {selectedStudent.messageCount} message(s) · {selectedStudent.moduleCount}{' '}
                    module(s) · {selectedStudent.contextSummary}
                  </p>
                  {selectedStudent.moduleTitles.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      Modules: {selectedStudent.moduleTitles.join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={summaryLoading}
                    onClick={() => handleGenerateSummary(false)}
                    className="btn-primary !py-1.5 !text-xs"
                  >
                    {summaryLoading ? 'Generating…' : 'Generate AI report'}
                  </button>
                  {aiSummary && (
                    <button
                      type="button"
                      disabled={summaryLoading}
                      onClick={() => handleGenerateSummary(true)}
                      className="btn-secondary !py-1.5 !text-xs"
                    >
                      Refresh report
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedStudentUid('')}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
                  >
                    Close
                  </button>
                </div>
              </div>

              {aiSummary && (
                <div className="mt-4 rounded-xl border border-indigo-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                    AI teacher report
                    {summaryMeta?.cached && ' (cached)'}
                  </p>
                  {summaryMeta?.generatedAtMillis && (
                    <p className="mt-1 text-xs text-slate-500">
                      Based on {summaryMeta.messageCount} message(s) ·{' '}
                      {new Date(summaryMeta.generatedAtMillis).toLocaleString()}
                    </p>
                  )}
                  <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                    {aiSummary}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <h3 className="text-sm font-semibold text-slate-800">Tutor messages</h3>
                <div className="mt-2 space-y-2">
                  {selectedStudentMessages.length === 0 && (
                    <p className="text-sm text-slate-500">No messages for this student.</p>
                  )}
                  {selectedStudentMessages.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-lg border border-indigo-100 bg-white px-3 py-2 text-sm"
                    >
                      <p className="text-xs text-slate-500">
                        {moduleTitles[row.moduleId] ?? row.moduleTitle} ·{' '}
                        {CONTEXT_LABELS[row.contextType] ?? row.contextType} ·{' '}
                        {formatFirestoreTimestamp(row.createdAt) || '—'}
                        {row.answerSeeking && (
                          <span className="ml-2 font-medium text-amber-700">Answer-seeking</span>
                        )}
                      </p>
                      <p className="mt-1 text-slate-800">{row.studentMessage}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section className="mt-8 rounded-lg border border-amber-200 bg-amber-50/30 p-6">
            <h2 className="text-lg font-semibold text-amber-900">
              Answer-seeking review ({reviewQueue.length} pending)
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Messages that look like direct answer requests during graded work.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2 pr-4">Student</th>
                    <th className="py-2 pr-4">Module</th>
                    <th className="py-2 pr-4">Message</th>
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewQueue.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-slate-500">
                        No pending answer-seeking flags.
                      </td>
                    </tr>
                  )}
                  {reviewQueue.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-4">
                        <p className="font-medium">{row.studentName || row.uid}</p>
                        <p className="text-xs text-slate-500">{row.studentEmail}</p>
                      </td>
                      <td className="py-2 pr-4">
                        {moduleTitles[row.moduleId] ?? row.moduleTitle ?? row.moduleId}
                        <p className="text-xs capitalize text-slate-500">{row.contextType}</p>
                      </td>
                      <td className="max-w-xs py-2 pr-4 text-slate-700">{row.studentMessage}</td>
                      <td className="py-2 pr-4 text-xs">
                        {formatFirestoreTimestamp(row.createdAt) || '—'}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleReview(row.id, 'reviewed')}
                            className="rounded-lg border border-emerald-200 px-2 py-1 text-xs text-emerald-800"
                          >
                            Reviewed
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReview(row.id, 'dismissed')}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
                          >
                            Dismiss
                          </button>
                        </div>
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

export default AIInsightsDashboard
