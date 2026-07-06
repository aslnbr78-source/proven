import { flattenModules } from '../utils/courseOutline'

export function createCourseModulePublishPlan(outline, modules = {}, existingModuleIds = []) {
  const outlineModuleIds = new Set(
    flattenModules(outline)
      .map((module) => module.id)
      .filter(Boolean),
  )

  const modulesToWrite = Object.fromEntries(
    Object.entries(modules ?? {}).filter(([moduleId]) => outlineModuleIds.has(moduleId)),
  )
  const moduleIdsToDelete = existingModuleIds.filter((moduleId) => !outlineModuleIds.has(moduleId))

  return { outlineModuleIds, modulesToWrite, moduleIdsToDelete }
}
