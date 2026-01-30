import { Quote } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface Testimonial {
  name: string
  role: string
  company: string
  content: string
  avatar?: string
  featured?: boolean
}

const testimonials: Testimonial[] = [
  {
    name: "Sarah Chen",
    role: "Senior Developer",
    company: "Vercel",
    content:
      "PlanFlow changed how I manage projects. Being able to update tasks without leaving my terminal keeps me in the zone. The Claude integration is a game-changer.",
    avatar: "/avatars/sarah.jpg",
    featured: true,
  },
  {
    name: "Marcus Johnson",
    role: "Tech Lead",
    company: "Railway",
    content:
      "Finally, a project management tool that understands developers. The sync between local markdown and cloud is exactly what our team needed.",
    avatar: "/avatars/marcus.jpg",
  },
  {
    name: "Elena Rodriguez",
    role: "Indie Hacker",
    company: "ShipFast.io",
    content:
      "As a solo founder, I need tools that don't slow me down. PlanFlow lets me plan and execute without context switching. Worth every penny.",
    avatar: "/avatars/elena.jpg",
  },
  {
    name: "David Park",
    role: "Engineering Manager",
    company: "Stripe",
    content:
      "We evaluated many tools for our team. PlanFlow's terminal-first approach and Claude Code integration won us over. Our velocity improved significantly.",
    avatar: "/avatars/david.jpg",
    featured: true,
  },
  {
    name: "Ava Williams",
    role: "Full Stack Developer",
    company: "Supabase",
    content:
      "The /plan:next command is brilliant. It always knows what I should work on next based on dependencies and complexity. Like having a smart PM in my terminal.",
    avatar: "/avatars/ava.jpg",
  },
  {
    name: "James Liu",
    role: "CTO",
    company: "Acme Labs",
    content:
      "PlanFlow bridges the gap between planning and execution. Our developers actually enjoy updating their task status now. That says everything.",
    avatar: "/avatars/james.jpg",
  },
]

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
}

export function Testimonials() {
  return (
    <section className="py-24 lg:py-32 bg-muted/30">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Loved by developers
            <br />
            <span className="text-primary">worldwide</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Join thousands of developers who've transformed their workflow with
            PlanFlow's AI-native project management.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="mx-auto max-w-6xl grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <Card
              key={testimonial.name}
              className={`group relative overflow-hidden border-border/50 bg-gradient-to-b from-background to-muted/20 transition-all hover:border-primary/50 hover:shadow-lg ${
                testimonial.featured ? "ring-1 ring-primary/20" : ""
              }`}
            >
              <CardContent className="p-6">
                {/* Quote Icon */}
                <div className="mb-4 text-primary/20">
                  <Quote className="h-8 w-8" />
                </div>

                {/* Testimonial Content */}
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  "{testimonial.content}"
                </p>

                {/* Author */}
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 border border-border/50">
                    <AvatarImage
                      src={testimonial.avatar}
                      alt={testimonial.name}
                    />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                      {getInitials(testimonial.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">{testimonial.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {testimonial.role} · {testimonial.company}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
