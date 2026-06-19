import { useGamification } from '../context/GamificationContext'

function StreakTracker() {
  const { streak, lastActiveDate } = useGamification()

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
      <h3 className="font-semibold text-orange-900">Streak</h3>
      <p className="mt-2 text-3xl font-bold text-orange-700">🔥 {streak}</p>
      <p className="mt-1 text-sm text-orange-800">
        {streak > 0
          ? 'Keep practicing daily to grow your streak!'
          : 'Complete a module today to start your streak.'}
      </p>
      {lastActiveDate && (
        <p className="mt-2 text-xs text-orange-700">Last active: {lastActiveDate}</p>
      )}
    </div>
  )
}

export default StreakTracker
