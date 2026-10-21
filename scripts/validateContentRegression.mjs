import assert from 'node:assert/strict'
import { validateModuleJson } from '../src/utils/validateContent.js'

function assertInvalid(module, expectedMessages) {
  const result = validateModuleJson(module)
  assert.equal(result.valid, false)

  for (const expected of expectedMessages) {
    assert(
      result.errors.some((message) => message.includes(expected)),
      `Expected validation error containing "${expected}", got: ${result.errors.join('; ')}`,
    )
  }
}

function assertValid(module) {
  const result = validateModuleJson(module)
  assert.deepEqual(result.errors, [])
  assert.equal(result.valid, true)
}

assertInvalid(
  {
    id: 'bad-lesson',
    title: 'Bad lesson',
    type: 'interactive-lesson',
    explanation: [{ text: 'object crashes MathText' }],
    example: {
      prompt: ['array crashes MathText'],
      steps: ['ok', 42],
    },
    question: {
      prompt: 'Solve x + 1 = 2',
      answer: '1',
      hints: ['Subtract 1', { text: 'object crashes MathText' }],
    },
  },
  ['explanation[0]', 'example.prompt', 'example.steps[1]', 'question.hints[1]'],
)

assertInvalid(
  {
    id: 'bad-quiz',
    title: 'Bad quiz',
    type: 'quiz',
    questions: [
      {
        id: 'q1',
        prompt: 'Choose one',
        options: ['A', { label: 'object crashes MathText' }],
        correctIndex: 0,
        hints: ['Hint', null],
        feedbackIfWrong: 'Try again',
      },
    ],
  },
  ['questions[0].options[1]', 'questions[0].hints[1]'],
)

assertInvalid(
  {
    id: 'bad-final',
    title: 'Bad final',
    type: 'final-test',
    timeLimit: 60,
    questions: [
      {
        id: 'q1',
        prompt: 'Choose one',
        options: [1, 'B'],
        correctIndex: 1,
        feedbackIfWrong: 'Review the lesson',
      },
    ],
  },
  ['questions[0].options[0]'],
)

assertValid({
  id: 'good-quiz',
  title: 'Good quiz',
  type: 'quiz',
  questions: [
    {
      id: 'q1',
      prompt: 'Choose one',
      options: ['A', 'B'],
      correctIndex: 0,
      hints: [],
      feedbackIfWrong: 'Try again',
    },
  ],
})
