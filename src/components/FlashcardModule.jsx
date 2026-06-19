import { useState } from 'react'
import { useGamification } from '../context/GamificationContext'
import LessonSection from './LessonSection'
import MathBlock from './MathBlock'

function FlashcardModule({ data, onComplete }) {
  const { awardModuleComplete } = useGamification()
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [seen, setSeen] = useState(new Set([0]))
  const [xpEarned, setXpEarned] = useState(null)

  const card = data.cards[index]
  const total = data.cards.length

  const goTo = (nextIndex) => {
    setIndex(nextIndex)
    setFlipped(false)
    setSeen((previous) => new Set(previous).add(nextIndex))
  }

  const goNext = () => {
    if (index < total - 1) {
      goTo(index + 1)
      return
    }

    if (seen.size === total) {
      const xp = awardModuleComplete('flashcard')
      setXpEarned(xp)
      onComplete?.()
    }
  }

  const goPrev = () => {
    if (index > 0) {
      goTo(index - 1)
    }
  }

  return (
    <LessonSection variant="flashcard">
      <p className="text-sm font-semibold text-slate-600">
        Card {index + 1} of {total}
      </p>

      <button
        type="button"
        onClick={() => setFlipped((value) => !value)}
        className="group mx-auto mt-5 block h-56 w-full max-w-lg [perspective:1000px]"
        aria-label={flipped ? 'Show front of card' : 'Show back of card'}
      >
        <div
          className={`relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] ${
            flipped ? '[transform:rotateY(180deg)]' : ''
          }`}
        >
          <div className="flashcard-face flashcard-front">
            <MathBlock text={card.front} className="text-center text-lg font-semibold text-slate-900" />
          </div>
          <div className="flashcard-face flashcard-back">
            <MathBlock text={card.back} className="text-center text-slate-800" />
          </div>
        </div>
      </button>

      <p className="mt-3 text-center text-sm text-slate-500">Click the card to flip</p>

      <div className="mx-auto mt-6 flex max-w-lg justify-between gap-3">
        <button type="button" onClick={goPrev} disabled={index === 0} className="btn-secondary">
          Previous
        </button>
        <button type="button" onClick={goNext} className="btn-primary">
          {index < total - 1 ? 'Next card' : 'Finish deck'}
        </button>
      </div>
      {xpEarned !== null && (
        <p className="mt-4 text-center text-sm font-bold text-amber-700">+{xpEarned} XP earned!</p>
      )}
    </LessonSection>
  )
}

export default FlashcardModule
