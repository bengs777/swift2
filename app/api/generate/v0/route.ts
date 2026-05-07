import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { prisma } from "@/lib/db/client"
import { v0Provider } from "@/lib/ai/providers/v0-provider"
import { GenerateBillingService } from "@/lib/services/generate-billing.service"
import type { GeneratedFile } from "@/lib/types"

const V0GenerateSchema = z.object({
  prompt: z.string().min(10).max(5000),
  projectId: z.string().min(1),
  existingFiles: z.array(z.any()).optional().default([]),
  mode: z.enum(["CREATE", "EXTEND"]).optional().default("CREATE"),
})

export async function POST(request: NextRequest) {
  const session = await auth()

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, balance: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Parse request
    const body = V0GenerateSchema.parse(await request.json())

    // Get cost for V0 generation
    const costBreakdown = GenerateBillingService.getCostBreakdown("v0", "v0-web-generator")
    const requiredAmount = costBreakdown.totalCost

    // Check balance
    const balanceCheck = await GenerateBillingService.checkBalance(user.id, requiredAmount)

    if (!balanceCheck.hasBalance) {
      return NextResponse.json(
        {
          error: "Insufficient balance",
          currentBalance: balanceCheck.currentBalance,
          requiredAmount,
          shortfall: balanceCheck.shortfall,
          message: `Balance tidak cukup. Diperlukan Rp ${requiredAmount.toLocaleString("id-ID")}, saldo Anda: Rp ${balanceCheck.currentBalance.toLocaleString("id-ID")}`,
        },
        { status: 402 } // Payment Required
      )
    }

    // Call V0 API
    console.log("[v0] Calling V0 API for generation with mode:", body.mode)
    
    const v0Response = await v0Provider.generate({
      prompt: body.prompt,
      mode: body.mode as "CREATE" | "EXTEND",
      existingFiles: body.existingFiles as GeneratedFile[],
    })

    if (!v0Response.success) {
      return NextResponse.json(
        {
          success: false,
          error: v0Response.error || "Failed to generate code from V0 API",
          files: [],
        },
        { status: 502 }
      )
    }

    // Deduct balance for successful generation
    const chargeResult = await GenerateBillingService.deductBalance(
      user.id,
      requiredAmount,
      `V0 Code Generation - ${body.mode} mode`,
      {
        projectId: body.projectId,
        provider: "v0",
        model: "v0-web-generator",
        fileCount: v0Response.files?.length || 0,
        mode: body.mode,
      }
    )

    if (!chargeResult.success) {
      console.error("[v0] Failed to deduct balance:", chargeResult.error)
      // In case of charging failure, we should ideally refund or not complete the transaction
      return NextResponse.json(
        {
          success: false,
          error: "Generation succeeded but billing failed. Please contact support.",
          files: v0Response.files || [],
        },
        { status: 500 }
      )
    }

    // Success - return generated files with billing info
    return NextResponse.json({
      success: true,
      files: v0Response.files || [],
      billing: {
        provider: "v0",
        cost: requiredAmount,
        currency: "IDR",
        newBalance: chargeResult.newBalance,
        description: `V0 Generation - ${body.mode} mode`,
      },
      usage: v0Response.usage,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request",
          details: error.errors,
        },
        { status: 400 }
      )
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[v0] V0 generate error:", error)
    
    return NextResponse.json(
      {
        success: false,
        error: message,
        files: [],
      },
      { status: 500 }
    )
  }
}
