import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db/client"
import { v0Provider } from "@/lib/ai/providers/v0-provider"
import { orchestratorProvider } from "@/lib/ai/providers/orchestrator-provider"
import {
  detectGenerationMode,
  extractFileContext,
} from "@/lib/ai/code-parser"
import type { GeneratedFile, PromptAttachment } from "@/lib/types"
import { z } from "zod"

export const runtime = "nodejs"

const GenerateSmartSchema = z.object({
  prompt: z.string().min(1).max(5000),
  projectId: z.string().min(1),
  selectedModel: z.string().min(1),
  existingFiles: z
    .array(
      z.object({
        path: z.string(),
        content: z.string(),
        language: z.string(),
      })
    )
    .optional()
    .default([]),
})

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.email || !session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const userId = session.user.id as string

    // Validate request body
    const body = await request.json()
    const validation = GenerateSmartSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: `Validation error: ${validation.error.message}`,
          files: [],
        },
        { status: 400 }
      )
    }

    const { prompt, projectId, selectedModel, existingFiles = [] } = validation.data
    const typedExistingFiles = existingFiles as GeneratedFile[]
    
    // Detect mode: CREATE or EXTEND based on existing files
    const detectedMode = detectGenerationMode(typedExistingFiles)

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    })

    if (!project) {
      return NextResponse.json(
        {
          success: false,
          error: "Project not found",
          files: [],
        },
        { status: 404 }
      )
    }

    // Verify user has access to the workspace
    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: project.workspaceId,
          userId,
        },
      },
    })

    if (!workspaceMember) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized - no access to this project",
          files: [],
        },
        { status: 403 }
      )
    }

    // Build context if EXTEND mode
    let contextStr = ""
    if (detectedMode === "EXTEND") {
      contextStr = extractFileContext(typedExistingFiles)
    }

    // Route to appropriate provider based on selectedModel
    let aiResponse: string

    try {
      if (selectedModel.includes("v0")) {
        const v0Result = await v0Provider.generate({
          prompt,
          mode: detectedMode as "CREATE" | "EXTEND",
          existingFiles: typedExistingFiles,
        })
        if (!v0Result.success) {
          throw new Error(v0Result.error || "V0 generation failed")
        }
        return NextResponse.json({
          success: true,
          files: v0Result.files,
          mode: detectedMode,
        })
      } else if (selectedModel.includes("orchestrator") || selectedModel.includes("swift-ai")) {
        const orchestratorResult = await orchestratorProvider.generate({
          prompt,
          mode: detectedMode as "CREATE" | "EXTEND",
          existingFiles: typedExistingFiles,
        })
        if (!orchestratorResult.success) {
          throw new Error(orchestratorResult.error || "Orchestrator generation failed")
        }
        return NextResponse.json({
          success: true,
          files: orchestratorResult.files,
          mode: detectedMode,
        })
      } else {
        throw new Error("Unknown model provider")
      }
    } catch (error) {
      console.error("[v0] AI generation error:", error)
      return NextResponse.json(
        {
          success: false,
          error: `AI generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          files: [],
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("[v0] Unexpected error in /api/generate/smart:", error)
    return NextResponse.json(
      {
        success: false,
        error: `Server error: ${error instanceof Error ? error.message : "Unknown error"}`,
        files: [],
      },
      { status: 500 }
    )
  }
}
