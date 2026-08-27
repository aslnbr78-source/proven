/**
 * Pull lesson JSON from live hosting into public/lessons/{courseId}/.
 * Run before deploy so Firebase hosting does not drop files that exist in prod only.
 */
import { mkdirSync, existsSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const HOSTING = process.env.PROVEN_HOSTING_ORIGIN ?? 'https://provenmath-lms-e4e6b.web.app'

const COURSES = ['algebra-1', 'algebra-2', 'precalculus', 'bus-math', 'statistics']

function flattenModules(outline) {
  const modules = []
  for (const chapter of outline?.chapters ?? []) {
    for (const subchapter of chapter.subchapters ?? []) {
      for (const module of subchapter.modules ?? []) {
        if (module?.id && module.type !== 'math-game' && module.contentSource !== 'game-catalog') {
          modules.push(module.id)
        }
      }
    }
  }
  return modules
}

async function loadOutline(courseId) {
  const paths = [
    join(root, 'public', 'courses', courseId, 'course.json'),
    join(root, 'scripts', '_hub-snapshots', `${courseId}-hub-now.json`),
    join(root, 'scripts', '_hub-snapshots', `${courseId}-now.json`),
  ]

  for (const path of paths) {
    if (!existsSync(path)) {
      continue
    }
    const outline = JSON.parse(readFileSync(path, 'utf8'))
    return outline
  }

  const url = `${HOSTING}/courses/${courseId}/course.json`
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return null
    }
    const contentType = String(response.headers.get('content-type') ?? '')
    if (contentType.includes('text/html')) {
      return null
    }
    const body = await response.text()
    if (body.trimStart().startsWith('<!')) {
      return null
    }
    return JSON.parse(body)
  } catch {
    return null
  }
}

async function download(courseId, moduleId) {
  const url = `${HOSTING}/lessons/${courseId}/${moduleId}.json`
  const response = await fetch(url)
  if (!response.ok) {
    return false
  }
  const contentType = String(response.headers.get('content-type') ?? '')
  if (contentType.includes('text/html')) {
    return false
  }
  const body = await response.text()
  if (body.trimStart().startsWith('<!')) {
    return false
  }
  try {
    const parsed = JSON.parse(body)
    const hasBody =
      (Array.isArray(parsed.blocks) && parsed.blocks.length > 0) ||
      (Array.isArray(parsed.questions) && parsed.questions.length > 0) ||
      (Array.isArray(parsed.cards) && parsed.cards.length > 0) ||
      (Array.isArray(parsed.rounds) && parsed.rounds.length > 0) ||
      (Array.isArray(parsed.bank) && parsed.bank.length > 0)
    if (!hasBody && parsed.type !== 'adaptive-practice' && parsed.type !== 'adaptive-mastery') {
      return false
    }
  } catch {
    return false
  }
  const dir = join(root, 'public', 'lessons', courseId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${moduleId}.json`), body)
  return true
}

async function main() {
  let pulled = 0
  let skipped = 0
  let missing = 0

  for (const courseId of COURSES) {
    const outline = await loadOutline(courseId)
    if (!outline) {
      console.log(`skip ${courseId}: no outline`)
      continue
    }

    const moduleIds = flattenModules(outline)
    const lessonDir = join(root, 'public', 'lessons', courseId)
    const existing = existsSync(lessonDir)
      ? new Set(readdirSync(lessonDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')))
      : new Set()

    for (const moduleId of moduleIds) {
      if (existing.has(moduleId)) {
        skipped += 1
        continue
      }
      const ok = await download(courseId, moduleId)
      if (ok) {
        pulled += 1
        process.stdout.write(`+ ${courseId}/${moduleId}\n`)
      } else {
        missing += 1
      }
    }
  }

  console.log(`Done: pulled ${pulled}, skipped ${skipped}, not on hosting ${missing}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
