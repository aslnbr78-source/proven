const assert = require('node:assert/strict')
const test = require('node:test')
const { _test } = require('./personalizedTutor')

function makeSnap(data, exists = data !== undefined) {
  return {
    exists,
    data: () => data,
  }
}

function makeDb({ user = {}, course, courseExists = course !== undefined } = {}) {
  return {
    doc(path) {
      return {
        async get() {
          if (path.startsWith('users/')) {
            return makeSnap(user)
          }
          if (path.startsWith('courses/')) {
            return makeSnap(course, courseExists)
          }
          throw new Error(`Unexpected path: ${path}`)
        },
      }
    },
  }
}

test('students can use and log tutor activity for published courses', async () => {
  const access = await _test.loadTutorAccess(
    makeDb({ user: { role: 'student' }, course: { published: true } }),
    'student-1',
    'algebra',
  )

  assert.equal(access.courseId, 'algebra')
  assert.equal(access.canLogActivity, true)
})

test('students cannot log tutor activity into unpublished Firestore courses', async () => {
  await assert.rejects(
    () =>
      _test.loadTutorAccess(
        makeDb({ user: { role: 'student' }, course: { published: false } }),
        'student-1',
        'draft-course',
      ),
    (error) => error.code === 'permission-denied',
  )
})

test('teachers can use unpublished Firestore courses', async () => {
  const access = await _test.loadTutorAccess(
    makeDb({ user: { role: 'teacher' }, course: { published: false } }),
    'teacher-1',
    'draft-course',
  )

  assert.equal(access.courseId, 'draft-course')
  assert.equal(access.canLogActivity, true)
})

test('missing Firestore course docs remain allowed for bundled static courses', async () => {
  const access = await _test.loadTutorAccess(
    makeDb({ user: { role: 'student' }, course: undefined, courseExists: false }),
    'student-1',
    'bundled-course',
  )

  assert.equal(access.courseId, 'bundled-course')
  assert.equal(access.canLogActivity, true)
})

test('invalid course ids are rejected before Firestore paths are built', async () => {
  await assert.rejects(
    () => _test.loadTutorAccess(makeDb(), 'student-1', 'course/with/slash'),
    (error) => error.code === 'invalid-argument',
  )
})
