import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { ModelConfigService } from "@/lib/services/model-config.service"
import { SWIFT_AI_MODEL_KEY } from "@/lib/ai/models"
import { env } from "@/lib/env"

type ProviderState = "connected" | "slow" | "timeout"
type ProviderIssue = "healthy" | "latency" | "auth" | "quota" | "config" | "unknown"

type CachedStatus = {
  status: ProviderState
  issue: ProviderIssue
  checkedAt: number
  responseTimeMs: number
  reason: string
  action: string
}

const REQUEST_TIMEOUT_MS = 10_000
const statusCache = new Map<string, CachedStatus>()

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const modelKey = request.nextUrl.searchParams.get("modelKey")?.trim()
  if (!modelKey) {
    return NextResponse.json({ error: "modelKey is required" }, { status: 400 })
  }

  const model = await ModelConfigService.getActiveModelByKey(modelKey)
  if (!model) {
    return NextResponse.json({ error: "Model not available" }, { status: 404 })
  }

  const shouldRefresh = request.nextUrl.searchParams.get("refresh") === "true"
  const now = Date.now()
  const resolvedModelName = resolveProviderModelName(model.provider, model.modelName)
  const cacheKey = `${model.provider}:${resolvedModelName}`
  const cached = statusCache.get(cacheKey)

  if (
    !shouldRefresh &&
    cached &&
    now - cached.checkedAt < env.providerStatusCacheTtlMs
  ) {
    return NextResponse.json({
      modelKey,
      status: cached.status,
      issue: cached.issue,
      checkedAt: new Date(cached.checkedAt).toISOString(),
      responseTimeMs: cached.responseTimeMs,
      reason: cached.reason,
      action: cached.action,
      cached: true,
    })
  }

  const status = await checkProviderStatus(model.provider, resolvedModelName)
  statusCache.set(cacheKey, {
    ...status,
    checkedAt: now,
  })

  return NextResponse.json({
    modelKey,
    status: status.status,
    issue: status.issue,
    checkedAt: new Date(now).toISOString(),
    responseTimeMs: status.responseTimeMs,
    reason: status.reason,
    action: status.action,
    cached: false,
  })
}

async function checkProviderStatus(provider: string, modelName: string) {
  const startedAt = Date.now()

  try {
    if (provider === "agentrouter") {
      if (!env.agentRouterApiKey) {
        return {
          status: "timeout" as ProviderState,
          issue: "config" as ProviderIssue,
          responseTimeMs: Date.now() - startedAt,
          reason: "AgentRouter API key is missing",
          action: "Tambahkan AGENT_ROUTER_TOKEN (atau AGENTROUTER_API_KEY) di file .env lalu restart dev server.",
        }
      }

      return checkSingleSource({
        url: `${env.agentRouterApiUrl}/chat/completions`,
        modelName,
        apiKey: env.agentRouterApiKey,
      })
    }

    if (provider === "openai") {
      if (!env.openAiApiKey) {
        return {
          status: "timeout" as ProviderState,
          issue: "config" as ProviderIssue,
          responseTimeMs: Date.now() - startedAt,
          reason: "OpenAI-compatible API key is missing",
          action: "Tambahkan OPENAI_API_KEY di file .env lalu restart dev server.",
        }
      }

      return checkSingleSource({
        url: `${env.openAiApiUrl}/chat/completions`,
        modelName,
        apiKey: env.openAiApiKey,
        includeOpenRouterHeaders: env.openAiApiUrl.includes("openrouter.ai"),
      })
    }

    if (provider === "orchestrator") {
      if (!env.openAiApiKey || !env.openAiApiUrl.includes("openrouter")) {
        return {
          status: "timeout" as ProviderState,
          issue: "config" as ProviderIssue,
          responseTimeMs: Date.now() - startedAt,
          reason: "OpenRouter API key is missing or not using OpenRouter",
          action: "Tambahkan OPENAI_API_KEY dan pastikan OPENAI_API_URL mengarah ke OpenRouter.",
        }
      }

      return checkSingleSource({
        url: `${env.openAiApiUrl}/chat/completions`,
        modelName,
        apiKey: env.openAiApiKey,
        includeOpenRouterHeaders: env.openAiApiUrl.includes("openrouter.ai"),
      })
    }

    return {
      status: "timeout" as ProviderState,
      issue: "unknown" as ProviderIssue,
      responseTimeMs: Date.now() - startedAt,
      reason: `Unsupported provider: ${provider}`,
      action: "Periksa konfigurasi provider dan model aktif.",
    }
  } catch (error) {
    const elapsedMs = Date.now() - startedAt
    const isAbort = error instanceof Error && error.name === "AbortError"

    return {
      status: "timeout" as ProviderState,
      issue: isAbort ? ("latency" as ProviderIssue) : ("unknown" as ProviderIssue),
      responseTimeMs: elapsedMs,
      reason: isAbort ? "Provider status check timed out" : "Provider status check failed",
      action: isAbort
        ? "Provider sedang lambat. Coba lagi sebentar lagi atau ganti model."
        : "Periksa koneksi server dan konfigurasi provider.",
    }
  }
}

function resolveProviderModelName(provider: string, modelName: string) {
  if (provider === "openai" && modelName === SWIFT_AI_MODEL_KEY) {
    return env.openAiDefaultModel
  }

  return modelName
}

async function checkSingleSource({
  url,
  modelName,
  apiKey,
  includeOpenRouterHeaders = false,
}: {
  url: string
  modelName: string
  apiKey: string
  includeOpenRouterHeaders?: boolean
}) {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(includeOpenRouterHeaders
          ? {
              "HTTP-Referer": env.nextAuthUrl || env.appUrl || "http://localhost:3000",
              "X-Title": "Swift AI Web Builder",
            }
          : {}),
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: "system",
            content: "Respond with one word.",
          },
          {
            role: "user",
            content: "ping",
          },
        ],
        max_tokens: 1,
      }),
    })

    const elapsedMs = Date.now() - startedAt
    if (response.ok) {
      return {
        status: elapsedMs > 2_500 ? ("slow" as ProviderState) : ("connected" as ProviderState),
        issue: elapsedMs > 2_500 ? ("latency" as ProviderIssue) : ("healthy" as ProviderIssue),
        responseTimeMs: elapsedMs,
        reason: "Provider responded normally",
        action:
          elapsedMs > 2_500
            ? "Provider hidup tapi agak lambat. Generate tetap bisa dicoba."
            : "Provider siap dipakai.",
      }
    }

    if (response.status === 402 || response.status === 429) {
      const rawText = await response.text()
      const normalizedText = rawText.toLowerCase()
      const isCreditLimit =
        response.status === 402 ||
        normalizedText.includes("credit") ||
        normalizedText.includes("can only afford") ||
        normalizedText.includes("max_tokens")
      const isQuota =
        isCreditLimit ||
        normalizedText.includes("quota") ||
        normalizedText.includes("rate-limit")
      return {
        status: "slow" as ProviderState,
        issue: isQuota ? ("quota" as ProviderIssue) : ("latency" as ProviderIssue),
        responseTimeMs: elapsedMs,
        reason: isCreditLimit
          ? "OpenRouter credit is too low for the current token limit"
          : isQuota
            ? "Provider quota or upstream rate limit reached"
            : "Provider rate limited request",
        action: isCreditLimit
          ? "Turunkan AI_MAX_OUTPUT_TOKENS di .env lalu restart dev server, atau isi ulang credit OpenRouter."
          : isQuota
            ? "Coba beberapa menit lagi, ganti model, atau gunakan key provider sendiri (BYOK)."
          : "Tunggu sebentar atau ganti model untuk mengurangi antrean.",
      }
    }

    if (response.status === 401 || response.status === 403) {
      const rawText = await response.text()
      const normalizedText = rawText.toLowerCase()
      const isQuota = normalizedText.includes("quota") || rawText.includes("额度不足")
      const reason = isQuota
        ? "Provider quota exhausted"
        : "Provider rejected authentication or model access"

      return {
        status: "timeout" as ProviderState,
        issue: isQuota ? ("quota" as ProviderIssue) : ("auth" as ProviderIssue),
        responseTimeMs: elapsedMs,
        reason,
        action: isQuota
          ? "Isi ulang kuota provider lalu coba generate lagi."
          : "Periksa API key, izin model, atau whitelist akun provider.",
      }
    }

    if (response.status === 404) {
      const rawText = await response.text()
      const normalizedText = rawText.toLowerCase()
      const isModelUnavailable =
        normalizedText.includes("no endpoints found") ||
        normalizedText.includes("model not found") ||
        normalizedText.includes("unknown model")

      return {
        status: "timeout" as ProviderState,
        issue: isModelUnavailable ? ("config" as ProviderIssue) : ("unknown" as ProviderIssue),
        responseTimeMs: elapsedMs,
        reason: isModelUnavailable ? "Selected model is not available on provider" : "Provider returned 404",
        action: isModelUnavailable
          ? "Ganti ke model lain yang masih aktif."
          : "Periksa endpoint provider atau coba model lain.",
      }
    }

    return {
      status: "timeout" as ProviderState,
      issue: "unknown" as ProviderIssue,
      responseTimeMs: elapsedMs,
      reason: `Provider returned ${response.status}`,
      action: "Periksa endpoint provider atau coba model lain.",
    }
  } catch (error) {
    const elapsedMs = Date.now() - startedAt
    const isAbort = error instanceof Error && error.name === "AbortError"
    return {
      status: "timeout" as ProviderState,
      issue: isAbort ? ("latency" as ProviderIssue) : ("unknown" as ProviderIssue),
      responseTimeMs: elapsedMs,
      reason: isAbort ? "Provider status check timed out" : "Provider status check failed",
      action: isAbort
        ? "Provider sedang lambat. Tunggu sebentar atau ganti model."
        : "Periksa koneksi server ke provider.",
    }
  } finally {
    clearTimeout(timeout)
  }
}
