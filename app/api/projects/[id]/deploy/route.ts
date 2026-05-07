import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db/client"
import { env, getEnv } from "@/lib/env"
import type { GeneratedFile } from "@/lib/types"
import { UserService } from "@/lib/services/user.service"

export const runtime = "nodejs"

const MAX_FILE_COUNT = 500
const MAX_TOTAL_PAYLOAD_SIZE_BYTES = 6 * 1024 * 1024 // 6 MiB
const MAX_SINGLE_FILE_BYTES = 2 * 1024 * 1024 // 2 MiB

const toSafePath = (input: string) => {
  const normalized = input.replace(/\\/g, "/").replace(/^\/+/, "")
  if (!normalized) return ""

  const safeSegments: string[] = []
  for (const segment of normalized.split("/")) {
    const trimmed = segment.trim()
    if (!trimmed || trimmed === ".") continue
    if (trimmed === "..") return ""
    safeSegments.push(trimmed)
  }

  return safeSegments.join("/")
}

type FileLike = {
  path: string
  content: string
  language?: string | null
}

const normalizeFiles = (raw: unknown, fallback: FileLike[]) => {
  const source = Array.isArray(raw) ? raw : fallback

  const files: GeneratedFile[] = []

  for (const entry of source) {
    const path = typeof entry?.path === "string" ? toSafePath(entry.path) : ""
    const content = typeof entry?.content === "string" ? entry.content : ""
    const language = typeof entry?.language === "string" ? entry.language : "ts"

    if (!path) continue

    files.push({
      path,
      content,
      language: language as GeneratedFile["language"],
    })
  }

  return files.slice(0, MAX_FILE_COUNT)
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "swift-project"

const resolveProjectFiles = async (projectId: string, userId: string) => {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      workspace: {
        members: {
          some: {
            userId,
          },
        },
      },
    },
    include: {
      files: true,
    },
  })
}

type VercelCreateDeploymentResponse = {
  id?: string
  url?: string
  inspectorUrl?: string
  readyState?: string
  alias?: string[]
  error?: {
    code?: string
    message?: string
  }
  message?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const user = await UserService.createUserWithWorkspaceIfMissing(
      session.user.email,
      session.user.name ?? null,
      session.user.image ?? null
    )

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (!env.vercelAccessToken) {
      return NextResponse.json(
        {
          error:
            "VERCEL_ACCESS_TOKEN is missing. Set it in your environment before deploying.",
        },
        { status: 500 }
      )
    }

    const { id } = await params
  const project = await resolveProjectFiles(id, user.id)

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const files = normalizeFiles((body as { files?: unknown }).files, project.files)
    if (files.length === 0) {
      return NextResponse.json(
        { error: "No generated files found to deploy." },
        { status: 400 }
      )
    }

    // Payload sizing guard & request logging
    const contentLengthHeader = request.headers.get("content-length")
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : 0

    let totalBytes = 0
    for (const f of files) {
      totalBytes += Buffer.byteLength(f.content || "", "utf8")
    }

    if (contentLength && contentLength > MAX_TOTAL_PAYLOAD_SIZE_BYTES) {
      console.warn(`[v0] Deploy aborted: Content-Length ${contentLength} exceeds limit ${MAX_TOTAL_PAYLOAD_SIZE_BYTES}`)
      return NextResponse.json(
        { error: "Payload too large (Content-Length exceeds limit)." },
        { status: 413 }
      )
    }

    if (totalBytes > MAX_TOTAL_PAYLOAD_SIZE_BYTES) {
      console.warn(`[v0] Deploy aborted: total payload ${totalBytes} bytes exceeds limit ${MAX_TOTAL_PAYLOAD_SIZE_BYTES}`)
      return NextResponse.json(
        { error: "Payload too large (generated files exceed size limit)." },
        { status: 413 }
      )
    }

    console.log(
      `[v0] Deploy payload summary: project=${project.name} files=${files.length} totalBytes=${totalBytes} contentLength=${contentLength || "n/a"} samplePaths=${files
        .slice(0, 10)
        .map((p) => p.path)
        .join(", ")}`
    )

    const payload = {
      name: slugify(project.name),
      target: "production",
      version: 2,
      files: files.map((file) => ({
        file: file.path,
        data: Buffer.from(file.content || "", "utf-8").toString("base64"),
      })),
    }

    const url = new URL("https://api.vercel.com/v13/deployments")
    const teamId = getEnv("VERCEL_TEAM_ID")
    if (teamId) {
      url.searchParams.set("teamId", teamId)
    }
    // When creating a deployment for a project that doesn't exist yet,
    // Vercel may require `projectSettings`. Skip the auto-detection confirmation
    // to allow automatic framework detection instead.
    url.searchParams.set("skipAutoDetectionConfirmation", "1")

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.vercelAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    })

    const responseText = await response.text().catch(() => "")
    let data = {} as VercelCreateDeploymentResponse
    try {
      if (responseText) {
        data = JSON.parse(responseText) as VercelCreateDeploymentResponse
      }
    } catch (err) {
      console.warn("[v0] Failed to parse Vercel response as JSON", err)
    }

    if (!response.ok) {
      console.error("[v0] Vercel deployment failed", {
        status: response.status,
        body: responseText,
      })
      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            data?.message ||
            `Vercel API rejected deployment (${response.status}).`,
          details: data?.error?.code,
        },
        { status: response.status }
      )
    }

    const deploymentUrl = data.url ? `https://${data.url}` : null

    return NextResponse.json({
      success: true,
      deployment: {
        id: data.id || "",
        url: deploymentUrl,
        inspectorUrl: data.inspectorUrl || null,
        readyState: data.readyState || "BUILDING",
        alias: Array.isArray(data.alias) ? data.alias : [],
      },
    })
  } catch (error) {
    console.error("[v0] Error deploying project to Vercel:", error)
    const message = error instanceof Error ? error.message : "Failed to deploy project to Vercel"
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
