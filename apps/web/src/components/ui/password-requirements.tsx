"use client"

import * as React from "react"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface PasswordRequirement {
  label: string
  validator: (password: string) => boolean
}

const defaultRequirements: PasswordRequirement[] = [
  {
    label: "At least 8 characters",
    validator: (password) => password.length >= 8,
  },
  {
    label: "Contains uppercase letter",
    validator: (password) => /[A-Z]/.test(password),
  },
  {
    label: "Contains lowercase letter",
    validator: (password) => /[a-z]/.test(password),
  },
  {
    label: "Contains a number",
    validator: (password) => /[0-9]/.test(password),
  },
]

export interface PasswordRequirementsProps {
  /** The current password value */
  password: string
  /** Custom requirements (defaults to standard requirements) */
  requirements?: PasswordRequirement[]
  /** Whether to show all requirements or only failed ones */
  showAll?: boolean
  /** Additional className */
  className?: string
}

function PasswordRequirements({
  password,
  requirements = defaultRequirements,
  showAll = true,
  className,
}: PasswordRequirementsProps) {
  if (!password && !showAll) {
    return null
  }

  const results = requirements.map((req) => ({
    ...req,
    isMet: req.validator(password),
  }))

  const visibleResults = showAll
    ? results
    : results.filter((r) => !r.isMet || password.length > 0)

  if (visibleResults.length === 0) {
    return null
  }

  return (
    <div className={cn("space-y-1 text-sm", className)}>
      {visibleResults.map((req, index) => (
        <div
          key={index}
          className={cn(
            "flex items-center gap-2 transition-colors duration-200",
            req.isMet ? "text-green-600" : "text-muted-foreground"
          )}
        >
          {req.isMet ? (
            <Check className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
          )}
          <span className={cn(req.isMet && "line-through opacity-70")}>
            {req.label}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Minimal requirements for basic validation */
const minimalRequirements: PasswordRequirement[] = [
  {
    label: "At least 8 characters",
    validator: (password) => password.length >= 8,
  },
]

export { PasswordRequirements, defaultRequirements, minimalRequirements }
