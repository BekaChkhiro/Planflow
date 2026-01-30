import Link from "next/link"
import { Terminal } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-background" />

      <div className="container relative mx-auto px-4 py-24 lg:py-32">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <Badge variant="secondary" className="mb-6">
            AI-Native Project Management
          </Badge>

          {/* Headline */}
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Manage Projects Without
            <br />
            <span className="text-primary">Leaving Your Terminal</span>
          </h1>

          {/* Subheadline */}
          <p className="mt-6 text-lg text-muted-foreground lg:text-xl max-w-2xl mx-auto">
            PlanFlow brings powerful project management directly into Claude Code.
            Plan, track, and sync your tasks — all from the command line.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild>
              <Link href="/register">Get Started Free</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/pricing">View Pricing</Link>
            </Button>
          </div>

          {/* Terminal Mockup */}
          <div className="mt-16 rounded-xl border bg-card shadow-2xl overflow-hidden">
            {/* Terminal Header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <div className="flex-1 text-center">
                <span className="text-xs text-muted-foreground font-mono">
                  claude-code — planflow
                </span>
              </div>
            </div>

            {/* Terminal Content */}
            <div className="p-6 bg-zinc-950 text-left font-mono text-sm">
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <Terminal className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-zinc-400">
                    <span className="text-green-500">$</span> planflow sync
                  </span>
                </div>
                <div className="pl-6 text-zinc-500">
                  Syncing tasks with PlanFlow...
                </div>
                <div className="pl-6 text-green-400">
                  ✓ 12 tasks synced successfully
                </div>
                <div className="pl-6 text-zinc-500">
                  3 new tasks assigned to you
                </div>
                <div className="mt-4 flex items-start gap-2">
                  <Terminal className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-zinc-400">
                    <span className="text-green-500">$</span> planflow task list --mine
                  </span>
                </div>
                <div className="pl-6 space-y-1">
                  <div className="text-blue-400">[PF-42] Implement user auth flow</div>
                  <div className="text-yellow-400">[PF-43] Add dark mode support</div>
                  <div className="text-zinc-400">[PF-44] Write API documentation</div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-green-500 shrink-0" />
                  <span className="text-zinc-400">
                    <span className="text-green-500">$</span>{" "}
                    <span className="animate-pulse">▋</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
