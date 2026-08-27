#!/usr/bin/env node
/**
 * Export full lesson JSON from Firestore (admin SDK) into public/lessons/{courseId}/.
 */
const fs = require('node:fs')
const path = require('node:path')
const {
  initAdminForLocalScripts,
  printCredentialHelp,
  isCredentialError,
} = require('../firebase/functions/scripts/localAdminInit')

const root = path.resolve(__dirname, '..')
const COURSES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['algebra-1', 'algebra-2', 'precalculus', 'bus-math', 'statistics']

function isFullModuleContent(data) {
  if (!data || typeof data !== 'object') return false
  if (Array.isArray(data.blocks) && data.blocks.length > 0) return true
  if (Array.isArray(data.questions) && data.questions.length > 0) return true
  if (data.question && typeof data.question === 'object') return true
  if (Array.isArray(data.cards) && data.cards.length > 0) return true
  if (Array.isArray(data.bank) && data.bank.length > 0) return true
  if (Array.isArray(data.rounds) && data.rounds.length > 0) return true
  if (Array.isArray(data.examples) && data.examples.length > 0) return true
  if (Array.isArray(data.explanation) && data.explanation.length > 0) return true
  if (data.concept && typeof data.concept === 'object') return true
  return false
}

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

async function loadOutline(db, courseId) {
  const outlinePath = path.join(root, 'public', 'courses', courseId, 'course.json')
  if (fs.existsSync(outlinePath)) {
    return JSON.parse(fs.readFileSync(outlinePath, 'utf8'))
  }

  const courseSnap = await db.collection('courses').doc(courseId).get()
  if (!courseSnap.exists) {
    return null
  }

  const course = courseSnap.data()
  return {
    id: course.id ?? courseId,
    title: course.title ?? courseId,
    description: course.description ?? '',
    chapters: course.chapters ?? [],
  }
}

async function main() {
  const db = initAdminForLocalScripts()
  let totalExported = 0

  for (const courseId of COURSES) {
    const outline = await loadOutline(db, courseId)
    if (!outline) {
      console.log(`skip ${courseId}: no outline (local or Firestore)`)
      continue
    }

    const outlinePath = path.join(root, 'public', 'courses', courseId, 'course.json')
    if (!fs.existsSync(outlinePath)) {
      fs.mkdirSync(path.dirname(outlinePath), { recursive: true })
      fs.writeFileSync(outlinePath, `${JSON.stringify(outline, null, 2)}\n`)
      console.log(`+ wrote outline ${courseId}/course.json from Firestore`)
    }

    const needed = new Set(flattenModules(outline))
    const lessonDir = path.join(root, 'public', 'lessons', courseId)
    fs.mkdirSync(lessonDir, { recursive: true })
    const existing = new Set(
      fs.readdirSync(lessonDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, '')),
    )

    const modsSnap = await db.collection('courses').doc(courseId).collection('modules').get()
    let exported = 0
    let skippedThin = 0
    let already = 0

    for (const docSnap of modsSnap.docs) {
      const moduleId = docSnap.id
      if (!needed.has(moduleId)) continue
      const data = docSnap.data()
      if (!isFullModuleContent(data)) {
        skippedThin += 1
        continue
      }

      const localPath = path.join(lessonDir, `${moduleId}.json`)
      if (existing.has(moduleId)) {
        let localFull = false
        try {
          localFull = isFullModuleContent(JSON.parse(fs.readFileSync(localPath, 'utf8')))
        } catch {
          localFull = false
        }
        if (localFull) {
          already += 1
          continue
        }
      }

      const payload = { ...data, id: data.id || moduleId }
      fs.writeFileSync(localPath, `${JSON.stringify(payload, null, 2)}\n`)
      exported += 1
      process.stdout.write(`+ ${courseId}/${moduleId}\n`)
    }

    totalExported += exported
    const haveNow = fs.readdirSync(lessonDir).filter((f) => f.endsWith('.json')).length
    console.log(
      `${courseId}: exported ${exported}, already local ${already}, thin/stub ${skippedThin}, total files now ${haveNow}, outline needs ${needed.size}`,
    )
  }

  console.log(`\nTotal exported: ${totalExported}`)
}

main().catch((err) => {
  if (isCredentialError(err)) {
    printCredentialHelp()
  }
  console.error(err)
  process.exit(1)
})
