"use client"

import { Badge } from "@/components/ui/badge"
import { Coins } from "lucide-react"

interface V0ModelBadgeProps {
  showCost?: boolean
  size?: "sm" | "md"
}

export function V0ModelBadge({ showCost = true, size = "md" }: V0ModelBadgeProps) {
  if (size === "sm") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Coins className="h-3 w-3" />
        <span>2000/req</span>
      </Badge>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-primary" />
        <div>
          <div className="text-xs font-medium text-muted-foreground">Swift AI</div>
          {showCost && (
            <div className="text-sm font-semibold text-foreground">
              2.000 IDR / generasi
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Provider badge component untuk display di model selector
 */
export function ProviderBadge({ provider }: { provider: string }) {
  if (provider === "v0") {
    return (
      <Badge className="gap-1 bg-primary/20 text-primary hover:bg-primary/30">
        <Coins className="h-3 w-3" />
        V0
      </Badge>
    )
  }

  if (provider === "agentrouter") {
    return <Badge variant="outline">AgentRouter</Badge>
  }

  if (provider === "openai" || provider === "swift-ai") {
    return <Badge variant="outline">Swift AI</Badge>
  }

  if (provider === "orchestrator") {
    return <Badge className="bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30">Orchestrator</Badge>
  }

  return <Badge variant="outline">{provider}</Badge>
}
