import { useGamification } from '../context/GamificationContext'

function GamificationBar() {
  const { xp, hearts, streak } = useGamification()

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
      <span className="font-medium text-amber-600" title="Total XP">
        ⭐ {xp} XP
      </span>
      <span className="text-red-500" title="Hearts remaining today">
        {'❤️'.repeat(hearts)}
        {'🖤'.repeat(Math.max(0, 3 - hearts))}
      </span>
      <span className="font-medium text-orange-600" title="Day streak">
        🔥 {streak} day{streak === 1 ? '' : 's'}
      </span>
    </div>
  )
}

export default GamificationBar
