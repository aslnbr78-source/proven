import { Link } from 'react-router-dom'

function TeacherDashboard() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">Teacher Dashboard</h1>
      <p className="mt-2 text-slate-600">Build courses, import lessons, and manage your classes.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/teacher/content"
          className="block rounded-lg border border-blue-200 bg-blue-50 p-6 no-underline transition hover:border-blue-400 hover:shadow-md"
        >
          <h2 className="text-lg font-semibold text-blue-900">Content Manager</h2>
          <p className="mt-2 text-sm text-blue-800">
            Import lesson JSON, arrange modules, edit chapters, and export files.
          </p>
        </Link>

        <Link
          to="/teacher/courses"
          className="block rounded-lg border border-indigo-200 bg-indigo-50 p-6 no-underline transition hover:border-indigo-400 hover:shadow-md"
        >
          <h2 className="text-lg font-semibold text-indigo-900">Course Builder</h2>
          <p className="mt-2 text-sm text-indigo-800">
            Chapters, subchapters, lessons, quizzes, files, links — build and publish in one place.
          </p>
        </Link>

        <Link
          to="/teacher/assets"
          className="block rounded-lg border border-amber-200 bg-amber-50 p-6 no-underline transition hover:border-amber-400 hover:shadow-md"
        >
          <h2 className="text-lg font-semibold text-amber-900">Course Assets</h2>
          <p className="mt-2 text-sm text-amber-800">
            Upload PDFs, videos, and attach links to your courses.
          </p>
        </Link>

        <Link
          to="/teacher/reports"
          className="block rounded-lg border border-emerald-200 bg-emerald-50 p-6 no-underline transition hover:border-emerald-400 hover:shadow-md"
        >
          <h2 className="text-lg font-semibold text-emerald-900">Reports & Gradebook</h2>
          <p className="mt-2 text-sm text-emerald-800">
            View roster, module completion, final test scores, proctoring data, and export CSV/Excel.
          </p>
        </Link>

        <Link
          to="/teacher/ai-insights"
          className="block rounded-lg border border-violet-200 bg-violet-50 p-6 no-underline transition hover:border-violet-400 hover:shadow-md"
        >
          <h2 className="text-lg font-semibold text-violet-900">AI Insights</h2>
          <p className="mt-2 text-sm text-violet-800">
            Misconception reports, tutor question logs, and answer-seeking flags from student AI
            sessions.
          </p>
        </Link>

        <div className="rounded-lg border border-rose-200 bg-rose-50 p-6">
          <h2 className="text-lg font-semibold text-rose-900">Live Class</h2>
          <p className="mt-2 text-sm text-rose-800">
            Open any course, navigate to a lesson, and click <strong>Go live</strong>. Students
            auto-sync to your screen.
          </p>
          <Link
            to="/courses/algebra-1"
            className="mt-3 inline-block text-sm font-medium text-rose-700 hover:underline"
          >
            Open a course to start →
          </Link>
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Content workflow</p>
        <ol className="mt-2 list-inside list-decimal space-y-1">
          <li>Use Course Builder to add chapters, lessons, files, and links</li>
          <li>Or import JSON in Content Manager for bulk lesson creation</li>
          <li>Publish in Course Builder — students see updates on the Hub</li>
        </ol>
      </div>
    </div>
  )
}

export default TeacherDashboard
