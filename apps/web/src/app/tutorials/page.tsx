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
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ExternalLink,
} from "lucide-react"

import { Navbar } from "@/components/landing"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

const tutorials = [
  {
    id: 1,
    slug: "quick-start",
    icon: Rocket,
    title: "Quick Start",
    description: "Get up and running with PlanFlow in under 3 minutes. Create your account, install the MCP server, and connect Claude Code.",
    duration: "2-3 min",
    badge: "Beginner",
    badgeVariant: "default" as const,
    topics: [
      "Create your PlanFlow account",
      "Generate an API token",
      "Install the MCP server",
      "Configure Claude Code",
      "Create your first project",
    ],
    videoId: null, // Placeholder for YouTube embed
  },
  {
    id: 2,
    slug: "mcp-installation",
    icon: Download,
    title: "MCP Installation Deep Dive",
    description: "Complete guide to installing and configuring the PlanFlow MCP server for Claude Desktop and Claude Code.",
    duration: "3-4 min",
    badge: "Setup",
    badgeVariant: "secondary" as const,
    topics: [
      "Global vs local installation",
      "Configure Claude Desktop",
      "Configure Claude Code CLI",
      "Environment variables",
      "Troubleshooting common issues",
    ],
    videoId: null,
  },
  {
    id: 3,
    slug: "working-with-projects",
    icon: FolderKanban,
    title: "Working with Projects",
    description: "Create, manage, and organize your projects in PlanFlow. Learn the PROJECT_PLAN.md structure and dashboard views.",
    duration: "4-5 min",
    badge: "Core",
    badgeVariant: "default" as const,
    topics: [
      "Create projects from Claude Code",
      "Create projects from dashboard",
      "List and filter projects",
      "PROJECT_PLAN.md structure",
      "Dashboard project views",
    ],
    videoId: null,
  },
  {
    id: 4,
    slug: "task-management",
    icon: ListTodo,
    title: "Task Management",
    description: "Update task status, get AI-powered recommendations, and track progress. Master the daily workflow.",
    duration: "3-4 min",
    badge: "Core",
    badgeVariant: "default" as const,
    topics: [
      "List and filter tasks",
      "Update task status",
      "AI-powered next task recommendations",
      "Understanding dependencies",
      "Batch updates",
    ],
    videoId: null,
  },
  {
    id: 5,
    slug: "syncing-plans",
    icon: RefreshCw,
    title: "Syncing Plans",
    description: "Keep your local PROJECT_PLAN.md and the cloud in perfect sync. Bidirectional sync for seamless workflow.",
    duration: "2-3 min",
    badge: "Core",
    badgeVariant: "default" as const,
    topics: [
      "Push local changes to cloud",
      "Pull cloud changes to local",
      "Recommended sync workflow",
      "Handling merge conflicts",
    ],
    videoId: null,
  },
  {
    id: 6,
    slug: "team-collaboration",
    icon: Users,
    title: "Team Collaboration",
    description: "Share projects, assign tasks, and work together with your team. Real-time updates and notifications.",
    duration: "3-4 min",
    badge: "Team",
    badgeVariant: "outline" as const,
    topics: [
      "Invite team members",
      "Assign tasks to teammates",
      "Team activity feed",
      "Team progress tracking",
      "Notifications",
    ],
    videoId: null,
  },
  {
    id: 7,
    slug: "web-dashboard",
    icon: LayoutDashboard,
    title: "Web Dashboard Tour",
    description: "Explore the visual interface for project management. Kanban boards, progress charts, and settings.",
    duration: "2-3 min",
    badge: "Dashboard",
    badgeVariant: "secondary" as const,
    topics: [
      "Dashboard navigation",
      "Project overview page",
      "Tasks kanban board",
      "Plan viewer",
      "Settings and API tokens",
    ],
    videoId: null,
  },
]

export default function TutorialsPage() {
  const totalDuration = "20-25 min"
  const completedCount = 0 // This would come from user state

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" size="sm" asChild className="mb-4">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Link>
          </Button>

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="mb-3">
                Video Tutorials
              </Badge>
              <h1 className="text-4xl font-bold tracking-tight">
                Learn PlanFlow
              </h1>
              <p className="mt-2 text-lg text-muted-foreground max-w-2xl">
                Complete tutorial series to help you master PlanFlow.
                From initial setup to advanced team collaboration.
              </p>
            </div>

            <div className="flex gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Total:</span>
                <span className="font-medium">{totalDuration}</span>
              </div>
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Tutorials:</span>
                <span className="font-medium">{tutorials.length}</span>
              </div>
            </div>
          </div>
        </div>

        <Separator className="mb-12" />

        {/* Quick Start CTA */}
        <Card className="mb-12 border-primary/50 bg-gradient-to-r from-primary/5 to-background">
          <CardContent className="flex flex-col lg:flex-row items-center justify-between gap-6 p-8">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <Rocket className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">New to PlanFlow?</h2>
                <p className="text-muted-foreground">
                  Start with our Quick Start guide and be up and running in 3 minutes.
                </p>
              </div>
            </div>
            <Button size="lg" asChild>
              <a href="#quick-start">
                <Play className="mr-2 h-4 w-4" />
                Start Learning
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* Tutorial List */}
        <div className="space-y-8">
          {tutorials.map((tutorial, index) => (
            <Card
              key={tutorial.id}
              id={tutorial.slug}
              className="overflow-hidden scroll-mt-24"
            >
              <CardHeader className="pb-4">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <tutorial.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant="outline" className="text-xs">
                          {index + 1} of {tutorials.length}
                        </Badge>
                        <Badge variant={tutorial.badgeVariant} className="text-xs">
                          {tutorial.badge}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {tutorial.duration}
                        </div>
                      </div>
                      <CardTitle className="text-xl">{tutorial.title}</CardTitle>
                      <p className="mt-2 text-muted-foreground">
                        {tutorial.description}
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="grid lg:grid-cols-2 gap-8">
                  {/* Video Placeholder */}
                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center border">
                    {tutorial.videoId ? (
                      <iframe
                        className="w-full h-full rounded-lg"
                        src={`https://www.youtube.com/embed/${tutorial.videoId}`}
                        title={tutorial.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <div className="text-center p-8">
                        <Play className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                        <p className="text-sm text-muted-foreground">
                          Video coming soon
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Check back for the full tutorial
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Topics Covered */}
                  <div>
                    <h4 className="font-medium mb-4 flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      What you'll learn
                    </h4>
                    <ul className="space-y-3">
                      {tutorial.topics.map((topic, topicIndex) => (
                        <li
                          key={topicIndex}
                          className="flex items-start gap-3 text-sm"
                        >
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <span>{topic}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bottom CTA */}
        <Card className="mt-16 text-center">
          <CardContent className="py-12">
            <h2 className="text-2xl font-bold mb-4">
              Ready to get started?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Create your free account and start managing projects
              directly from Claude Code.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild>
                <Link href="/register">
                  Get Started Free
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/docs/getting-started">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Read the Docs
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 mt-16">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>
            Need help?{" "}
            <Link href="/docs" className="underline hover:text-foreground">
              Check the documentation
            </Link>
            {" "}or{" "}
            <a
              href="mailto:support@planflow.dev"
              className="underline hover:text-foreground"
            >
              contact support
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
