const VARIANTS = {
  explanation: {
    badge: 'Learn',
    badgeClass: 'section-badge section-badge-learn',
    panelClass: 'lesson-panel lesson-panel-learn',
    icon: '📘',
  },
  example: {
    badge: 'Example',
    badgeClass: 'section-badge section-badge-example',
    panelClass: 'lesson-panel lesson-panel-example',
    icon: '✏️',
  },
  question: {
    badge: 'Your turn',
    badgeClass: 'section-badge section-badge-practice',
    panelClass: 'lesson-panel lesson-panel-practice',
    icon: '🎯',
  },
  quiz: {
    badge: 'Quiz',
    badgeClass: 'section-badge section-badge-quiz',
    panelClass: 'lesson-panel lesson-panel-quiz',
    icon: '📝',
  },
  flashcard: {
    badge: 'Flashcards',
    badgeClass: 'section-badge section-badge-flash',
    panelClass: 'lesson-panel lesson-panel-flash',
    icon: '🃏',
  },
  'final-test': {
    badge: 'Final Test',
    badgeClass: 'section-badge section-badge-final-test',
    panelClass: 'lesson-panel lesson-panel-final-test',
    icon: '🔒',
  },
}

function LessonSection({ variant = 'explanation', title, children }) {
  const config = VARIANTS[variant] ?? VARIANTS.explanation

  return (
    <section className={config.panelClass}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className={config.badgeClass}>
          <span aria-hidden="true">{config.icon}</span>
          {config.badge}
        </span>
        {title && <h2 className="section-title">{title}</h2>}
      </div>
      {children}
    </section>
  )
}

export default LessonSection
