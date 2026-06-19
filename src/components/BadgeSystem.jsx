import { useGamification } from '../context/GamificationContext'

function BadgeSystem() {
  const { badges, badgesCatalog } = useGamification()
  const earned = new Set(badges)

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-900">Badges</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {Object.values(badgesCatalog).map((badge) => {
          const unlocked = earned.has(badge.id)
          return (
            <div
              key={badge.id}
              className={`rounded-lg border px-3 py-2 text-sm ${
                unlocked
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-slate-100 bg-slate-50 text-slate-400'
              }`}
            >
              <p className="font-medium">{unlocked ? '🏅' : '🔒'} {badge.label}</p>
              <p className="text-xs">{badge.description}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default BadgeSystem
