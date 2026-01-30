'use client'

import { Check, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

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
import { useAuthStore } from "@/stores/auth-store"
import { useCreateCheckout } from "@/hooks/use-subscription"

type TierName = 'free' | 'pro' | 'team' | 'enterprise'

interface Tier {
  name: string
  tierKey: TierName
  price: string
  priceUnit?: string
  description: string
  features: string[]
  cta: string
  popular: boolean
}

const tiers: Tier[] = [
  {
    name: "Free",
    tierKey: "free",
    price: "$0",
    description: "Perfect for getting started with personal projects",
    features: [
      "3 projects",
      "Local plans only",
      "Basic task management",
      "Community support",
    ],
    cta: "Get Started",
    popular: false,
  },
  {
    name: "Pro",
    tierKey: "pro",
    price: "$12",
    description: "For developers who want to level up their workflow",
    features: [
      "Unlimited projects",
      "Cloud sync",
      "GitHub integration",
      "Priority support",
      "AI-powered suggestions",
    ],
    cta: "Start Trial",
    popular: true,
  },
  {
    name: "Team",
    tierKey: "team",
    price: "$29",
    priceUnit: "/user",
    description: "Collaborate with your team on complex projects",
    features: [
      "Everything in Pro",
      "Team management",
      "Role-based access",
      "Code review workflows",
      "Sprint planning",
      "Team analytics",
    ],
    cta: "Start Trial",
    popular: false,
  },
  {
    name: "Enterprise",
    tierKey: "enterprise",
    price: "Custom",
    description: "For organizations with advanced security needs",
    features: [
      "Everything in Team",
      "Self-hosted option",
      "SLA guarantee",
      "Custom integrations",
      "Dedicated support",
      "SSO & SAML",
    ],
    cta: "Contact Sales",
    popular: false,
  },
]

export default function PricingPage() {
  const router = useRouter()
  const { isAuthenticated, isInitialized } = useAuthStore()
  const createCheckout = useCreateCheckout()

  const handleSubscribe = (tier: Tier) => {
    const tierKey = tier.tierKey

    // Free tier - redirect to register
    if (tierKey === 'free') {
      router.push('/register')
      return
    }

    // Enterprise - redirect to contact
    if (tierKey === 'enterprise') {
      router.push('/contact')
      return
    }

    // Pro or Team tiers
    if (!isAuthenticated) {
      // Not authenticated - redirect to register with plan
      router.push(`/register?plan=${tierKey}`)
      return
    }

    // Authenticated - create checkout session
    createCheckout.mutate(tierKey as 'pro' | 'team')
  }

  const getButtonContent = (tier: Tier) => {
    const isCheckoutLoading = createCheckout.isPending &&
      (tier.tierKey === 'pro' || tier.tierKey === 'team')

    if (isCheckoutLoading) {
      return (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </>
      )
    }

    return tier.cta
  }

  const isButtonDisabled = (tier: Tier) => {
    // Disable all paid tier buttons while checkout is loading
    if (createCheckout.isPending && (tier.tierKey === 'pro' || tier.tierKey === 'team')) {
      return true
    }
    // Wait for auth to initialize before enabling paid tier buttons
    if (!isInitialized && (tier.tierKey === 'pro' || tier.tierKey === 'team')) {
      return true
    }
    return false
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Choose the plan that fits your workflow. All plans include a 14-day
            free trial.
          </p>
        </div>
      </section>

      {/* Pricing Grid */}
      <section className="pb-16 sm:pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {tiers.map((tier) => (
              <Card
                key={tier.name}
                className={`relative flex flex-col ${
                  tier.popular
                    ? "border-primary shadow-lg scale-[1.02]"
                    : ""
                }`}
              >
                {tier.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                    Popular
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  <CardDescription>{tier.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="mb-6">
                    <span className="text-4xl font-bold">{tier.price}</span>
                    {tier.price !== "Custom" && (
                      <span className="text-muted-foreground">
                        {tier.priceUnit || ""}/month
                      </span>
                    )}
                  </div>
                  <ul className="space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    variant={tier.popular ? "default" : "outline"}
                    className="w-full"
                    onClick={() => handleSubscribe(tier)}
                    disabled={isButtonDisabled(tier)}
                  >
                    {getButtonContent(tier)}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
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
  )
}
