import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
} from 'firebase/auth'
import { auth, isFirebaseConfigured } from '../services/firebase'
import { ensureUserProfile } from '../services/userService'
import { getHomePathForRole } from '../utils/roles'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return undefined
    }

    return onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)

      if (firebaseUser) {
        try {
          const userProfile = await ensureUserProfile(firebaseUser)
          setProfile(userProfile)
        } catch {
          setProfile(null)
        }
      } else {
        setProfile(null)
      }

      setLoading(false)
    })
  }, [])

  const logout = () => (auth ? signOut(auth) : Promise.resolve())

  const startGoogleSignIn = useCallback(() => {
    if (!auth) {
      return Promise.reject(new Error('Firebase is not configured'))
    }
    const provider = new GoogleAuthProvider()
    return signInWithRedirect(auth, provider)
  }, [])

  const getHomePath = () => getHomePathForRole(profile?.role)

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role: profile?.role ?? null,
        loading,
        logout,
        startGoogleSignIn,
        isFirebaseConfigured,
        getHomePath,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
