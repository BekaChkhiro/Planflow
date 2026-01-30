"use client"

import { Check, Sparkles } from "lucide-react"
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

interface Tier {
  name: string
  price: string
  priceUnit?: string
  description: string
  features: string[]
  cta: string
  ctaHref: string
  popular: boolean
}

const tiers: Tier[] = [
  {
    name: "Free",
    price: "$0",
    description: "Perfect for getting started with personal projects",
    features: [
      "3 projects",
      "Local plans only",
      "Basic task management",
      "Community support",
    ],
    cta: "Get Started",
    ctaHref: "/register",
    popular: false,
  },
  {
    name: "Pro",
    price: "$12",
    description: "For developers who want to level up their workflow",
    features: [
      "Unlimited projects",
      "Cloud sync",
      "GitHub integration",
      "Priority support",
      "AI-powered suggestions",
    ],
    cta: "Start Free Trial",
    ctaHref: "/register?plan=pro",
    popular: true,
  },
  {
    name: "Team",
    price: "$29",
    priceUnit: "/user",
    description: "Collaborate with your team on complex projects",
    features: [
      "Everything in Pro",
      "Team management",
      "Role-based access",
      "Code review workflows",
      "Sprint planning",
    ],
    cta: "Start Free Trial",
    ctaHref: "/register?plan=team",
    popular: false,
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "For organizations with advanced security needs",
    features: [
      "Everything in Team",
      "Self-hosted option",
      "SLA guarantee",
      "Custom integrations",
      "SSO & SAML",
    ],
    cta: "Contact Sales",
    ctaHref: "/contact",
    popular: false,
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="py-24 lg:py-32 bg-muted/30">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <Badge variant="secondary" className="mb-4">
            <Sparkles className="mr-1 h-3 w-3" />
            Simple Pricing
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Choose your plan,{" "}
            <span className="text-primary">start shipping</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            All plans include a 14-day free trial. No credit card required.
          </p>
        </div>

        {/* Pricing Grid */}
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {tiers.map((tier) => (
              <Card
                key={tier.name}
                className={`group relative flex flex-col overflow-hidden transition-all duration-300 hover:shadow-lg ${
                  tier.popular
                    ? "border-primary shadow-lg scale-[1.02] bg-gradient-to-b from-primary/5 to-background"
                    : "border-border/50 bg-gradient-to-b from-background to-muted/20 hover:border-primary/50"
                }`}
              >
                {tier.popular && (
                  <Badge className="absolute -top-0 right-4 rounded-t-none">
                    Most Popular
                  </Badge>
                )}
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  <CardDescription className="min-h-[40px]">
                    {tier.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 pb-6">
                  <div className="mb-6">
                    <span className="text-4xl font-bold tracking-tight">
                      {tier.price}
                    </span>
                    {tier.price !== "Custom" && (
                      <span className="text-muted-foreground ml-1">
                        {tier.priceUnit || ""}/month
                      </span>
                    )}
                  </div>
                  <ul className="space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm text-muted-foreground">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="pt-0">
                  <Button
                    variant={tier.popular ? "default" : "outline"}
                    className="w-full"
                    asChild
                  >
                    <Link href={tier.ctaHref}>{tier.cta}</Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA Footer */}
        <div className="mt-12 text-center">
          <p className="text-muted-foreground">
            Need help choosing?{" "}
            <Link
              href="/pricing"
              className="text-primary font-medium hover:underline"
            >
              Compare all features
            </Link>{" "}
            or{" "}
            <Link
              href="/contact"
              className="text-primary font-medium hover:underline"
            >
              talk to our team
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  )
}
