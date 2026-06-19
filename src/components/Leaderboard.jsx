import { useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuth } from '../context/AuthContext'

function Leaderboard() {
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!db) {
        setLoading(false)
        return
      }

      try {
        const snap = await getDocs(
          query(collection(db, 'leaderboard'), orderBy('xp', 'desc'), limit(10)),
        )
        setEntries(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })))
      } catch {
        setEntries([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-900">Leaderboard</h3>
      {loading ? (
        <p className="mt-2 text-sm text-slate-500">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          No entries yet. Earn XP by completing modules!
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {entries.map((entry, index) => (
            <li
              key={entry.id}
              className={`flex items-center justify-between rounded px-3 py-2 text-sm ${
                entry.id === user?.uid ? 'bg-blue-50 font-medium' : 'bg-slate-50'
              }`}
            >
              <span>
                #{index + 1} {entry.displayName ?? 'Student'}
              </span>
              <span className="text-amber-700">{entry.xp} XP</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default Leaderboard
