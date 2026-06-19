import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listFirestoreCourses } from '../services/courseFirestore'
import { listUsers, updateUserRole } from '../services/userAdminService'
import { ROLES, getRoleLabel } from '../utils/roles'

function AdminDashboard() {
  const { profile } = useAuth()
  const [users, setUsers] = useState([])
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [userRows, courseRows] = await Promise.all([listUsers(), listFirestoreCourses()])
        setUsers(userRows)
        setCourses(courseRows.filter((course) => course.published))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleRoleChange = async (uid, role) => {
    if (uid === profile?.uid && role !== ROLES.ADMIN) {
      setMessage('You cannot demote your own admin account here.')
      return
    }

    try {
      await updateUserRole(uid, role)
      setUsers((previous) =>
        previous.map((user) => (user.uid === uid ? { ...user, role } : user)),
      )
      setMessage(`Updated role to ${getRoleLabel(role)}.`)
    } catch (error) {
      setMessage(error.message || 'Could not update role.')
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      <p className="mt-2 text-slate-600">Manage teachers, published courses, and platform reports.</p>

      {message && (
        <p className="mt-4 rounded bg-blue-50 px-3 py-2 text-sm text-blue-800">{message}</p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          to="/teacher/courses"
          className="rounded-lg border border-blue-200 bg-blue-50 p-5 no-underline hover:shadow-md"
        >
          <h2 className="font-semibold text-blue-900">Course Builder</h2>
          <p className="mt-1 text-sm text-blue-800">Create courses and publish to Firestore.</p>
        </Link>
        <Link
          to="/admin/reports"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 no-underline hover:shadow-md"
        >
          <h2 className="font-semibold text-emerald-900">Reports</h2>
          <p className="mt-1 text-sm text-emerald-800">Roster, gradebook, CSV export.</p>
        </Link>
        <Link
          to="/admin/ai-insights"
          className="rounded-lg border border-violet-200 bg-violet-50 p-5 no-underline hover:shadow-md"
        >
          <h2 className="font-semibold text-violet-900">AI Insights</h2>
          <p className="mt-1 text-sm text-violet-800">Misconceptions and tutor review queue.</p>
        </Link>
        <Link
          to="/teacher/content"
          className="rounded-lg border border-violet-200 bg-violet-50 p-5 no-underline hover:shadow-md"
        >
          <h2 className="font-semibold text-violet-900">Content Manager</h2>
          <p className="mt-1 text-sm text-violet-800">Import and arrange lesson JSON.</p>
        </Link>
        <Link
          to="/teacher/assets"
          className="rounded-lg border border-amber-200 bg-amber-50 p-5 no-underline hover:shadow-md"
        >
          <h2 className="font-semibold text-amber-900">Course Assets</h2>
          <p className="mt-1 text-sm text-amber-800">Upload PDFs, videos, and links.</p>
        </Link>
      </div>

      <section className="mt-10 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Teachers & users</h2>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading users…</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.uid} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{user.email ?? '—'}</td>
                    <td className="py-2 pr-4">{user.displayName ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <select
                        value={user.role ?? ROLES.STUDENT}
                        onChange={(event) => handleRoleChange(user.uid, event.target.value)}
                        className="rounded border border-slate-300 px-2 py-1"
                      >
                        <option value={ROLES.STUDENT}>Student</option>
                        <option value={ROLES.TEACHER}>Teacher</option>
                        <option value={ROLES.ADMIN}>Admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Published courses ({courses.length})</h2>
        {courses.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No Firestore courses yet. Publish from Content Manager.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {courses.map((course) => (
              <li key={course.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 px-3 py-2">
                <span className="font-medium">{course.title}</span>
                <span className="text-xs text-slate-500">{course.id}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default AdminDashboard
