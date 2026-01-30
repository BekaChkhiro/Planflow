import {
  Terminal,
  Cloud,
  Zap,
  GitBranch,
  BarChart3,
  Users,
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

const features = [
  {
    icon: Terminal,
    title: "Terminal-First Workflow",
    description:
      "Manage your entire project without leaving the command line. Built for developers who live in the terminal.",
  },
  {
    icon: Cloud,
    title: "Seamless Cloud Sync",
    description:
      "Push and pull your project plans between local files and the cloud. Work offline, sync when ready.",
  },
  {
    icon: Zap,
    title: "Claude Code Integration",
    description:
      "Native MCP integration with Claude Code. Let AI help you plan, track, and complete tasks faster.",
  },
  {
    icon: GitBranch,
    title: "Git-Like Workflow",
    description:
      "Familiar commands like sync, push, and pull. Your project plan lives alongside your code.",
  },
  {
    icon: BarChart3,
    title: "Progress Tracking",
    description:
      "Visual progress bars, phase tracking, and smart recommendations for your next task.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description:
      "Share projects with your team. Assign tasks, track progress, and stay in sync — all from the CLI.",
  },
]

export function Features() {
  return (
    <section className="py-24 lg:py-32">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to
            <br />
            <span className="text-primary">ship faster</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            PlanFlow combines the power of AI with developer-friendly workflows
            to help you stay organized and productive.
          </p>
        </div>

        {/* Features Grid */}
        <div className="mx-auto max-w-5xl grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="group relative overflow-hidden border-border/50 bg-gradient-to-b from-background to-muted/20 transition-all hover:border-primary/50 hover:shadow-lg"
            >
              <CardContent className="p-6">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 font-semibold text-lg">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
