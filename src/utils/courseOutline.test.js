import assert from 'node:assert/strict'
import test from 'node:test'

import { flattenModules, healOutlineFromRicherSource } from './courseOutline.js'

const sourceOutline = {
  id: 'course',
  title: 'Source',
  chapters: [
    {
      id: 'ch01',
      title: 'Chapter 1',
      subchapters: [
        {
          id: 'ch01-sc01',
          title: '1.1 Source',
          modules: [
            { id: 'm1', type: 'interactive-lesson', title: 'One' },
            { id: 'm2', type: 'interactive-lesson', title: 'Two' },
          ],
          materials: [],
        },
      ],
    },
    {
      id: 'ch02',
      title: 'Chapter 2',
      subchapters: [
        {
          id: 'ch02-sc01',
          title: '2.1 Source',
          modules: [{ id: 'm3', type: 'interactive-lesson', title: 'Three' }],
          materials: [],
        },
      ],
    },
    {
      id: 'ch03',
      title: 'Chapter 3',
      subchapters: [
        {
          id: 'ch03-sc01',
          title: '3.1 Source',
          modules: [{ id: 'm4', type: 'interactive-lesson', title: 'Four' }],
          materials: [],
        },
      ],
    },
  ],
}

test('healOutlineFromRicherSource fills empty stubs without replacing edited chapters', () => {
  const draft = {
    id: 'course',
    title: 'Draft',
    chapters: [
      {
        id: 'ch01',
        title: 'Chapter 1 renamed',
        subchapters: [
          {
            id: 'ch01-sc01',
            title: '1.1 Draft',
            modules: [{ id: 'm1', type: 'interactive-lesson', title: 'One renamed' }],
            materials: [],
          },
        ],
      },
      {
        id: 'ch02',
        title: 'Chapter 2',
        subchapters: [{ id: 'ch02-sc01', title: '2.1', modules: [], materials: [] }],
      },
    ],
  }

  const healed = healOutlineFromRicherSource(draft, sourceOutline)

  assert.deepEqual(
    flattenModules(healed).map((module) => module.id),
    ['m1', 'm3'],
  )
  assert.equal(healed.chapters[0].title, 'Chapter 1 renamed')
  assert.equal(healed.chapters[0].subchapters[0].title, '1.1 Draft')
  assert.equal(healed.chapters[0].subchapters[0].modules[0].title, 'One renamed')
  assert.equal(healed.chapters[1].subchapters[0].title, '2.1 Source')
})

test('healOutlineFromRicherSource does not append source chapters missing from the draft', () => {
  const draft = {
    id: 'course',
    title: 'Draft',
    chapters: [
      {
        id: 'ch01',
        title: 'Chapter 1',
        subchapters: [
          {
            id: 'ch01-sc01',
            title: '1.1',
            modules: [{ id: 'm1', type: 'interactive-lesson', title: 'One' }],
            materials: [],
          },
        ],
      },
    ],
  }

  const healed = healOutlineFromRicherSource(draft, sourceOutline)

  assert.deepEqual(
    flattenModules(healed).map((module) => module.id),
    ['m1'],
  )
})
