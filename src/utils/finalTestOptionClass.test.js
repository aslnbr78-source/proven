import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getFinalTestOptionClass } from './finalTestOptionClass.js'

test('final test options do not reveal correctness after a submitted answer', () => {
  const classes = [
    getFinalTestOptionClass({ isSelected: true }),
    getFinalTestOptionClass({ isSelected: false }),
    getFinalTestOptionClass({ isSelected: false }),
  ]

  assert.equal(classes[0], 'quiz-option quiz-option-selected')
  assert.equal(classes[1], 'quiz-option')
  assert.equal(classes[2], 'quiz-option')
  assert.equal(classes.some((className) => className.includes('quiz-option-reveal')), false)
  assert.equal(classes.some((className) => className.includes('quiz-option-correct')), false)
  assert.equal(classes.some((className) => className.includes('quiz-option-wrong')), false)
})
