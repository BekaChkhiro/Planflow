import { Check, Sparkles, Gift } from "lucide-react"
import Link from "next/link"
import { Metadata } from "next"

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
import { Navbar, Footer } from "@/components/landing"

export const metadata: Metadata = {
  title: "Pricing - PlanFlow",
  description: "PlanFlow is currently free. Start managing your projects today.",
}

const features = [
  "Unlimited projects",
  "Cloud sync",
  "Team collaboration",
  "MCP integration for Claude Code",
  "50+ slash commands",
  "GitHub integration",
  "Real-time notifications",
  "Task assignments & comments",
  "Progress tracking",
  "Export to JSON, CSV, GitHub Issues",
]

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        {/* Header */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
            <Badge variant="secondary" className="mb-4">
              <Gift className="mr-1 h-3 w-3" />
              Early Access
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              PlanFlow is currently{" "}
              <span className="text-primary">free</span>
            </h1>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              We&apos;re building the best AI-native project management tool for developers.
              Get full access to all features while we&apos;re in early access.
            </p>
          </div>
        </section>

        {/* Pricing Card */}
        <section className="pb-16 sm:pb-24">
          <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8">
            <Card className="relative border-primary shadow-lg">
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
                  <span className="text-muted-foreground ml-2">forever free during early access</span>
                </div>
                <ul className="space-y-3">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button className="w-full" size="lg" asChild>
                  <Link href="/register">Get Started Free</Link>
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  No credit card required
                </p>
              </CardFooter>
            </Card>
          </div>
        </section>

        {/* Future Pricing Notice */}
        <section className="pb-16 sm:pb-24">
          <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-2">Future Pricing</h3>
                <p className="text-sm text-muted-foreground">
                  In the future, we may introduce paid features or plans. If we do,
                  we&apos;ll clearly describe the terms and pricing before you&apos;re charged.
                  Early adopters will always have special benefits.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* FAQ CTA */}
        <section className="pb-16 sm:pb-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-muted-foreground">
              Have questions?{" "}
              <Link href="/contact" className="text-primary hover:underline">
                Contact us
              </Link>{" "}
              or check out our{" "}
              <Link href="/docs" className="text-primary hover:underline">
                documentation
              </Link>
              .
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
