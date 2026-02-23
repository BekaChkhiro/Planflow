'use client'

import * as React from 'react'
import { Keyboard } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useKeyboardShortcut, globalKeyboardShortcuts, formatShortcutKeys } from '@/lib/accessibility'
import { cn } from '@/lib/utils'

interface KeyboardShortcutsDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Keyboard shortcut badge component
 */
function KeyBadge({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 text-xs font-medium bg-muted border rounded shadow-sm">
      {children}
    </kbd>
  )
}

/**
 * Render keyboard shortcut keys as badges
 */
function ShortcutKeys({ keys }: { keys: readonly string[] }) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((key, index) => (
        <React.Fragment key={index}>
          <KeyBadge>{formatShortcutKeys([key])}</KeyBadge>
          {index < keys.length - 1 && (
            <span className="text-muted-foreground text-xs">+</span>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

/**
 * Shortcut category section
 */
function ShortcutSection({
  title,
  shortcuts,
}: {
  title: string
  shortcuts: readonly { keys: readonly string[]; description: string }[]
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </h3>
      <div className="space-y-1.5">
        {shortcuts.map((shortcut, index) => (
          <div
            key={index}
            className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
          >
            <span className="text-sm text-foreground">{shortcut.description}</span>
            <ShortcutKeys keys={shortcut.keys} />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Keyboard shortcuts help dialog
 * Shows all available keyboard shortcuts organized by category
 */
export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsDialogProps) {
  const [isOpen, setIsOpen] = React.useState(open ?? false)

  // Sync controlled/uncontrolled state
  React.useEffect(() => {
    if (open !== undefined) {
      setIsOpen(open)
    }
  }, [open])

  const handleOpenChange = React.useCallback((newOpen: boolean) => {
    setIsOpen(newOpen)
    onOpenChange?.(newOpen)
  }, [onOpenChange])

  // Register '?' shortcut to open dialog
  useKeyboardShortcut(
    { key: '?', shift: true },
    () => handleOpenChange(true),
    !isOpen
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[80vh] overflow-y-auto"
        aria-describedby="keyboard-shortcuts-description"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" aria-hidden="true" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription id="keyboard-shortcuts-description">
            Use these keyboard shortcuts to navigate and interact with PlanFlow more efficiently.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <ShortcutSection
            title="General"
            shortcuts={globalKeyboardShortcuts.general}
          />

          <ShortcutSection
            title="Navigation"
            shortcuts={globalKeyboardShortcuts.navigation}
          />

          <ShortcutSection
            title="Lists & Menus"
            shortcuts={globalKeyboardShortcuts.lists}
          />

          <ShortcutSection
            title="Forms"
            shortcuts={globalKeyboardShortcuts.forms}
          />
        </div>

        <div className="mt-6 pt-4 border-t text-center">
          <p className="text-xs text-muted-foreground">
            Press <KeyBadge>Esc</KeyBadge> to close this dialog
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Keyboard shortcuts provider - renders the dialog at app level
 * Add this to your root layout to enable the '?' shortcut globally
 */
export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      {children}
      <KeyboardShortcutsDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

/**
 * Button to trigger keyboard shortcuts dialog
 */
export function KeyboardShortcutsButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors',
          className
        )}
        onClick={() => setOpen(true)}
        aria-label="Show keyboard shortcuts"
        {...props}
      >
        <Keyboard className="h-4 w-4" aria-hidden="true" />
        <span>Keyboard shortcuts</span>
        <KeyBadge>?</KeyBadge>
      </button>
      <KeyboardShortcutsDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
