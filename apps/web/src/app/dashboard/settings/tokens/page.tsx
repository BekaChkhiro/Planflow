'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Loader2,
  Plus,
  Copy,
  Check,
  Trash2,
  Key,
  AlertTriangle,
} from 'lucide-react'

import { useTokens, useCreateToken, useRevokeToken, type ApiToken } from '@/hooks/use-tokens'
import { Button } from '@/components/ui/button'
import { ValidatedInput } from '@/components/ui/validated-input'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'

// Create token form schema - keep as string for form, convert on submit
const CreateTokenSchema = z.object({
  name: z
    .string()
    .min(1, 'Token name is required')
    .max(100, 'Token name must be at most 100 characters'),
  expiresInDays: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val === '') return true
        const num = parseInt(val, 10)
        return !isNaN(num) && num >= 1 && num <= 365
      },
      { message: 'Expiration must be between 1 and 365 days' }
    ),
})

type CreateTokenFormData = z.infer<typeof CreateTokenSchema>

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Never'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(dateString: string | null): string {
  if (!dateString) return 'Never'
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

function CreateTokenDialog() {
  const [open, setOpen] = useState(false)
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const createToken = useCreateToken()

  const form = useForm<CreateTokenFormData>({
    resolver: zodResolver(CreateTokenSchema),
    mode: 'onTouched', // Enable real-time validation after field is touched
    defaultValues: {
      name: '',
      expiresInDays: '',
    },
  })

  const isLoading = form.formState.isSubmitting

  async function onSubmit(data: CreateTokenFormData) {
    try {
      const response = await createToken.mutateAsync({
        name: data.name,
        expiresInDays: data.expiresInDays ? parseInt(data.expiresInDays, 10) : undefined,
      })
      setCreatedToken(response.data.token)
    } catch {
      // Error is handled by mutation
    }
  }

  function handleCopy() {
    if (createdToken) {
      navigator.clipboard.writeText(createdToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function handleClose() {
    setOpen(false)
    setCreatedToken(null)
    setCopied(false)
    form.reset()
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose()
      else setOpen(true)
    }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Token
        </Button>
      </DialogTrigger>
      <DialogContent>
        {createdToken ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-status-success" />
                Token Created
              </DialogTitle>
              <DialogDescription>
                Copy your token now. You won&apos;t be able to see it again.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-md bg-status-warning border border-status-warning p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-status-warning shrink-0 mt-0.5" />
                  <p className="text-sm text-status-warning">
                    Make sure to copy your API token now. For security reasons, it won&apos;t be shown again.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-muted p-3 text-sm font-mono break-all">
                  {createdToken}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-status-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create API Token</DialogTitle>
              <DialogDescription>
                Generate a new token to authenticate with the MCP server from Claude Code.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Token Name</FormLabel>
                      <FormControl>
                        <ValidatedInput
                          placeholder="e.g., MacBook Pro, Work Laptop"
                          disabled={isLoading}
                          isValid={fieldState.isTouched && !fieldState.error && field.value !== ''}
                          isError={!!fieldState.error}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        A name to help you identify this token
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="expiresInDays"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Expiration (Optional)</FormLabel>
                      <FormControl>
                        <ValidatedInput
                          type="number"
                          placeholder="e.g., 30, 90, 365"
                          min={1}
                          max={365}
                          disabled={isLoading}
                          isValid={fieldState.isTouched && !fieldState.error && field.value !== ''}
                          isError={!!fieldState.error}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Number of days until the token expires (1-365). Leave empty for no expiration.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Token
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function TokenRow({ token }: { token: ApiToken }) {
  const revokeToken = useRevokeToken()
  const [isRevoking, setIsRevoking] = useState(false)
  const expired = isExpired(token.expiresAt)

  async function handleRevoke() {
    setIsRevoking(true)
    try {
      await revokeToken.mutateAsync(token.id)
    } finally {
      setIsRevoking(false)
    }
  }

  return (
    <div className="flex items-center justify-between py-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{token.name}</span>
          {expired && (
            <span className="rounded-full bg-status-error px-2 py-0.5 text-xs font-medium text-status-error">
              Expired
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Created {formatDate(token.createdAt)}</span>
          <span>Last used: {formatDateTime(token.lastUsedAt)}</span>
          {token.expiresAt && (
            <span>
              {expired ? 'Expired' : 'Expires'}: {formatDate(token.expiresAt)}
            </span>
          )}
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-status-error">
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Token</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke &quot;{token.name}&quot;? Any applications using this
              token will no longer be able to authenticate. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isRevoking}
            >
              {isRevoking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Revoke Token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function TokenList() {
  const { data: tokens, isLoading, error } = useTokens()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load tokens. Please try again.
      </div>
    )
  }

  if (!tokens || tokens.length === 0) {
    return (
      <EmptyState
        illustration="tokens"
        title="No API tokens"
        description="Create a token to authenticate with the MCP server from Claude Code."
        size="md"
      />
    )
  }

  return (
    <div className="divide-y divide-border">
      {tokens.map((token) => (
        <TokenRow key={token.id} token={token} />
      ))}
    </div>
  )
}

export default function TokensSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-foreground">API Tokens</h2>
        <p className="text-sm text-muted-foreground">
          Manage API tokens for authenticating with the MCP server from Claude Code
        </p>
      </div>

      <Separator />

      {/* Info Card */}
      <div className="rounded-lg border bg-status-info border-status-info p-4">
        <div className="flex gap-3">
          <Key className="h-5 w-5 text-status-info shrink-0 mt-0.5" />
          <div className="text-sm text-status-info">
            <p className="font-medium">What are API tokens?</p>
            <p className="mt-1 opacity-90">
              API tokens allow the PlanFlow MCP server to authenticate with your account.
              Use these tokens when configuring Claude Code to sync your projects.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Your Tokens</CardTitle>
            <CardDescription>
              Tokens you&apos;ve created for MCP authentication
            </CardDescription>
          </div>
          <CreateTokenDialog />
        </CardHeader>
        <CardContent>
          <TokenList />
        </CardContent>
      </Card>

      {/* Security Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Security Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-status-success">•</span>
              Create separate tokens for each device or application
            </li>
            <li className="flex items-start gap-2">
              <span className="text-status-success">•</span>
              Use expiration dates for tokens on shared or temporary devices
            </li>
            <li className="flex items-start gap-2">
              <span className="text-status-success">•</span>
              Revoke tokens immediately if you suspect they&apos;ve been compromised
            </li>
            <li className="flex items-start gap-2">
              <span className="text-status-success">•</span>
              Never share your tokens or commit them to version control
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
