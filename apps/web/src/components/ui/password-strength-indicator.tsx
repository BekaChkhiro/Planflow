"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type PasswordStrength = "empty" | "weak" | "fair" | "good" | "strong"

export interface PasswordStrengthResult {
  strength: PasswordStrength
  score: number // 0-4
  label: string
  feedback: string[]
}

/**
 * Calculate password strength based on multiple factors
 */
export function calculatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return {
      strength: "empty",
      score: 0,
      label: "",
      feedback: [],
    }
  }

  let score = 0
  const feedback: string[] = []

  // Length checks (up to 2 points)
  if (password.length >= 8) {
    score += 1
  } else {
    feedback.push("Use at least 8 characters")
  }

  if (password.length >= 12) {
    score += 1
  }

  // Character variety checks (up to 4 points)
  if (/[a-z]/.test(password)) {
    score += 0.5
  } else {
    feedback.push("Add lowercase letters")
  }

  if (/[A-Z]/.test(password)) {
    score += 0.5
  } else {
    feedback.push("Add uppercase letters")
  }

  if (/[0-9]/.test(password)) {
    score += 0.5
  } else {
    feedback.push("Add numbers")
  }

  if (/[^a-zA-Z0-9]/.test(password)) {
    score += 0.5
  } else {
    feedback.push("Add special characters (!@#$%^&*)")
  }

  // Bonus for extra length
  if (password.length >= 16) {
    score += 0.5
  }

  // Penalty for common patterns
  const commonPatterns = [
    /^[a-z]+$/i, // Only letters
    /^[0-9]+$/, // Only numbers
    /(.)\1{2,}/, // Repeated characters (3+)
    /^(password|123456|qwerty|abc123|letmein|welcome)/i, // Common passwords
  ]

  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      score = Math.max(0, score - 1)
      break
    }
  }

  // Normalize score to 0-4 range
  const normalizedScore = Math.min(4, Math.max(0, Math.round(score)))

  // Determine strength level
  let strength: PasswordStrength
  let label: string

  if (normalizedScore === 0) {
    strength = "weak"
    label = "Very Weak"
  } else if (normalizedScore === 1) {
    strength = "weak"
    label = "Weak"
  } else if (normalizedScore === 2) {
    strength = "fair"
    label = "Fair"
  } else if (normalizedScore === 3) {
    strength = "good"
    label = "Good"
  } else {
    strength = "strong"
    label = "Strong"
  }

  return {
    strength,
    score: normalizedScore,
    label,
    feedback: feedback.slice(0, 2), // Show max 2 suggestions
  }
}

export interface PasswordStrengthIndicatorProps {
  /** The current password value */
  password: string
  /** Show feedback suggestions */
  showFeedback?: boolean
  /** Additional className for the container */
  className?: string
}

const strengthConfig = {
  empty: {
    color: "bg-gray-200",
    textColor: "text-muted-foreground",
    segments: 0,
  },
  weak: {
    color: "bg-red-500",
    textColor: "text-red-600",
    segments: 1,
  },
  fair: {
    color: "bg-orange-500",
    textColor: "text-orange-600",
    segments: 2,
  },
  good: {
    color: "bg-yellow-500",
    textColor: "text-yellow-600",
    segments: 3,
  },
  strong: {
    color: "bg-green-500",
    textColor: "text-green-600",
    segments: 4,
  },
}

function PasswordStrengthIndicator({
  password,
  showFeedback = true,
  className,
}: PasswordStrengthIndicatorProps) {
  const result = calculatePasswordStrength(password)
  const config = strengthConfig[result.strength]

  if (!password) {
    return null
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[1, 2, 3, 4].map((segment) => (
            <div
              key={segment}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-all duration-300",
                segment <= config.segments ? config.color : "bg-gray-200"
              )}
            />
          ))}
        </div>
        <span
          className={cn(
            "text-xs font-medium transition-colors duration-300",
            config.textColor
          )}
        >
          {result.label}
        </span>
      </div>

      {/* Feedback suggestions */}
      {showFeedback && result.feedback.length > 0 && result.strength !== "strong" && (
        <div className="text-xs text-muted-foreground">
          {result.feedback.map((tip, index) => (
            <span key={index}>
              {index > 0 && " • "}
              {tip}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export { PasswordStrengthIndicator }
