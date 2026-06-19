import { Link } from 'react-router-dom'

function Home() {
  return (
    <div className="page-container">
      <section className="hero-gradient">
        <p className="text-sm font-semibold uppercase tracking-widest text-indigo-200">
          ProvenMath LMS
        </p>
        <h1 className="mt-3 max-w-xl text-4xl font-bold leading-tight md:text-5xl">
          Learn math with clarity, color, and confidence
        </h1>
        <p className="mt-4 max-w-lg text-lg text-indigo-100">
          Interactive lessons, AI tutoring, live class sync, and teacher-built courses — all in one
          modern learning hub.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/signup" className="rounded-xl bg-white px-6 py-3 text-sm font-bold text-indigo-700 no-underline shadow-lg hover:bg-indigo-50">
            Get started free
          </Link>
          <Link to="/login" className="rounded-xl border border-white/40 px-6 py-3 text-sm font-semibold text-white no-underline hover:bg-white/10">
            Log in
          </Link>
        </div>
      </section>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        <div className="card-modern">
          <p className="text-2xl">📘</p>
          <h2 className="mt-3 font-bold text-slate-900">Color-coded lessons</h2>
          <p className="mt-2 text-sm text-slate-600">
            Keywords like{' '}
            <code className="rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-800">[[kw:slope]]</code>{' '}
            stand out in explanations, examples, and questions.
          </p>
        </div>
        <div className="card-modern">
          <p className="text-2xl">🤖</p>
          <h2 className="mt-3 font-bold text-slate-900">AI Socratic tutor</h2>
          <p className="mt-2 text-sm text-slate-600">
            Personalized help that remembers your mistakes and guides without giving away answers.
          </p>
        </div>
        <div className="card-modern">
          <p className="text-2xl">📡</p>
          <h2 className="mt-3 font-bold text-slate-900">Live class sync</h2>
          <p className="mt-2 text-sm text-slate-600">
            Teachers go live and students follow the same lesson in real time.
          </p>
        </div>
      </div>
    </div>
  )
}

export default Home
