import type { GeneratedFile } from "@/lib/types"

export type FullStackCategory = "frontend" | "api" | "data" | "config"

export type FullStackCoverage = {
  hasFrontend: boolean
  hasApi: boolean
  hasDataLayer: boolean
  hasConfig: boolean
}

export type FullStackValidationResult = {
  coverage: FullStackCoverage
  missingCategories: FullStackCategory[]
}

export type FullStackRepairResult = {
  files: GeneratedFile[]
  missingBeforeRepair: FullStackCategory[]
  addedFiles: GeneratedFile[]
  repaired: boolean
}

const FRONTEND_PAGE_PATTERN = /^app\/(?:.+\/)?page\.(tsx|ts|jsx|js)$/i
const API_ROUTE_PATTERN = /^app\/api\/.+\/route\.ts$/i
const PRISMA_PATTERN = /^prisma\/schema\.prisma$/i
const DATA_LAYER_PATTERN = /^lib\/(db|services)\/.+\.(ts|tsx)$/i
const CONFIG_PATTERN = /^\.env\.example$/i

export function validateFullStackFiles(files: GeneratedFile[]): FullStackValidationResult {
  const normalizedPaths = files.map((file) => normalizePath(file.path))

  const hasFrontend = normalizedPaths.some((path) => FRONTEND_PAGE_PATTERN.test(path))
  const hasApi = normalizedPaths.some((path) => API_ROUTE_PATTERN.test(path))
  const hasDataLayer = normalizedPaths.some(
    (path) => PRISMA_PATTERN.test(path) || DATA_LAYER_PATTERN.test(path)
  )
  const hasConfig = normalizedPaths.some((path) => CONFIG_PATTERN.test(path))

  const missingCategories: FullStackCategory[] = []
  if (!hasFrontend) missingCategories.push("frontend")
  if (!hasApi) missingCategories.push("api")
  if (!hasDataLayer) missingCategories.push("data")
  if (!hasConfig) missingCategories.push("config")

  return {
    coverage: {
      hasFrontend,
      hasApi,
      hasDataLayer,
      hasConfig,
    },
    missingCategories,
  }
}

export function autoRepairFullStackFiles(
  files: GeneratedFile[],
  scaffoldFiles: GeneratedFile[]
): FullStackRepairResult {
  const validation = validateFullStackFiles(files)
  if (validation.missingCategories.length === 0) {
    return {
      files,
      missingBeforeRepair: [],
      addedFiles: [],
      repaired: false,
    }
  }

  const byPath = new Map<string, GeneratedFile>()
  for (const file of files) {
    byPath.set(normalizePath(file.path), file)
  }

  const addedFiles: GeneratedFile[] = []

  for (const category of validation.missingCategories) {
    const candidate = pickFallbackFileForCategory(category, scaffoldFiles, byPath)
    if (!candidate) {
      continue
    }

    const path = normalizePath(candidate.path)
    if (byPath.has(path)) {
      continue
    }

    byPath.set(path, candidate)
    addedFiles.push(candidate)
  }

  return {
    files: Array.from(byPath.values()).sort((left, right) => left.path.localeCompare(right.path)),
    missingBeforeRepair: validation.missingCategories,
    addedFiles,
    repaired: addedFiles.length > 0,
  }
}

function pickFallbackFileForCategory(
  category: FullStackCategory,
  scaffoldFiles: GeneratedFile[],
  currentFilesByPath: Map<string, GeneratedFile>
) {
  const preferredCandidates =
    category === "frontend"
      ? ["app/page.tsx", "app/page.ts", "app/layout.tsx"]
      : category === "api"
        ? ["app/api/health/route.ts", "app/api/projects/route.ts", "app/api/generate/route.ts"]
        : category === "data"
          ? ["prisma/schema.prisma", "lib/services/project.service.ts", "lib/db/client.ts"]
          : [".env.example"]

  for (const preferred of preferredCandidates) {
    const exact = scaffoldFiles.find(
      (file) => normalizePath(file.path).toLowerCase() === preferred.toLowerCase()
    )
    if (exact && !currentFilesByPath.has(normalizePath(exact.path))) {
      return exact
    }
  }

  const fallback = scaffoldFiles.find((file) => {
    const path = normalizePath(file.path)
    if (currentFilesByPath.has(path)) {
      return false
    }

    if (category === "frontend") return FRONTEND_PAGE_PATTERN.test(path)
    if (category === "api") return API_ROUTE_PATTERN.test(path)
    if (category === "data") return PRISMA_PATTERN.test(path) || DATA_LAYER_PATTERN.test(path)
    return CONFIG_PATTERN.test(path)
  })

  return fallback || null
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").trim()
}

