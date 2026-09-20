import assert from 'node:assert/strict'
import { validateModuleJson } from './validateContent.js'

const baseQuestion = {
  id: 'q1',
  prompt: 'What is 1 + 1?',
  options: ['1', '2'],
  correctIndex: 1,
  hints: [],
  feedbackIfWrong: 'Add the two ones.',
}

const baseFinalTestQuestion = {
  id: 'ft-q1',
  prompt: 'What is 2 + 2?',
  options: ['3', '4'],
  correctIndex: 1,
  feedbackIfWrong: 'Add the two twos.',
}

function expectValid(module) {
  assert.equal(validateModuleJson(module).valid, true)
}

function expectDuplicateQuestionIdError(module) {
  const result = validateModuleJson(module)

  assert.equal(result.valid, false)
  assert.ok(
    result.errors.some((error) => error.includes('id duplicates')),
    `Expected duplicate ID error, got: ${result.errors.join('; ')}`,
  )
}

expectValid({
  type: 'quiz',
  id: 'valid-quiz',
  title: 'Valid quiz',
  questions: [
    baseQuestion,
    { ...baseQuestion, id: 'q2', prompt: 'What is 2 + 1?', correctIndex: 0 },
  ],
})

expectDuplicateQuestionIdError({
  type: 'quiz',
  id: 'duplicate-quiz',
  title: 'Duplicate quiz',
  questions: [baseQuestion, { ...baseQuestion, prompt: 'What is 3 + 1?' }],
})

expectValid({
  type: 'final-test',
  id: 'valid-final-test',
  title: 'Valid final test',
  timeLimit: 600,
  questions: [
    baseFinalTestQuestion,
    { ...baseFinalTestQuestion, id: 'ft-q2', prompt: 'What is 3 + 3?' },
  ],
})

expectDuplicateQuestionIdError({
  type: 'final-test',
  id: 'duplicate-final-test',
  title: 'Duplicate final test',
  timeLimit: 600,
  questions: [baseFinalTestQuestion, { ...baseFinalTestQuestion, prompt: 'What is 5 + 5?' }],
})
