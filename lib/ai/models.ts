import type { ModelOption } from "@/lib/types"

const PROMPT_FEE_IDR = 2000
export const SWIFT_AI_MODEL_KEY = "swift-ai"
export const SWIFT_AI_MODEL_NAME = SWIFT_AI_MODEL_KEY
export const SWIFT_AI_DISPLAY_NAME = "Swift AI"

export type ModelDisplayMeta = Pick<ModelOption, "label" | "description" | "note" | "rank">

const OPENROUTER_MODEL_ALIAS: Record<string, string> = {
  "openrouter/auto": "openrouter/free",
}

const toTitleCase = (value: string) =>
  value
    .split(/[-_.\s]+/g)
    .filter(Boolean)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ")

const normalizeModelKey = (value: string) => {
  const trimmed = value.trim().toLowerCase()
  return OPENROUTER_MODEL_ALIAS[trimmed] || trimmed
}

export const OPENROUTER_FREE_MODEL_OPTIONS: ModelOption[] = [
  {
    key: SWIFT_AI_MODEL_KEY,
    label: SWIFT_AI_DISPLAY_NAME,
    provider: "openai",
    modelName: SWIFT_AI_MODEL_NAME,
    price: PROMPT_FEE_IDR,
    isActive: true,
    rank: 1,
    description: "AI coding utama Swift untuk membangun dan memperbaiki aplikasi.",
    note: "Rp 2.000 untuk setiap prompt",
  },
]

const ACTIVE_OPENROUTER_MODEL_KEYS = new Set([
  SWIFT_AI_MODEL_KEY,
])

const MODEL_LOOKUP = new Map<string, ModelOption>(
  OPENROUTER_FREE_MODEL_OPTIONS.map((model) => [normalizeModelKey(model.key), model])
)

const LEGACY_AGENTROUTER_MODEL_OPTIONS_BASE: ModelOption[] = [
  {
    key: "glm-4.6",
    label: "GLM-4.6",
    provider: "agentrouter",
    modelName: "glm-4.6",
    price: PROMPT_FEE_IDR,
    isActive: true,
  },
  {
    key: "glm-4.5",
    label: "GLM-4.5",
    provider: "agentrouter",
    modelName: "glm-4.5",
    price: PROMPT_FEE_IDR,
    isActive: true,
  },
]

export const DEFAULT_MODEL_OPTIONS: ModelOption[] = OPENROUTER_FREE_MODEL_OPTIONS.filter((model) =>
  ACTIVE_OPENROUTER_MODEL_KEYS.has(normalizeModelKey(model.key))
)

export const LEGACY_AGENTROUTER_MODEL_OPTIONS: ModelOption[] = LEGACY_AGENTROUTER_MODEL_OPTIONS_BASE

export const DEFAULT_MODEL_KEY = DEFAULT_MODEL_OPTIONS[0].key

export const OPENROUTER_MODEL_KEYS = DEFAULT_MODEL_OPTIONS.map((model) => model.key)

export const isFreeModel = (model: string) => {
  const normalized = normalizeModelKey(model)
  return normalized === SWIFT_AI_MODEL_KEY || normalized === SWIFT_AI_MODEL_NAME
}

export const getModelPrice = (model: string) => {
  const normalized = normalizeModelKey(model)
  const directMatch = MODEL_LOOKUP.get(normalized)
  return directMatch?.price || PROMPT_FEE_IDR
}

export function getModelDisplayMeta(model: string): ModelDisplayMeta {
  const normalized = normalizeModelKey(model)
  const directMatch = MODEL_LOOKUP.get(normalized)

  if (directMatch) {
    return {
      label: directMatch.label,
      description: directMatch.description,
      note: directMatch.note,
      rank: directMatch.rank,
    }
  }

  const cleaned = normalized.replace(/:free\b/gi, "")
  const segments = cleaned.split("/").filter(Boolean)
  const slug = segments.at(-1) || cleaned
  const vendor = segments.length > 1 ? segments[0] : ""
  const slugLabel = toTitleCase(slug)

  if (!vendor) {
    return { label: slugLabel }
  }

  const vendorLabel = toTitleCase(vendor)
  if (slugLabel.toLowerCase().startsWith(vendorLabel.toLowerCase())) {
    return { label: slugLabel }
  }

  return { label: `${vendorLabel} ${slugLabel}`.trim() }
}

export const formatModelLabel = (model: string) => getModelDisplayMeta(model).label
