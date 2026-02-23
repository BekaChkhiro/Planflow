"use client"

import * as React from "react"
import { Check, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ValidatedInputProps extends React.ComponentProps<"input"> {
  /** Whether the field has been validated and is valid */
  isValid?: boolean
  /** Whether the field has an error */
  isError?: boolean
  /** Whether validation is in progress */
  isValidating?: boolean
  /** Whether to show the validation indicator */
  showValidation?: boolean
  /** Custom icon for valid state */
  validIcon?: React.ReactNode
  /** Custom icon for error state */
  errorIcon?: React.ReactNode
}

const ValidatedInput = React.forwardRef<HTMLInputElement, ValidatedInputProps>(
  (
    {
      className,
      type,
      isValid,
      isError,
      isValidating,
      showValidation = true,
      validIcon,
      errorIcon,
      ...props
    },
    ref
  ) => {
    const showIndicator = showValidation && (isValid || isError || isValidating)

    return (
      <div className="relative">
        <input
          type={type}
          className={cn(
            "flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            // Default border
            "border-input",
            // Valid state
            isValid && showValidation && "border-green-500 focus-visible:ring-green-500",
            // Error state
            isError && showValidation && "border-destructive focus-visible:ring-destructive",
            // Add padding for icon
            showIndicator && "pr-10",
            className
          )}
          ref={ref}
          {...props}
        />
        {showIndicator && (
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            {isValidating ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : isError ? (
              errorIcon || <AlertCircle className="h-4 w-4 text-destructive" />
            ) : isValid ? (
              validIcon || <Check className="h-4 w-4 text-green-500" />
            ) : null}
          </div>
        )}
      </div>
    )
  }
)
ValidatedInput.displayName = "ValidatedInput"

export { ValidatedInput }
