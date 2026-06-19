import { Link, Outlet, useLocation } from 'react-router-dom'
import { CalculatorLauncher } from '../components/ScientificCalculator'
import { useAuth } from '../context/AuthContext'
import { getRoleLabel, ROLES } from '../utils/roles'

function MainLayout() {
  const { user, profile, role, loading, logout } = useAuth()
  const location = useLocation()

  const displayName = profile?.displayName || user?.email || (user?.isAnonymous ? 'Guest' : '')

  const isActive = (path) => location.pathname.startsWith(path)

  return (
    <div className="min-h-screen">
      <header className="app-header flex items-center gap-4">
        <Link to="/" className="brand-logo">
          ProvenMath
        </Link>
        <nav className="ml-auto flex flex-wrap items-center gap-1">
          {loading ? null : user ? (
            <>
              {role === ROLES.ADMIN && (
                <Link to="/admin" className={`nav-link ${isActive('/admin') ? 'nav-link-active' : ''}`}>
                  Admin
                </Link>
              )}
              {(role === ROLES.TEACHER || role === ROLES.ADMIN) && (
                <Link
                  to="/teacher"
                  className={`nav-link ${isActive('/teacher') ? 'nav-link-active' : ''}`}
                >
                  Teacher
                </Link>
              )}
              <Link to="/hub" className={`nav-link ${isActive('/hub') ? 'nav-link-active' : ''}`}>
                Hub
              </Link>
              <span className="hidden px-2 text-sm text-slate-500 sm:inline">
                {displayName}
                {role && <span className="text-slate-400"> · {getRoleLabel(role)}</span>}
              </span>
              <button type="button" onClick={logout} className="nav-link">
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-link">
                Log in
              </Link>
              <Link to="/signup" className="btn-primary ml-1 !py-1.5 !text-sm">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <CalculatorLauncher />
    </div>
  )
}

export default MainLayout
