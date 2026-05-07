import type { GeneratedFile } from "@/lib/types"
import { env } from "@/lib/env"

const ORCHESTRATOR_REQUEST_COST = 2000 // IDR per request
const ORCHESTRATOR_TIMEOUT_MS = 30000

interface OrchestratorGenerateRequest {
  prompt: string
  mode?: "CREATE" | "EXTEND"
  existingFiles?: GeneratedFile[]
  projectContext?: string
}

interface OrchestratorGenerateResponse {
  success: boolean
  files: GeneratedFile[]
  error?: string
  usage?: {
    tokens: number
    cost: number
  }
}

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  usage?: {
    total_tokens?: number
  }
}

type OpenRouterErrorResponse = {
  error?: {
    message?: string
  }
  message?: string
}

type ParsedGenerationPayload = {
  files?: unknown
}

/**
 * Swift AI provider using an OpenAI-compatible gateway.
 */
export class OrchestratorProvider {
  private apiKey: string
  private apiUrl: string

  constructor() {
    // Use OPENAI_API_KEY (which works with OpenRouter)
    this.apiKey = env.openAiApiKey || ""
    this.apiUrl = env.openAiApiUrl || "https://openrouter.ai/api/v1"
  }

  static getCost(): number {
    return ORCHESTRATOR_REQUEST_COST
  }

  static getModel(): string {
    return "Swift AI"
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey) && this.apiUrl.includes("openrouter")
  }

  async generate(request: OrchestratorGenerateRequest): Promise<OrchestratorGenerateResponse> {
    if (!this.isConfigured()) {
      return {
        success: false,
        files: [],
        error: "Orchestrator (OpenRouter) API key not configured or not using OpenRouter",
      }
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), ORCHESTRATOR_TIMEOUT_MS)

      // Build system prompt for code generation
      const systemPrompt = this.buildSystemPrompt(request)

      const response = await fetch(`${this.apiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: env.openAiDefaultModel,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: request.prompt,
            },
          ],
          temperature: 0.7,
          top_p: 0.9,
          max_tokens: env.aiMaxOutputTokens,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch((): OpenRouterErrorResponse => ({})) as OpenRouterErrorResponse
        const errorMsg = errorData.error?.message || errorData.message || response.statusText
        return {
          success: false,
          files: [],
          error: `OpenRouter API error: ${errorMsg}`,
        }
      }

      const data = await response.json() as OpenRouterResponse

      if (!data.choices?.[0]?.message?.content) {
        return {
          success: false,
          files: [],
          error: "Invalid response format from OpenRouter",
        }
      }

      // Parse the response content as JSON
      const content = data.choices[0].message.content
      let parsedResponse: ParsedGenerationPayload

      try {
        // Try to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        parsedResponse = (jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content)) as ParsedGenerationPayload
      } catch {
        return {
          success: false,
          files: [],
          error: "Failed to parse AI response as JSON",
        }
      }

      // Validate response structure
      if (!Array.isArray(parsedResponse.files)) {
        return {
          success: false,
          files: [],
          error: "Invalid response format: missing 'files' array",
        }
      }

      return {
        success: true,
        files: parsedResponse.files as GeneratedFile[],
        usage: {
          tokens: data.usage?.total_tokens || 0,
          cost: ORCHESTRATOR_REQUEST_COST,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return {
        success: false,
        files: [],
        error: `OpenRouter request failed: ${message}`,
      }
    }
  }

  private buildSystemPrompt(request: OrchestratorGenerateRequest): string {
    const basePrompt = `You are an expert web code generator. Generate production-ready React/Next.js code.

Always respond with a valid JSON object containing a "files" array. Each file object must have "path" and "content" properties.

Example response format:
{
  "files": [
    {
      "path": "app/page.tsx",
      "content": "export default function Home() { return <div>Hello</div> }"
    },
    {
      "path": "app/globals.css",
      "content": "body { margin: 0; }"
    }
  ]
}

${request.mode === "EXTEND" ? `IMPORTANT: You are extending an existing project. Here are the existing files:\n${this.formatExistingFiles(request.existingFiles)}\n\nModify or add files as needed to fulfill the user's request.` : ""}

Generate clean, well-structured, and fully functional code.`

    return basePrompt
  }

  private formatExistingFiles(files?: GeneratedFile[]): string {
    if (!files || files.length === 0) {
      return "No existing files"
    }

    return files
      .map(
        (file) =>
          `FILE: ${file.path}\n\`\`\`${file.language || "typescript"}\n${file.content}\n\`\`\``
      )
      .join("\n\n")
  }
}

export const orchestratorProvider = new OrchestratorProvider()
