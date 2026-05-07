import type { ModelOption } from "@/lib/types"
import { OPENROUTER_MODEL_ID, OPENROUTER_PROVIDER, PROMPT_FEE_IDR, PUBLIC_AI_NAME } from "@/lib/ai/openrouter-config"

export const SWIFT_AI_MODEL_KEY = OPENROUTER_MODEL_ID
export const SWIFT_AI_MODEL_NAME = OPENROUTER_MODEL_ID
export const SWIFT_AI_DISPLAY_NAME = PUBLIC_AI_NAME

export const DEFAULT_MODEL_OPTIONS: ModelOption[] = [
  {
    key: OPENROUTER_MODEL_ID,
    label: PUBLIC_AI_NAME,
    provider: OPENROUTER_PROVIDER,
    modelName: OPENROUTER_MODEL_ID,
    price: PROMPT_FEE_IDR,
    isActive: true,
    rank: 1,
    description: "AI coding utama Swift untuk membangun dan memperbaiki aplikasi.",
    note: "Rp 2.000 untuk setiap prompt",
  },
]

export const DEFAULT_MODEL_KEY = OPENROUTER_MODEL_ID
export const OPENROUTER_MODEL_KEYS = [OPENROUTER_MODEL_ID]

export function isVisionCapableModel(modelName: string): boolean {
  return modelName === OPENROUTER_MODEL_ID
}

export const isFreeModel = (model: string) => model === OPENROUTER_MODEL_ID
export const getModelPrice = () => PROMPT_FEE_IDR

export function getModelDisplayMeta() {
  return {
    label: PUBLIC_AI_NAME,
    description: "AI coding utama Swift untuk membangun dan memperbaiki aplikasi.",
    note: "Rp 2.000 untuk setiap prompt",
    rank: 1,
  }
}

export const formatModelLabel = () => PUBLIC_AI_NAME
