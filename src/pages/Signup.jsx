import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { useAuth } from '../context/AuthContext'
import { auth } from '../services/firebase'
import { ensureUserProfile } from '../services/userService'
import { getAuthErrorMessage } from '../utils/authErrors'
import { getHomePathForRole } from '../utils/roles'

function Signup() {
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
      const credential = await createUserWithEmailAndPassword(auth, email, password)
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
        <h1 className="page-title">Sign up</h1>
        <p className="mt-2 text-rose-600">Firebase is not configured. Add your keys to .env.</p>
      </div>
    )
  }

  return (
    <div className="page-container flex justify-center">
      <div className="card-modern w-full max-w-md">
        <h1 className="page-title !text-2xl">Create your account</h1>
        <p className="page-subtitle">Start learning with ProvenMath today.</p>

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
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input-modern mt-1.5 w-full"
            />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Creating account…' : 'Sign up'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-indigo-600 no-underline hover:text-indigo-800">
            Log in
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-slate-400">
          Teacher accounts are created by an admin.
        </p>
      </div>
    </div>
  )
}

export default Signup
