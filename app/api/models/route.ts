import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { ModelConfigService } from "@/lib/services/model-config.service"
import { env } from "@/lib/env"
import { SWIFT_AI_DISPLAY_NAME, SWIFT_AI_MODEL_KEY, getModelDisplayMeta } from "@/lib/ai/models"

export async function GET() {
  const session = await auth()

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const models = await ModelConfigService.getActiveModels()

  const availableModels = models.filter((model) => {
    return model.key === SWIFT_AI_MODEL_KEY && model.provider === "openai" && Boolean(env.openAiApiKey)
  }).sort((left, right) => {
    const leftRank = getModelDisplayMeta(left.modelName || left.key).rank ?? Number.POSITIVE_INFINITY
    const rightRank = getModelDisplayMeta(right.modelName || right.key).rank ?? Number.POSITIVE_INFINITY
    return leftRank - rightRank
  })

  return NextResponse.json({
    models:
      availableModels.map((model) => ({
        ...model,
        ...getModelDisplayMeta(model.modelName || model.key),
        label: SWIFT_AI_DISPLAY_NAME,
        modelName: SWIFT_AI_DISPLAY_NAME,
        provider: "swift-ai",
        description: "AI coding utama Swift untuk membangun dan memperbaiki aplikasi.",
        note: "Rp 2.000 untuk setiap prompt",
      })),
  })
}
