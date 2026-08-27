/**
 * Exporting math-game JSON out of the Games catalog.
 *
 * Mirrors the lesson exporter in Course Builder: browser downloads and folder
 * exports both use the menu-visible title. Folder export also dual-writes the
 * hosting alias `{gameId}-game.json` so shipped loaders keep working.
 */

import { loadGameModuleAsync } from '../data/mathGames'
import { slugify, writeJsonToDirectory } from './courseEditor'

/** Seed games for a course live in one folder next to the lesson folders. */
export function gameFolderName(courseId) {
  return `${slugify(courseId) || 'course'}-games`
}

/** Repo / hosting filename — matches the shipped seed files. */
export function buildGameFilename(gameId) {
  return `${slugify(gameId) || 'game'}-game.json`
}

/** User-facing export name from the catalog/menu title. */
export function buildGameDownloadName(courseId, gameId, title = null) {
  const safeCourse = slugify(courseId) || 'course'
  const label = title ? slugify(title) : slugify(gameId) || 'game'
  return `${safeCourse}-${label}-game.json`
}

/**
 * Unique menu-title filenames for a batch of games (same rule as browser downloads).
 * @returns {Map<string, string>} gameId → filename
 */
export function allocateGameExportFilenames(courseId, files) {
  const used = new Set()
  const filenames = new Map()

  for (const { gameId, title } of files) {
    if (!gameId) {
      continue
    }

    let filename = buildGameDownloadName(courseId, gameId, title)
    if (used.has(filename)) {
      filename = buildGameDownloadName(courseId, gameId, `${title ?? gameId}-${gameId}`)
    }
    if (used.has(filename)) {
      filename = buildGameDownloadName(courseId, gameId, null)
    }

    used.add(filename)
    filenames.set(gameId, filename)
  }

  return filenames
}

/** Drop runtime-only fields so the file can be re-imported as authored JSON. */
export function toExportableGame(moduleData, { courseId, gameId } = {}) {
  const rest = { ...moduleData }
  delete rest.__source
  delete rest.updatedAt
  delete rest.publishedAt
  delete rest.publishedBy
  return {
    type: 'math-game',
    ...rest,
    id: rest.id ?? gameId,
    courseId: rest.courseId ?? courseId,
  }
}

/**
 * Load every game body for a course (draft → Hub → shipped file).
 * Returns what loaded plus the ids that could not be read, so the caller can say so.
 */
export async function gatherGameExports(courseId, games, { includeDraft = true } = {}) {
  const files = []
  const failed = []

  for (const game of games) {
    try {
      const body = await loadGameModuleAsync(courseId, game.id, { includeDraft })
      files.push({
        gameId: game.id,
        title: game.title,
        data: toExportableGame(body, { courseId, gameId: game.id }),
      })
    } catch {
      failed.push(game.id)
    }
  }

  return { files, failed }
}

/**
 * Pick the project's `public` folder; writes menu-title JSON plus hosting aliases:
 *   lessons/{courseId}-games/{course}-{title}-game.json
 *   lessons/{courseId}-games/{gameId}-game.json
 */
export async function exportGamesToFolder(courseId, files) {
  const root = await window.showDirectoryPicker({ mode: 'readwrite' })
  const lessonsRoot = await root.getDirectoryHandle('lessons', { create: true })
  const folder = gameFolderName(courseId)
  const gamesDir = await lessonsRoot.getDirectoryHandle(folder, { create: true })
  const filenames = allocateGameExportFilenames(courseId, files)

  await Promise.all(
    files.map(async ({ gameId, data }) => {
      const primary = filenames.get(gameId) ?? buildGameDownloadName(courseId, gameId, null)
      const hosting = buildGameFilename(gameId)
      await writeJsonToDirectory(gamesDir, primary, data)
      if (primary !== hosting) {
        await writeJsonToDirectory(gamesDir, hosting, data)
      }
    }),
  )

  return { path: `lessons/${folder}/`, count: files.length }
}
