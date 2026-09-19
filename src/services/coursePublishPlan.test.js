import assert from 'node:assert/strict'
import test from 'node:test'

import { createCourseModulePublishPlan } from './coursePublishPlan.js'

const outline = {
  chapters: [
    {
      id: 'ch1',
      title: 'Chapter 1',
      subchapters: [
        {
          id: 'ch1-sc1',
          title: '1.1',
          modules: [
            { id: 'intro', title: 'Intro' },
            { id: 'quiz', title: 'Quiz' },
          ],
        },
      ],
    },
  ],
}

test('publish plan deletes Firestore modules removed from the outline', () => {
  const plan = createCourseModulePublishPlan(outline, {}, ['intro', 'quiz', 'removed'])

  assert.deepEqual(plan.moduleIdsToDelete, ['removed'])
})

test('publish plan writes only modules still referenced by the outline', () => {
  const plan = createCourseModulePublishPlan(
    outline,
    {
      intro: { id: 'intro', type: 'interactive-lesson' },
      quiz: { id: 'quiz', type: 'quiz' },
      removed: { id: 'removed', type: 'final-test' },
    },
    [],
  )

  assert.deepEqual(Object.keys(plan.modulesToWrite), ['intro', 'quiz'])
})
