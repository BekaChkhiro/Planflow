'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Button, type ButtonProps } from './button'
import { cn } from '@/lib/utils'

interface LoadingButtonProps extends ButtonProps {
  loading?: boolean
  loadingText?: string
}

/**
 * Button with built-in loading state
 *
 * @example
 * ```tsx
 * <LoadingButton loading={isSubmitting}>
 *   Save Changes
 * </LoadingButton>
 *
 * <LoadingButton loading={isSaving} loadingText="Saving...">
 *   Save
 * </LoadingButton>
 * ```
 */
const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ className, children, disabled, loading, loadingText, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        className={cn(className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {loadingText || children}
          </>
        ) : (
          children
        )}
      </Button>
    )
  }
)
LoadingButton.displayName = 'LoadingButton'

export { LoadingButton }
export type { LoadingButtonProps }
