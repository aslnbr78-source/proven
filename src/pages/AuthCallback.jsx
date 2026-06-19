import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getRedirectResult, signInAnonymously } from 'firebase/auth'
import { useAuth } from '../context/AuthContext'
import { auth } from '../services/firebase'
import { getAuthErrorMessage } from '../utils/authErrors'
import { getHomePathForRole } from '../utils/roles'

function AuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, profile, loading, startGoogleSignIn } = useAuth()
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(true)

  useEffect(() => {
    if (!auth) {
      setProcessing(false)
      return undefined
    }

    let cancelled = false

    async function run() {
      try {
        if (searchParams.get('start') === 'google') {
          await startGoogleSignIn()
          return
        }

        if (searchParams.get('guest') === '1') {
          await signInAnonymously(auth)
          return
        }

        await getRedirectResult(auth)
      } catch (err) {
        if (!cancelled) {
          setError(getAuthErrorMessage(err))
        }
      } finally {
        if (!cancelled) {
          setProcessing(false)
        }
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [searchParams, startGoogleSignIn])

  useEffect(() => {
    if (processing || loading) {
      return
    }

    if (user && profile) {
      navigate(getHomePathForRole(profile.role), { replace: true })
      return
    }

    if (error) {
      return
    }

    if (!searchParams.get('start') && !searchParams.get('guest')) {
      navigate('/login', { replace: true })
    }
  }, [user, profile, loading, processing, error, navigate, searchParams])

  if (error) {
    return (
      <div className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-bold">Sign-in failed</h1>
        <p className="mt-2 text-red-600">{error}</p>
        <Link to="/login" className="mt-4 inline-block text-blue-600 hover:underline">
          Back to log in
        </Link>
      </div>
    )
  }

  return (
    <div className="p-8">
      <p className="text-slate-600">Signing you in…</p>
    </div>
  )
}

export default AuthCallback
