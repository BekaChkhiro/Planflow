"use client"

import { Check, Sparkles, Gift } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const features = [
  "Unlimited projects",
  "Cloud sync",
  "Team collaboration",
  "MCP integration for Claude Code",
  "50+ slash commands",
  "GitHub integration",
  "Real-time notifications",
  "Task assignments & comments",
]

export function Pricing() {
  return (
    <section id="pricing" className="py-24 lg:py-32 bg-muted/30">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <Badge variant="secondary" className="mb-4">
            <Gift className="mr-1 h-3 w-3" />
            Early Access
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Currently{" "}
            <span className="text-primary">free</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Get full access to all features while we&apos;re in early access.
            No credit card required.
          </p>
        </div>

        {/* Pricing Card */}
        <div className="mx-auto max-w-lg">
          <Card className="relative border-primary shadow-lg bg-gradient-to-b from-primary/5 to-background">
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Sparkles className="mr-1 h-3 w-3" />
              All Features Included
            </Badge>
            <CardHeader className="text-center pt-8">
              <CardTitle className="text-2xl">Full Access</CardTitle>
              <CardDescription>
                Everything you need for AI-native project management
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center mb-8">
                <span className="text-5xl font-bold">$0</span>
                <span className="text-muted-foreground ml-2">/month</span>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button className="w-full" size="lg" asChild>
                <Link href="/register">Get Started Free</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Future Pricing Notice */}
        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            In the future, we may introduce paid features or plans.
            If we do, we&apos;ll clearly describe the terms and pricing before you&apos;re charged.
          </p>
        </div>
      </div>
    </section>
  )
}
