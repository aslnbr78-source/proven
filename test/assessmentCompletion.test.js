import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  countAnsweredQuestions,
  hasAnsweredEveryQuestion,
} from '../src/utils/assessmentCompletion.js'

const questions = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }]

describe('assessment completion helpers', () => {
  it('counts only questions that have submitted answers', () => {
    assert.equal(
      countAnsweredQuestions(questions, {
        q1: { isCorrect: true },
        other: { isCorrect: true },
      }),
      1,
    )
  })

  it('requires every question to be answered before manual submission', () => {
    assert.equal(hasAnsweredEveryQuestion(questions, { q1: {}, q2: {} }), false)
    assert.equal(
      hasAnsweredEveryQuestion(questions, {
        q1: { isCorrect: true },
        q2: { isCorrect: false },
        q3: { isCorrect: true },
      }),
      true,
    )
  })

  it('does not treat an empty assessment as ready to submit', () => {
    assert.equal(hasAnsweredEveryQuestion([], {}), false)
  })
})
