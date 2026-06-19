import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useAuth } from '../context/AuthContext'
import { auth } from '../services/firebase'
import { ensureUserProfile } from '../services/userService'
import { getAuthErrorMessage } from '../utils/authErrors'
import { getHomePathForRole } from '../utils/roles'

function Login() {
  const { isFirebaseConfigured } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      const profile = await ensureUserProfile(credential.user)
      navigate(getHomePathForRole(profile?.role))
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="page-container">
        <h1 className="page-title">Log in</h1>
        <p className="mt-2 text-rose-600">Firebase is not configured. Add your keys to .env.</p>
      </div>
    )
  }

  return (
    <div className="page-container flex justify-center">
      <div className="card-modern w-full max-w-md">
        <h1 className="page-title !text-2xl">Welcome back</h1>
        <p className="page-subtitle">Sign in to access your courses.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input-modern mt-1.5 w-full"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input-modern mt-1.5 w-full"
            />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Signing in…' : 'Log in'}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-sm text-slate-400">or</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="space-y-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => navigate('/auth/callback?start=google')}
            className="btn-secondary w-full"
          >
            Continue with Google
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => navigate('/auth/callback?guest=1')}
            className="btn-secondary w-full"
          >
            Continue as Guest
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-slate-600">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-semibold text-indigo-600 no-underline hover:text-indigo-800">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}

export default Login
