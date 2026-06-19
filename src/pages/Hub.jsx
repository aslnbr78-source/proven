import { useEffect, useState } from 'react'
import CourseCard from '../components/CourseCard'
import BadgeSystem from '../components/BadgeSystem'
import GamificationBar from '../components/GamificationBar'
import Leaderboard from '../components/Leaderboard'
import StreakTracker from '../components/StreakTracker'
import LiveClassHubBanner from '../components/LiveClassHubBanner'
import { listAvailableCourses } from '../services/contentLoader'

function Hub() {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listAvailableCourses()
      .then(setCourses)
      .catch(() => setCourses([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="page-container">
      <h1 className="page-title">Course Hub</h1>
      <p className="page-subtitle">Choose a course to continue learning.</p>

      <div className="mt-6">
        <GamificationBar />
      </div>

      <LiveClassHubBanner />

      {loading ? (
        <p className="mt-8 text-slate-600">Loading courses…</p>
      ) : courses.length === 0 ? (
        <div className="card-modern mt-8">
          <p className="font-semibold text-slate-900">No courses available yet</p>
          <p className="mt-2 text-sm text-slate-600">
            Ask your teacher to publish a course, or check back later.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course, index) => (
            <CourseCard key={course.id} course={course} index={index} />
          ))}
        </div>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <StreakTracker />
        <BadgeSystem />
        <Leaderboard />
      </div>
    </div>
  )
}

export default Hub
