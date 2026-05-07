import type { ModelOption } from "@/lib/types"
import { DEFAULT_MODEL_OPTIONS, DEEPSEEK_MODEL_KEY, SWIFT_AI_MODEL_KEY } from "@/lib/ai/models"
import { env } from "@/lib/env"

export function getRuntimeModelOptions(): ModelOption[] {
  return DEFAULT_MODEL_OPTIONS.map((model) => {
    if (model.key !== SWIFT_AI_MODEL_KEY || !env.deepseekApiKey) {
      return model
    }

    return {
      ...model,
      provider: "deepseek",
      modelName: DEEPSEEK_MODEL_KEY,
    }
  })
}
