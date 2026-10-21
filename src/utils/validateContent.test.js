import assert from 'node:assert/strict'
import test from 'node:test'

import { parseModuleJson, validateModuleJson } from './validateContent.js'

const mathGame = {
  type: 'math-game',
  id: 'domain-dash',
  title: 'Domain Dash',
  game: 'domain-dash',
  rounds: [
    {
      prompt: 'What is the domain of $f(x)=1/(x-2)$?',
      choices: [
        { id: 'a', label: 'All real $x$ except $x=2$' },
        { id: 'b', label: 'All real $x$ except $x=-2$' },
      ],
      correctId: 'a',
    },
    {
      kind: 'input',
      prompt: 'Solve $x+3=5$.',
      answer: '2',
    },
  ],
}

test('validateModuleJson accepts math-game payloads', () => {
  assert.deepEqual(validateModuleJson(mathGame), {
    valid: true,
    errors: [],
    data: mathGame,
  })
})

test('parseModuleJson accepts fenced math-game JSON', () => {
  const result = parseModuleJson(`\`\`\`json\n${JSON.stringify(mathGame)}\n\`\`\``)

  assert.equal(result.valid, true)
  assert.equal(result.data.type, 'math-game')
})

test('validateModuleJson rejects game rounds whose correctId is not a choice', () => {
  const result = validateModuleJson({
    ...mathGame,
    rounds: [
      {
        prompt: 'Pick one.',
        choices: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        correctId: 'c',
      },
    ],
  })

  assert.equal(result.valid, false)
  assert.match(result.errors.join('\n'), /must match a choice id/)
})
