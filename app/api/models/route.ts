import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { ModelConfigService } from "@/lib/services/model-config.service"
import { env } from "@/lib/env"
import { SWIFT_AI_DISPLAY_NAME, getModelDisplayMeta } from "@/lib/ai/models"

export async function GET() {
  const session = await auth()

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const models = await ModelConfigService.getActiveModels()
  const displayMeta = getModelDisplayMeta()

  return NextResponse.json({
    models: env.openRouterApiKey
      ? models.map((model) => ({
          ...model,
          ...displayMeta,
          label: SWIFT_AI_DISPLAY_NAME,
          provider: "openrouter",
          description: "AI coding utama Swift untuk membangun dan memperbaiki aplikasi.",
          note: "Rp 2.000 untuk setiap prompt",
        }))
      : [],
  })
}
