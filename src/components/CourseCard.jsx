import { Link } from 'react-router-dom'

const accents = [
  'from-indigo-500 to-violet-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-blue-600',
]

function CourseCard({ course, index = 0 }) {
  const accent = accents[index % accents.length]

  return (
    <Link
      to={`/courses/${course.id}`}
      className="group block overflow-hidden rounded-2xl border border-slate-200/80 bg-white no-underline transition hover:border-indigo-200"
      style={{ boxShadow: 'var(--shadow-soft)' }}
    >
      <div className={`h-2 bg-gradient-to-r ${accent}`} />
      <div className="p-6">
        <h2 className="text-xl font-bold text-slate-900 group-hover:text-indigo-700">{course.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{course.description}</p>
        <p className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {course.lessonCount} {course.lessonCount === 1 ? 'module' : 'modules'}
        </p>
      </div>
    </Link>
  )
}

export default CourseCard
