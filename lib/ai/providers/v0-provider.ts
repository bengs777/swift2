import type { GeneratedFile } from "@/lib/types"
import { env } from "@/lib/env"

const V0_API_BASE = "https://v0.app/api"
const V0_REQUEST_COST = 2000 // IDR per request
const V0_TIMEOUT_MS = 30000

interface V0GenerateRequest {
  prompt: string
  mode?: "CREATE" | "EXTEND"
  existingFiles?: GeneratedFile[]
  projectContext?: string
}

interface V0GenerateResponse {
  success: boolean
  files: GeneratedFile[]
  error?: string
  usage?: {
    tokens: number
    cost: number
  }
}

export class V0Provider {
  private apiKey: string

  constructor() {
    this.apiKey = env.v0ApiKey || ""
  }

  static getCost(): number {
    return V0_REQUEST_COST
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey)
  }

  async generate(request: V0GenerateRequest): Promise<V0GenerateResponse> {
    if (!this.isConfigured()) {
      return {
        success: false,
        files: [],
        error: "V0 API key not configured",
      }
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), V0_TIMEOUT_MS)

      const response = await fetch(`${V0_API_BASE}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          prompt: request.prompt,
          mode: request.mode || "CREATE",
          existingFiles: request.existingFiles || [],
          projectContext: request.projectContext,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          files: [],
          error: errorData.error || `V0 API error: ${response.statusText}`,
        }
      }

      const data = await response.json()

      // Validate response structure
      if (!Array.isArray(data.files)) {
        return {
          success: false,
          files: [],
          error: "Invalid response format from V0 API",
        }
      }

      return {
        success: true,
        files: data.files,
        usage: {
          tokens: data.usage?.tokens || 0,
          cost: V0_REQUEST_COST,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return {
        success: false,
        files: [],
        error: `V0 API error: ${message}`,
      }
    }
  }
}

export const v0Provider = new V0Provider()
