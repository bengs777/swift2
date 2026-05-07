import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { ModelConfigService } from "@/lib/services/model-config.service"
import { env } from "@/lib/env"
import { SWIFT_AI_DISPLAY_NAME, SWIFT_AI_MODEL_KEY, DEEPSEEK_MODEL_KEY, DEEPSEEK_DISPLAY_NAME, getModelDisplayMeta } from "@/lib/ai/models"

export async function GET() {
  const session = await auth()

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const models = await ModelConfigService.getActiveModels()

  const availableModels = models.filter((model) => {
    if (model.key === SWIFT_AI_MODEL_KEY && model.provider === "openai" && Boolean(env.openAiApiKey)) return true
    if (model.key === DEEPSEEK_MODEL_KEY && model.provider === "deepseek" && Boolean(env.deepseekApiKey)) return true
    return false
  }).sort((left, right) => {
    const leftRank = getModelDisplayMeta(left.modelName || left.key).rank ?? Number.POSITIVE_INFINITY
    const rightRank = getModelDisplayMeta(right.modelName || right.key).rank ?? Number.POSITIVE_INFINITY
    return leftRank - rightRank
  })

  return NextResponse.json({
    models:
      availableModels.map((model) => {
        const isDeepseek = model.key === DEEPSEEK_MODEL_KEY
        const displayMeta = getModelDisplayMeta(model.modelName || model.key)
        return {
          ...model,
          ...displayMeta,
          label: isDeepseek ? DEEPSEEK_DISPLAY_NAME : SWIFT_AI_DISPLAY_NAME,
          modelName: isDeepseek ? model.modelName : SWIFT_AI_DISPLAY_NAME,
          provider: "swift-ai",
          description: isDeepseek
            ? "Swift AI Vision cepat untuk full-stack generation dan mendukung image input."
            : "AI coding utama Swift untuk membangun dan memperbaiki aplikasi.",
          note: "Rp 2.000 untuk setiap prompt",
        }
      }),
  })
}
