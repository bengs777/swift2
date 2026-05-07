import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { orchestratorProvider } from "@/lib/ai/providers/orchestrator-provider"
import { GenerateBillingService } from "@/lib/services/generate-billing.service"
import type { GeneratedFile } from "@/lib/types"

interface OrchestratorGenerateRequest {
  prompt: string
  projectId: string
  mode?: "CREATE" | "EXTEND"
  existingFiles?: GeneratedFile[]
}

const COST_PER_REQUEST = 2000 // IDR
const PUBLIC_PROVIDER = "Swift AI"
const PUBLIC_MODEL = "Swift AI"

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const userId = session.user.id as string

    const body = (await request.json()) as OrchestratorGenerateRequest

    // Validate request
    if (!body.prompt || typeof body.prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    const { prompt, projectId, mode = "CREATE", existingFiles = [] } = body

    // Check provider configuration
    if (!orchestratorProvider.isConfigured()) {
      return NextResponse.json(
        { error: "Orchestrator provider is not configured" },
        { status: 503 }
      )
    }

    // Check user balance
    const balanceCheck = await GenerateBillingService.checkBalance(userId, COST_PER_REQUEST)

    if (!balanceCheck.hasBalance) {
      return NextResponse.json(
        {
          error: "Insufficient balance",
          currentBalance: balanceCheck.currentBalance,
          requiredBalance: COST_PER_REQUEST,
          shortfall: balanceCheck.shortfall,
        },
        { status: 402 }
      )
    }

    // Generate code using Orchestrator
    const result = await orchestratorProvider.generate({
      prompt,
      mode: mode as "CREATE" | "EXTEND",
      existingFiles,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to generate code with Orchestrator" },
        { status: 502 }
      )
    }

    // Deduct balance for successful generation
    const chargeResult = await GenerateBillingService.deductBalance(
      userId,
      COST_PER_REQUEST,
      `Swift AI Code Generation - ${mode} mode`,
      {
        projectId: projectId || undefined,
        provider: PUBLIC_PROVIDER,
        model: PUBLIC_MODEL,
        fileCount: result.files?.length || 0,
        mode: mode,
      }
    )

    if (!chargeResult.success) {
      console.error("[v0] Failed to deduct balance:", chargeResult.error)
      // In case of charging failure, we should ideally refund or not complete the transaction
      return NextResponse.json(
        {
          success: false,
          error: "Generation succeeded but billing failed. Please contact support.",
          files: result.files || [],
        },
        { status: 500 }
      )
    }

    // Return generated files
    return NextResponse.json({
      success: true,
      files: result.files,
      provider: PUBLIC_PROVIDER,
      model: PUBLIC_MODEL,
      cost: COST_PER_REQUEST,
      newBalance: chargeResult.newBalance,
    })
  } catch (error) {
    console.error("[v0] Orchestrator generate error:", error)

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
