import Link from "next/link"
import {
  Play,
  Clock,
  Rocket,
  Download,
  FolderKanban,
  ListTodo,
  RefreshCw,
  Users,
  LayoutDashboard,
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const tutorials = [
  {
    id: 1,
    icon: Rocket,
    title: "Quick Start",
    description: "Get up and running with PlanFlow in under 3 minutes",
    duration: "2-3 min",
    badge: "Beginner",
    badgeVariant: "default" as const,
  },
  {
    id: 2,
    icon: Download,
    title: "MCP Installation",
    description: "Complete guide to installing and configuring the MCP server",
    duration: "3-4 min",
    badge: "Setup",
    badgeVariant: "secondary" as const,
  },
  {
    id: 3,
    icon: FolderKanban,
    title: "Working with Projects",
    description: "Create, manage, and organize your projects in PlanFlow",
    duration: "4-5 min",
    badge: "Core",
    badgeVariant: "default" as const,
  },
  {
    id: 4,
    icon: ListTodo,
    title: "Task Management",
    description: "Update task status, get recommendations, and track progress",
    duration: "3-4 min",
    badge: "Core",
    badgeVariant: "default" as const,
  },
  {
    id: 5,
    icon: RefreshCw,
    title: "Syncing Plans",
    description: "Keep your local PROJECT_PLAN.md and cloud in sync",
    duration: "2-3 min",
    badge: "Core",
    badgeVariant: "default" as const,
  },
  {
    id: 6,
    icon: Users,
    title: "Team Collaboration",
    description: "Share projects, assign tasks, and work together",
    duration: "3-4 min",
    badge: "Team",
    badgeVariant: "outline" as const,
  },
]

export function Tutorials() {
  return (
    <section id="tutorials" className="py-24 lg:py-32 bg-muted/30">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <Badge variant="secondary" className="mb-4">
            Video Tutorials
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Learn PlanFlow in
            <br />
            <span className="text-primary">20 minutes</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Step-by-step video guides to help you master every feature.
            From setup to team collaboration.
          </p>
        </div>

        {/* Tutorial Grid */}
        <div className="mx-auto max-w-5xl grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tutorials.map((tutorial) => (
            <Card
              key={tutorial.id}
              className="group relative overflow-hidden border-border/50 bg-card transition-all hover:border-primary/50 hover:shadow-lg cursor-pointer"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <tutorial.icon className="h-5 w-5" />
                  </div>
                  <Badge variant={tutorial.badgeVariant} className="text-xs">
                    {tutorial.badge}
                  </Badge>
                </div>

                <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">
                  {tutorial.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {tutorial.description}
                </p>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{tutorial.duration}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="h-3.5 w-3.5" />
                    <span>Watch now</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <Button size="lg" variant="outline" asChild>
            <Link href="/tutorials">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              View All Tutorials
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
