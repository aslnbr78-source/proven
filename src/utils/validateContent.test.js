import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { parseModuleJson } from './validateContent.js'

const readFixture = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('parseModuleJson accepts bundled math-game payloads', () => {
  for (const fixture of [
    '../../public/lessons/precalculus-games/ch01-function-arcade-game.json',
    '../../public/lessons/precalculus-games/ch01-function-lexicon-game.json',
    '../../public/lessons/precalculus-games/ch01-domain-dash-game.json',
    '../../public/lessons/precalculus-games/ch01-transform-twist-game.json',
  ]) {
    const result = parseModuleJson(readFixture(fixture))
    assert.equal(result.valid, true, result.errors.join('\n'))
    assert.equal(result.data.type, 'math-game')
  }
})

test('parseModuleJson accepts fenced math-game JSON from the import textarea', () => {
  const fixture = readFixture('../../public/lessons/precalculus-games/ch01-domain-dash-game.json')
  const result = parseModuleJson(`\`\`\`json\n${fixture}\n\`\`\``)

  assert.equal(result.valid, true, result.errors.join('\n'))
  assert.equal(result.data.type, 'math-game')
})

test('parseModuleJson rejects math-game choices whose correctId is missing', () => {
  const payload = JSON.parse(
    readFixture('../../public/lessons/precalculus-games/ch01-function-arcade-game.json'),
  )
  payload.rounds[0].correctId = 'missing-choice'

  const result = parseModuleJson(JSON.stringify(payload))

  assert.equal(result.valid, false)
  assert.match(result.errors.join('\n'), /correctId must match a choice id/)
})
