import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { validateModuleJson } from './validateContent.js'

function makeQuiz(overrides = {}) {
  return {
    id: 'linear-quiz',
    title: 'Linear Quiz',
    type: 'quiz',
    questions: [
      {
        id: 'q1',
        prompt: 'What is 2 + 2?',
        options: ['3', '4', '5'],
        correctIndex: 1,
        hints: [],
        feedbackIfWrong: 'Add the values.',
        ...overrides,
      },
    ],
  }
}

function makeFinalTest(overrides = {}) {
  return {
    ...makeQuiz(overrides),
    id: 'linear-final',
    title: 'Linear Final',
    type: 'final-test',
    timeLimit: 600,
  }
}

describe('validateModuleJson correctIndex validation', () => {
  it('accepts a quiz answer index that points at an option', () => {
    const result = validateModuleJson(makeQuiz({ correctIndex: 2 }))

    assert.equal(result.valid, true)
    assert.deepEqual(result.errors, [])
  })

  it('rejects a negative quiz answer index', () => {
    const result = validateModuleJson(makeQuiz({ correctIndex: -1 }))

    assert.equal(result.valid, false)
    assert.match(result.errors.join('\n'), /correctIndex must reference an option index/)
  })

  it('rejects a fractional quiz answer index', () => {
    const result = validateModuleJson(makeQuiz({ correctIndex: 1.5 }))

    assert.equal(result.valid, false)
    assert.match(result.errors.join('\n'), /correctIndex must be an integer/)
  })

  it('rejects a final-test answer index past the options array', () => {
    const result = validateModuleJson(makeFinalTest({ correctIndex: 3 }))

    assert.equal(result.valid, false)
    assert.match(result.errors.join('\n'), /correctIndex must reference an option index/)
  })
})
