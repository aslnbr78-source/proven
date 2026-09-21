import { beforeEach, expect, test } from 'vitest'
import { createCustomCourse, getCustomCourse } from './contentStore.js'

const STORAGE_KEY = 'provenmath-custom-content'

function installLocalStorage() {
  const store = new Map()

  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

beforeEach(() => {
  installLocalStorage()
})

test('createCustomCourse rejects duplicate IDs without erasing saved modules', () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      courses: {
        'algebra-1': {
          outline: {
            id: 'algebra-1',
            title: 'Saved Algebra',
            chapters: [{ id: 'ch01', title: 'Chapter 1', subchapters: [] }],
          },
          modules: {
            lesson01: { id: 'lesson01', title: 'Saved lesson' },
          },
        },
      },
    }),
  )

  expect(() =>
    createCustomCourse({
      id: 'algebra-1',
      title: 'Replacement',
      chapters: [{ id: 'ch01', title: 'Chapter 1', subchapters: [] }],
    }),
  ).toThrow(/already exists/)

  expect(getCustomCourse('algebra-1').modules).toEqual({
    lesson01: { id: 'lesson01', title: 'Saved lesson' },
  })
})
