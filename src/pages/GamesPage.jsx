import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import MathGameModule from '../components/MathGameModule'
import CourseCatalogGrid from '../components/CourseCatalogGrid'
import GameJsonImport from '../components/games/GameJsonImport'
import GameJsonEditor from '../components/games/GameJsonEditor'
import GameChapterAccordion from '../components/games/GameChapterAccordion'
import GameLeaderboardPanel from '../components/games/GameLeaderboardPanel'
import GameTrapReport from '../components/games/GameTrapReport'
import ContentWorkspaceNav from '../components/layout/ContentWorkspaceNav'
import DashboardBackLink from '../components/layout/DashboardBackLink'
import PageHeader from '../components/layout/PageHeader'
import PageLoader from '../components/PageLoader'
import AppNavLink from '../components/layout/AppNavLink'
import { useAuth } from '../context/AuthContext'
import {
  getGameCourseByIdAsync,
  getMathGameAsync,
  listGameCoursesAsync,
  loadGameModuleAsync,
} from '../data/mathGames'
import {
  createEmptyDraftGameCourse,
  deleteDraftGameCourse,
  saveDraftGameImport,
} from '../services/gameCatalogStore'
import {
  deleteGameCourseFromHub,
  deleteGameEverywhere,
  publishDraftGameCourseToHub,
} from '../services/gameCatalogFirestore'
import { loadOutline } from '../services/contentStore'
import { downloadJsonBatch, isFolderExportSupported } from '../utils/courseEditor'
import {
  allocateGameExportFilenames,
  buildGameDownloadName,
  buildGameFilename,
  exportGamesToFolder,
  gameFolderName,
  gatherGameExports,
  toExportableGame,
} from '../utils/gameExport'
import { groupGamesByChapter } from '../utils/gameChapters'
import { flattenModules } from '../utils/courseOutline'
import { isGameCatalogOutlineModule } from '../utils/moduleImport'
import { ROLES } from '../utils/roles'
import {
  buildContentWorkspaceLink,
  CONTENT_WORKSPACE_SECTIONS,
} from '../utils/workspacePaths'

function slugifyCourseId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function GamesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isAdmin = profile?.role === ROLES.ADMIN
  const isEditor = isAdmin || profile?.role === ROLES.TEACHER
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newId, setNewId] = useState('')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  // Admins manage every course here; students only see courses that have games.
  const visibleCourses = useCallback(
    (list) => (isAdmin ? list : list.filter((course) => course.games.length > 0)),
    [isAdmin],
  )

  const reload = useCallback(() => {
    setLoading(true)
    return listGameCoursesAsync({ includeDraft: isAdmin })
      .then((list) => setCourses(visibleCourses(list)))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false))
  }, [isAdmin, visibleCourses])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleCreateGamesOnly = async (event) => {
    event.preventDefault()
    setCreateError('')
    setCreating(true)
    try {
      const title = newTitle.trim()
      const id = slugifyCourseId(newId || title)
      if (!title) {
        throw new Error('Title is required.')
      }
      if (!id) {
        throw new Error('Course id is required.')
      }
      await createEmptyDraftGameCourse({ id, title })
      setCreateOpen(false)
      setNewTitle('')
      setNewId('')
      await reload()
      navigate(`/games/${id}`)
    } catch (error) {
      setCreateError(error?.message || 'Could not create course.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="courses-page page-container pb-safe">
      <PageHeader
        eyebrow="Practice"
        title="Games"
        subtitle={
          isAdmin
            ? 'Every course appears here. Open one to import, publish, or delete its games.'
            : 'Choose a course to see its practice games.'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {isEditor ? (
              <AppNavLink to="/teacher/team-challenge" className="btn-primary !py-1.5 !text-sm">
                Team Challenge
              </AppNavLink>
            ) : null}
            <DashboardBackLink to="/today" label="Today" />
          </div>
        }
      />

      {isEditor ? <ContentWorkspaceNav /> : null}

      {isAdmin ? (
        <div className="mt-2 mb-4">
          <button
            type="button"
            className="btn-secondary !py-1.5 !text-sm"
            onClick={() => {
              setCreateOpen((open) => !open)
              setCreateError('')
            }}
          >
            {createOpen ? '− Cancel' : '+ Add Games-only course'}
          </button>
          {createOpen ? (
            <form
              onSubmit={(e) => void handleCreateGamesOnly(e)}
              className="mt-3 max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="text-sm text-slate-600">
                Create a catalog course that is not tied to a lesson course (optional). Lesson courses
                already appear above automatically.
              </p>
              <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Title
                <input
                  className="input-modern mt-1 w-full"
                  value={newTitle}
                  onChange={(e) => {
                    setNewTitle(e.target.value)
                    if (!newId) setNewId(slugifyCourseId(e.target.value))
                  }}
                  placeholder="e.g. Contest Math Games"
                  required
                />
              </label>
              <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Course id
                <input
                  className="input-modern mt-1 w-full font-mono text-sm"
                  value={newId}
                  onChange={(e) => setNewId(slugifyCourseId(e.target.value))}
                  placeholder="contest-math-games"
                  required
                />
              </label>
              {createError ? <p className="mt-2 text-sm text-rose-700">{createError}</p> : null}
              <button type="submit" className="btn-primary mt-3 !py-1.5 !text-sm" disabled={creating}>
                {creating ? 'Creating…' : 'Create draft course'}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      <CourseCatalogGrid
        courses={courses}
        loading={loading}
        title=""
        subtitle=""
        hrefBase="/games"
        countNoun="game"
        ctaLabel="View games →"
        emptyMessage="No courses available yet."
      />
    </div>
  )
}

function CourseGamesPage() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const isAdmin = profile?.role === ROLES.ADMIN
  const isEditor = isAdmin || profile?.role === ROLES.TEACHER
  const [course, setCourse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [linkedIds, setLinkedIds] = useState(() => new Set())
  const [linkedMenuTitles, setLinkedMenuTitles] = useState(() => new Map())
  const [importOpen, setImportOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [statusError, setStatusError] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [editingGameId, setEditingGameId] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const next = await getGameCourseByIdAsync(courseId, { includeDraft: isAdmin })
      setCourse(next)
    } catch {
      setCourse(null)
    } finally {
      setLoading(false)
    }
  }, [courseId, isAdmin])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    let cancelled = false

    async function loadLinked() {
      if (!courseId || course?.gamesOnly) {
        if (!cancelled) {
          setLinkedIds(new Set())
          setLinkedMenuTitles(new Map())
        }
        return
      }
      try {
        const outline = await loadOutline(courseId)
        if (cancelled) return
        const ids = new Set()
        const titles = new Map()
        for (const mod of flattenModules(outline) ?? []) {
          if (isGameCatalogOutlineModule(mod) && mod.id) {
            ids.add(mod.id)
            const menuTitle = String(mod.title ?? '').trim()
            if (menuTitle) {
              titles.set(mod.id, menuTitle)
            }
          }
        }
        setLinkedIds(ids)
        setLinkedMenuTitles(titles)
      } catch {
        if (!cancelled) {
          setLinkedIds(new Set())
          setLinkedMenuTitles(new Map())
        }
      }
    }

    void loadLinked()
    return () => {
      cancelled = true
    }
  }, [courseId, course?.gamesOnly, course?.games])

  const handleImported = async (moduleData) => {
    try {
      const payload = { ...moduleData, courseId }
      await saveDraftGameImport(courseId, payload, {
        title: course?.title,
        description: course?.description,
      })
      setStatusMessage(`Saved “${moduleData.title}” to local draft. Publish to Hub when ready.`)
      setStatusError('')
      await reload()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error?.message || 'Could not save draft.' }
    }
  }

  const handlePublish = async () => {
    setPublishing(true)
    setStatusError('')
    setStatusMessage('')
    try {
      await publishDraftGameCourseToHub(courseId, {
        uid: user?.uid,
        email: user?.email ?? profile?.email,
      })
      setStatusMessage(
        'Published to Hub. Local drafts were cleared — games should now show as Hub.',
      )
      await reload()
    } catch (error) {
      setStatusError(error?.message || 'Publish failed.')
    } finally {
      setPublishing(false)
    }
  }

  const collectExports = async () => {
    const gamesOnMenu = course?.gamesOnly
      ? course.games
      : course.games.filter((game) => linkedIds.has(game.id))
    if (gamesOnMenu.length === 0) {
      throw new Error(
        course?.gamesOnly
          ? 'No game JSON could be read for this course.'
          : 'No games linked on the current course outline to export.',
      )
    }
    // Prefer Course Builder outline/menu titles over embedded JSON / catalog titles.
    const gamesForExport = gamesOnMenu.map((game) => ({
      ...game,
      title: linkedMenuTitles.get(game.id) || game.title,
    }))
    const { files, failed } = await gatherGameExports(courseId, gamesForExport, {
      includeDraft: isAdmin,
    })
    if (files.length === 0) {
      throw new Error('No game JSON could be read for this course.')
    }
    return { files, failed, skipped: course.games.length - gamesOnMenu.length }
  }

  const describeSkipped = (failed, skipped = 0) => {
    const parts = []
    if (skipped > 0) {
      parts.push(`${skipped} catalog game(s) not on the outline were skipped`)
    }
    if (failed.length > 0) {
      parts.push(`${failed.length} game(s) could not be read: ${failed.join(', ')}`)
    }
    return parts.length > 0 ? ` ${parts.join('. ')}.` : ''
  }

  const handleExportAll = async () => {
    if (!isAdmin) {
      setStatusError('Only admins can export game JSON.')
      return
    }
    setExporting(true)
    setStatusError('')
    setStatusMessage('')
    try {
      const { files, failed, skipped } = await collectExports()
      const filenames = allocateGameExportFilenames(courseId, files)
      await downloadJsonBatch(
        files.flatMap(({ gameId, data }) => {
          const primary = filenames.get(gameId) ?? buildGameDownloadName(courseId, gameId, null)
          const hosting = buildGameFilename(gameId)
          return primary === hosting
            ? [{ filename: primary, data }]
            : [
                { filename: primary, data },
                { filename: hosting, data },
              ]
        }),
      )
      setStatusMessage(
        `Downloaded ${files.length} game JSON file(s) from the course outline (menu-title names + gameId hosting copies).${describeSkipped(failed, skipped)}`,
      )
    } catch (error) {
      setStatusError(error?.message || 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  const handleExportToFolder = async () => {
    if (!isAdmin) {
      setStatusError('Only admins can export game JSON.')
      return
    }
    if (!isFolderExportSupported()) {
      setStatusError(
        `Folder export needs Chrome or Edge. Use Export JSON (Downloads) and move the files into public/lessons/${gameFolderName(courseId)}/.`,
      )
      return
    }

    setExporting(true)
    setStatusError('')
    setStatusMessage('')
    try {
      const { files, failed, skipped } = await collectExports()
      const result = await exportGamesToFolder(courseId, files)
      setStatusMessage(
        `Saved ${result.count} game file(s) to ${result.path} (menu-title names + gameId hosting copies).${describeSkipped(failed, skipped)}`,
      )
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatusMessage('Export cancelled.')
      } else {
        setStatusError(error?.message || 'Could not export to folder.')
      }
    } finally {
      setExporting(false)
    }
  }

  const handleExportGame = async (game) => {
    if (!isAdmin) {
      setStatusError('Only admins can export game JSON.')
      return
    }
    setStatusError('')
    setStatusMessage('')
    try {
      const body = await loadGameModuleAsync(courseId, game.id, { includeDraft: isAdmin })
      const menuTitle = linkedMenuTitles.get(game.id) || game.title
      const data = toExportableGame(body, { courseId, gameId: game.id })
      const primary = buildGameDownloadName(courseId, game.id, menuTitle)
      const hosting = buildGameFilename(game.id)
      await downloadJsonBatch(
        primary === hosting
          ? [{ filename: primary, data }]
          : [
              { filename: primary, data },
              { filename: hosting, data },
            ],
      )
      setStatusMessage(`Exported “${menuTitle}” (menu-title name + gameId hosting copy).`)
    } catch (error) {
      setStatusError(error?.message || 'Could not export that game.')
    }
  }

  const handleDeleteGame = async (game) => {
    const confirmed = window.confirm(
      `Delete “${game.title}” from ${course.title}?\n\nThis removes it from the Games catalog for everyone. Any lesson section that links this game will stop loading it.`,
    )
    if (!confirmed) {
      return
    }

    setDeletingId(game.id)
    setStatusError('')
    setStatusMessage('')
    try {
      await deleteGameEverywhere(courseId, game.id, {
        uid: user?.uid,
        email: user?.email ?? profile?.email,
      })
      setStatusMessage(`Deleted “${game.title}”.`)
      await reload()
    } catch (error) {
      setStatusError(error?.message || 'Delete failed.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteCourse = async () => {
    const confirmed = window.confirm(
      `Delete the Games-only course “${course.title}”?\n\nAll of its games are removed from the catalog.`,
    )
    if (!confirmed) {
      return
    }

    setStatusError('')
    try {
      await deleteDraftGameCourse(courseId)
      await deleteGameCourseFromHub(courseId)
      navigate('/games')
    } catch (error) {
      setStatusError(error?.message || 'Could not delete course.')
    }
  }

  const chapterGroups = useMemo(
    () => groupGamesByChapter(course?.games ?? []),
    [course?.games],
  )
  const hasDraftGames = Boolean(course?.games?.some((game) => game.source === 'draft'))

  if (loading) {
    return <PageLoader label="Loading games…" />
  }

  if (!course) {
    return <Navigate to="/games" replace />
  }

  return (
    <div className="page-container pb-safe">
      <PageHeader
        eyebrow="Games"
        title={course.title}
        subtitle={
          course.games.length > 0
            ? `${course.description ? `${course.description} · ` : ''}${course.games.length} game${course.games.length === 1 ? '' : 's'} across ${chapterGroups.length} chapter${chapterGroups.length === 1 ? '' : 's'}`
            : course.description
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {isEditor ? (
              <AppNavLink
                to={`/teacher/team-challenge?course=${encodeURIComponent(courseId)}`}
                className="btn-primary !py-1.5 !text-sm"
              >
                Team Challenge
              </AppNavLink>
            ) : null}
            <DashboardBackLink to="/games" label="All courses" />
          </div>
        }
      />

      {isEditor ? <ContentWorkspaceNav courseId={courseId} /> : null}

      {isEditor ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <button
              type="button"
              className="btn-secondary !py-1.5 !text-sm"
              onClick={() => setImportOpen((open) => !open)}
            >
              {importOpen ? '− Close import' : '+ Import JSON'}
            </button>
          ) : null}
          {isAdmin ? (
            <button
              type="button"
              className="btn-primary !py-1.5 !text-sm"
              disabled={publishing}
              onClick={() => void handlePublish()}
            >
              {publishing ? 'Publishing…' : 'Publish to Hub'}
            </button>
          ) : null}
          {isAdmin ? (
            <>
              <button
                type="button"
                className="btn-secondary !py-1.5 !text-sm"
                disabled={exporting || course.games.length === 0}
                onClick={() => void handleExportAll()}
                title="Download every game in this course as JSON"
              >
                {exporting ? 'Exporting…' : 'Export JSON'}
              </button>
              <button
                type="button"
                className="btn-secondary !py-1.5 !text-sm"
                disabled={exporting || course.games.length === 0}
                onClick={() => void handleExportToFolder()}
                title={`Choose your project's public folder — writes lessons/${gameFolderName(courseId)}/`}
              >
                Export to folder…
              </button>
              <a
                href="/templates/math-game.template.json"
                download="math-game.template.json"
                className="text-sm font-semibold text-indigo-700 no-underline hover:underline"
              >
                Template
              </a>
            </>
          ) : null}
          {isAdmin && course.gamesOnly ? (
            <button
              type="button"
              className="btn-secondary !py-1.5 !text-sm !text-rose-700"
              onClick={() => void handleDeleteCourse()}
            >
              Delete course
            </button>
          ) : null}
        </div>
      ) : null}

      {isAdmin && hasDraftGames ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Some games are local drafts. Students (and lesson links) only see games after
          <strong> Publish to Hub</strong>.
        </p>
      ) : null}

      {statusMessage ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {statusMessage}
        </p>
      ) : null}
      {statusError ? (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {statusError}
        </p>
      ) : null}

      {isAdmin && importOpen ? (
        <GameJsonImport
          courseId={courseId}
          courseTitle={course.title}
          onImported={handleImported}
          onClose={() => setImportOpen(false)}
        />
      ) : null}

      {course.games.length > 0 ? (
        <p className="mt-6 text-sm text-slate-600">
          Chapters start closed — click one to open its games.
          {linkedIds.size > 0
            ? ' Teal cards are already linked into a lesson.'
            : ''}
        </p>
      ) : null}

      <div className="mt-3">
        <GameChapterAccordion
          groups={chapterGroups}
          linkedIds={linkedIds}
          renderGame={(group) => (
            <ul className="grid gap-4 sm:grid-cols-2">
              {group.games.map((game) => {
                const linked = linkedIds.has(game.id)
                return (
                  <li
                    key={game.id}
                    className={`flex flex-col rounded-2xl border p-5 shadow-sm transition ${
                      linked
                        ? 'border-teal-300 bg-teal-50 hover:border-teal-400 hover:shadow-md'
                        : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {game.chapterDetail ? (
                        <p
                          className={`text-xs font-semibold uppercase tracking-wide ${
                            linked ? 'text-teal-800' : 'text-indigo-600'
                          }`}
                        >
                          {game.chapterDetail}
                        </p>
                      ) : game.chapterHint && group.key === '__other__' ? (
                        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                          {game.chapterHint}
                        </p>
                      ) : null}
                      {linked ? (
                        <span className="rounded-full bg-teal-200 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-teal-950">
                          In lesson
                        </span>
                      ) : null}
                      {isAdmin && game.source === 'draft' ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-amber-900">
                          Draft
                        </span>
                      ) : null}
                      {isAdmin && game.source === 'hub' ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-emerald-900">
                          Hub
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">{game.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{game.description || game.subtitle}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <AppNavLink
                        to={`/games/${course.id}/${game.id}`}
                        className={`text-sm font-semibold no-underline hover:underline ${
                          linked ? 'text-teal-800' : 'text-indigo-700'
                        }`}
                      >
                        Play →
                      </AppNavLink>
                      {isAdmin ? (
                        <button
                          type="button"
                          className="text-sm font-semibold text-slate-600 hover:underline"
                          onClick={() =>
                            setEditingGameId((current) => (current === game.id ? null : game.id))
                          }
                          title="Edit this game’s JSON"
                        >
                          {editingGameId === game.id ? 'Hide JSON' : 'Edit JSON'}
                        </button>
                      ) : null}
                      {isAdmin ? (
                        <button
                          type="button"
                          className="text-sm font-semibold text-slate-600 hover:underline"
                          onClick={() => void handleExportGame(game)}
                          title="Download this game as JSON"
                        >
                          Export
                        </button>
                      ) : null}
                      {isAdmin ? (
                        <button
                          type="button"
                          className="text-sm font-semibold text-rose-700 hover:underline disabled:opacity-50"
                          disabled={deletingId === game.id}
                          onClick={() => void handleDeleteGame(game)}
                        >
                          {deletingId === game.id ? 'Deleting…' : 'Delete'}
                        </button>
                      ) : null}
                    </div>
                    {isAdmin && editingGameId === game.id ? (
                      <GameJsonEditor
                        courseId={courseId}
                        gameId={game.id}
                        gameTitle={game.title}
                        courseTitle={course?.title}
                        courseDescription={course?.description}
                        onClose={() => setEditingGameId(null)}
                        onSaved={async () => {
                          setStatusMessage(`Saved “${game.title}” to local draft. Publish to Hub when ready.`)
                          setStatusError('')
                          await reload()
                        }}
                      />
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        />
      </div>

      {course.games.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">
          No games in this course yet.
          {isAdmin ? ' Use Import JSON above to add one, then Publish to Hub.' : ''}
        </p>
      ) : null}

      {isAdmin && course.games.length > 0 && !course.gamesOnly ? (
        <p className="mt-6 text-sm text-slate-600">
          To show these inside lessons, open{' '}
          <AppNavLink
            to={buildContentWorkspaceLink(CONTENT_WORKSPACE_SECTIONS.COURSES, course.id)}
            className="font-semibold text-indigo-700"
          >
            Course Builder
          </AppNavLink>{' '}
          and use <strong>+ Game</strong> on any section.
        </p>
      ) : null}
    </div>
  )
}

function GamePlayerPage() {
  const { courseId, gameId } = useParams()
  const { profile } = useAuth()
  const isAdmin = profile?.role === ROLES.ADMIN
  const isStaff = isAdmin || profile?.role === ROLES.TEACHER
  const [courseTitle, setCourseTitle] = useState('')
  const [meta, setMeta] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const backTo = `/games/${courseId}`

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)

    ;(async () => {
      try {
        const [course, gameMeta] = await Promise.all([
          getGameCourseByIdAsync(courseId, { includeDraft: isAdmin }),
          getMathGameAsync(courseId, gameId, { includeDraft: isAdmin }),
        ])
        if (cancelled) return
        setCourseTitle(course?.title ?? 'Games')
        setMeta(gameMeta)
        if (!gameMeta) {
          setError('Game not found.')
          return
        }
        const moduleData = await loadGameModuleAsync(courseId, gameId, {
          includeDraft: isAdmin,
        })
        if (cancelled) return
        setData(moduleData)
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load game.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [courseId, gameId, isAdmin])

  if (loading) {
    return <PageLoader label="Loading game…" />
  }

  if (!meta) {
    return (
      <div className="page-container pb-safe">
        <PageHeader title="Game not found" actions={<DashboardBackLink to="/games" label="Games" />} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-container pb-safe">
        <PageHeader
          title={meta.title}
          subtitle={error}
          actions={<DashboardBackLink to={backTo} label="Back" />}
        />
      </div>
    )
  }

  return (
    <div className="page-container pb-safe">
      <PageHeader
        eyebrow={courseTitle}
        title={meta.title}
        subtitle={meta.subtitle}
        actions={<DashboardBackLink to={backTo} label="Back to games" />}
      />
      <div className="mt-4">
        <MathGameModule data={data} courseId={courseId} moduleId={meta.id} showTitle={false} />
      </div>
      <GameLeaderboardPanel courseId={courseId} gameId={meta.id} gameTitle={meta.title} />
      {isStaff ? <GameTrapReport courseId={courseId} gameId={meta.id} /> : null}
    </div>
  )
}

export { GamesPage, CourseGamesPage, GamePlayerPage }
export default GamesPage
