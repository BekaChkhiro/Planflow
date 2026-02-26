import { HelpCircle } from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"

interface FAQItem {
  question: string
  answer: string
  category?: "general" | "pricing" | "technical" | "security"
}

const faqItems: FAQItem[] = [
  {
    question: "What is PlanFlow?",
    answer:
      "PlanFlow is an AI-native project management tool designed specifically for developers who use Claude Code. It lets you manage tasks, track progress, and sync project plans without ever leaving your terminal. Think of it as your project management system that lives right where you work.",
    category: "general",
  },
  {
    question: "How does the MCP integration work?",
    answer:
      "PlanFlow uses the Model Context Protocol (MCP) to integrate directly with Claude Code. Once you install our MCP server and add your API token, Claude can read your project plans, update task statuses, and recommend next tasks—all through natural conversation. Just say 'what should I work on next?' and Claude will analyze your dependencies and suggest the optimal task.",
    category: "technical",
  },
  {
    question: "Can I use PlanFlow without Claude Code?",
    answer:
      "Yes! While PlanFlow is optimized for Claude Code users, you can also use our web dashboard to manage projects, view progress, and update tasks. The web interface provides full access to all features including kanban boards, progress visualization, and team collaboration.",
    category: "general",
  },
  {
    question: "How does sync work between local and cloud?",
    answer:
      "PlanFlow uses a bidirectional sync system. Your PROJECT_PLAN.md file is the source of truth locally. When you run sync commands, changes are pushed to the cloud where they're accessible via the web dashboard and to your team. You can also pull changes made by others back to your local file.",
    category: "technical",
  },
  {
    question: "Is PlanFlow really free?",
    answer:
      "Yes! PlanFlow is currently free during our early access period. You get full access to all features including unlimited projects, cloud sync, team collaboration, and MCP integration. No credit card required.",
    category: "pricing",
  },
  {
    question: "Will PlanFlow always be free?",
    answer:
      "We're currently in early access and offering full access for free. In the future, we may introduce paid features or plans. If we do, we'll clearly describe the terms and pricing before you're charged. Early adopters will always have special benefits.",
    category: "pricing",
  },
  {
    question: "Is my data secure?",
    answer:
      "Security is our top priority. All data is encrypted in transit (TLS 1.3) and at rest (AES-256). We use PostgreSQL on Neon's serverless platform with automatic backups. API tokens are hashed and never stored in plain text. We're SOC 2 compliant and undergo regular security audits.",
    category: "security",
  },
  {
    question: "Can I self-host PlanFlow?",
    answer:
      "Self-hosting options are coming soon! If you have specific requirements for data residency or security, contact us at bekachkhirodze1@gmail.com and we'll work with you on a solution.",
    category: "security",
  },
  {
    question: "How do I get started?",
    answer:
      "Getting started takes less than 5 minutes: 1) Sign up for a free account, 2) Generate an API token from your dashboard, 3) Install our MCP server with 'npm install -g planflow-mcp', 4) Run 'claude mcp add planflow-mcp -- planflow-mcp' to configure Claude Code, 5) Optionally install slash commands with 'npm install -g planflow-plugin', and 6) Start managing projects by saying 'Login to PlanFlow with my token'.",
    category: "general",
  },
  {
    question: "How can I give feedback?",
    answer:
      "We love hearing from our users! You can reach us at bekachkhirodze1@gmail.com, open an issue on our GitHub repository, or join our Discord community. Your feedback helps shape the future of PlanFlow.",
    category: "general",
  },
]

export function FAQ() {
  return (
    <section id="faq" className="py-24 lg:py-32">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <Badge variant="secondary" className="mb-4">
            <HelpCircle className="mr-1 h-3 w-3" />
            FAQ
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Frequently asked
            <br />
            <span className="text-primary">questions</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Everything you need to know about PlanFlow. Can't find the answer
            you're looking for? Reach out to our support team.
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="mx-auto max-w-3xl">
          <Accordion type="single" collapsible className="w-full">
            {faqItems.map((item, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="border-border/50 px-4 rounded-lg mb-2 bg-gradient-to-b from-background to-muted/10 data-[state=open]:bg-muted/20 transition-colors"
              >
                <AccordionTrigger className="text-left hover:no-underline hover:text-primary py-5">
                  <span className="text-base font-medium">{item.question}</span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* Contact CTA */}
        <div className="mx-auto max-w-2xl text-center mt-12">
          <p className="text-muted-foreground">
            Still have questions?{" "}
            <a
              href="mailto:bekachkhirodze1@gmail.com"
              className="text-primary hover:underline font-medium"
            >
              Contact our support team
            </a>
          </p>
        </div>
      </div>
    </section>
  )
}
