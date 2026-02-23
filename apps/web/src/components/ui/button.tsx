"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { formatShortcutKeys, useKeyboardShortcut } from "@/lib/accessibility"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Keyboard shortcut badge shown next to button text
 */
function KeyboardShortcutBadge({ shortcut }: { shortcut: string[] }) {
  return (
    <kbd className="ml-auto hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-muted/50 border rounded text-muted-foreground">
      {formatShortcutKeys(shortcut)}
    </kbd>
  )
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Keyboard shortcut to trigger this button (e.g., ['Cmd/Ctrl', 'Enter']) */
  shortcut?: {
    key: string
    ctrl?: boolean
    shift?: boolean
    alt?: boolean
  }
  /** Show keyboard shortcut hint badge */
  showShortcutHint?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, shortcut, showShortcutHint = false, children, onClick, disabled, ...props }, ref) => {
    const buttonRef = React.useRef<HTMLButtonElement>(null)

    // Combine refs
    React.useImperativeHandle(ref, () => buttonRef.current as HTMLButtonElement)

    // Register keyboard shortcut if provided (only when not asChild to avoid hook issues)
    useKeyboardShortcut(
      shortcut ?? { key: '' },
      () => {
        if (!disabled && buttonRef.current) {
          buttonRef.current.click()
        }
      },
      !!shortcut && !disabled && !asChild
    )

    // Build shortcut display array
    const shortcutKeys: string[] = []
    if (shortcut) {
      if (shortcut.ctrl) shortcutKeys.push('Cmd/Ctrl')
      if (shortcut.shift) shortcutKeys.push('Shift')
      if (shortcut.alt) shortcutKeys.push('Alt')
      shortcutKeys.push(shortcut.key)
    }

    // When asChild is true, Slot expects exactly one child
    // Return early with Slot to ensure no extra children
    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={buttonRef}
          {...props}
        >
          {children}
        </Slot>
      )
    }

    // Regular button with optional shortcut badge
    const showBadge = showShortcutHint && shortcut && shortcutKeys.length > 0

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={buttonRef}
        onClick={onClick}
        disabled={disabled}
        {...props}
      >
        {children}
        {showBadge && <KeyboardShortcutBadge shortcut={shortcutKeys} />}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
