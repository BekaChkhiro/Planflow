'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Loader2,
  Plug,
  Check,
  ExternalLink,
  Github,
  MessageSquare,
  Unplug,
  Settings2,
  Zap,
  Bell,
  Send,
} from 'lucide-react'

import {
  useIntegrations,
  useConnectIntegration,
  useDisconnectIntegration,
  useConfigureWebhook,
  useUpdateNotificationPreferences,
  useTestWebhook,
  INTEGRATIONS_CONFIG,
  NOTIFICATION_EVENT_TYPES,
  DEFAULT_ENABLED_EVENTS,
  getIntegrationStatus,
  type IntegrationType,
  type IntegrationConfig,
  type Integration,
} from '@/hooks/use-integrations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'

// Slack icon component (Lucide doesn't have one)
function SlackIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  )
}

// Discord icon component
function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  )
}

function getIntegrationIcon(type: IntegrationType, className?: string) {
  switch (type) {
    case 'github':
      return <Github className={className} />
    case 'slack':
      return <SlackIcon className={className} />
    case 'discord':
      return <DiscordIcon className={className} />
  }
}

function getIntegrationColor(type: IntegrationType) {
  switch (type) {
    case 'github':
      return {
        bg: 'bg-gray-100',
        text: 'text-gray-900',
        border: 'border-gray-200',
        icon: 'text-gray-900',
      }
    case 'slack':
      return {
        bg: 'bg-purple-50',
        text: 'text-purple-900',
        border: 'border-purple-200',
        icon: 'text-purple-600',
      }
    case 'discord':
      return {
        bg: 'bg-indigo-50',
        text: 'text-indigo-900',
        border: 'border-indigo-200',
        icon: 'text-indigo-600',
      }
  }
}

// Webhook configuration form schema
const WebhookFormSchema = z.object({
  webhookUrl: z
    .string()
    .min(1, 'Webhook URL is required')
    .url('Please enter a valid URL')
    .refine(
      (url) => url.startsWith('https://'),
      'Webhook URL must use HTTPS'
    ),
  channel: z.string().optional(),
})

type WebhookFormData = z.infer<typeof WebhookFormSchema>

interface WebhookDialogProps {
  type: 'slack' | 'discord'
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function WebhookDialog({ type, open, onOpenChange, onSuccess }: WebhookDialogProps) {
  const configureWebhook = useConfigureWebhook()
  const [error, setError] = useState<string | null>(null)

  const form = useForm<WebhookFormData>({
    resolver: zodResolver(WebhookFormSchema),
    defaultValues: {
      webhookUrl: '',
      channel: '',
    },
  })

  const isLoading = form.formState.isSubmitting

  async function onSubmit(data: WebhookFormData) {
    setError(null)
    try {
      await configureWebhook.mutateAsync({
        type,
        webhookUrl: data.webhookUrl,
        channel: data.channel,
      })
      onSuccess()
      onOpenChange(false)
      form.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to configure webhook')
    }
  }

  function handleClose() {
    onOpenChange(false)
    setError(null)
    form.reset()
  }

  const config = INTEGRATIONS_CONFIG.find((c) => c.type === type)
  const colors = getIntegrationColor(type)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose()
      else onOpenChange(true)
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getIntegrationIcon(type, `h-5 w-5 ${colors.icon}`)}
            Configure {config?.name} Webhook
          </DialogTitle>
          <DialogDescription>
            {type === 'slack'
              ? 'Create an Incoming Webhook in your Slack workspace and paste the URL below.'
              : 'Create a Webhook in your Discord server settings and paste the URL below.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="webhookUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Webhook URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={
                        type === 'slack'
                          ? 'https://hooks.slack.com/services/...'
                          : 'https://discord.com/api/webhooks/...'
                      }
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {type === 'slack' ? (
                      <span className="flex items-center gap-1">
                        Get your webhook URL from
                        <a
                          href="https://api.slack.com/messaging/webhooks"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          Slack App Settings
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        Create a webhook in
                        <a
                          href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          Discord Server Settings
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </span>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {type === 'slack' && (
              <FormField
                control={form.control}
                name="channel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Channel (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="#planflow-updates"
                        disabled={isLoading}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Override the default channel for notifications
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Webhook
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

interface NotificationPreferencesDialogProps {
  type: 'slack' | 'discord'
  integration: Integration
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function NotificationPreferencesDialog({
  type,
  integration,
  open,
  onOpenChange,
  onSuccess,
}: NotificationPreferencesDialogProps) {
  const { toast } = useToast()
  const updatePreferences = useUpdateNotificationPreferences()
  const testWebhook = useTestWebhook()
  const [enabledEvents, setEnabledEvents] = useState<string[]>(
    integration.enabledEvents ?? DEFAULT_ENABLED_EVENTS
  )
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)

  const colors = getIntegrationColor(type)
  const config = INTEGRATIONS_CONFIG.find((c) => c.type === type)

  // Reset state when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setEnabledEvents(integration.enabledEvents ?? DEFAULT_ENABLED_EVENTS)
    }
    onOpenChange(isOpen)
  }

  const handleToggleEvent = (eventId: string) => {
    setEnabledEvents((prev) =>
      prev.includes(eventId)
        ? prev.filter((id) => id !== eventId)
        : [...prev, eventId]
    )
  }

  const handleSelectAll = () => {
    setEnabledEvents(NOTIFICATION_EVENT_TYPES.map((e) => e.id))
  }

  const handleDeselectAll = () => {
    setEnabledEvents([])
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updatePreferences.mutateAsync({
        type,
        integrationId: integration.id,
        enabledEvents,
      })
      toast({
        title: 'Preferences saved',
        description: 'Your notification preferences have been updated.',
      })
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast({
        title: 'Failed to save preferences',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleTestWebhook = async () => {
    setIsTesting(true)
    try {
      await testWebhook.mutateAsync({
        type,
        integrationId: integration.id,
      })
      toast({
        title: 'Test message sent',
        description: `Check your ${config?.name} channel for the test message.`,
      })
    } catch (err) {
      toast({
        title: 'Test failed',
        description: err instanceof Error ? err.message : 'Could not send test message.',
        variant: 'destructive',
      })
    } finally {
      setIsTesting(false)
    }
  }

  const enabledCount = enabledEvents.length
  const totalCount = NOTIFICATION_EVENT_TYPES.length

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getIntegrationIcon(type, `h-5 w-5 ${colors.icon}`)}
            {config?.name} Notification Preferences
          </DialogTitle>
          <DialogDescription>
            Choose which events should send notifications to {config?.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Quick actions */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {enabledCount} of {totalCount} events enabled
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                disabled={enabledCount === totalCount}
              >
                Select all
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeselectAll}
                disabled={enabledCount === 0}
              >
                Deselect all
              </Button>
            </div>
          </div>

          <Separator />

          {/* Event list */}
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
            {NOTIFICATION_EVENT_TYPES.map((event) => {
              const isEnabled = enabledEvents.includes(event.id)
              return (
                <div
                  key={event.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                    isEnabled
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border bg-background hover:bg-muted/50'
                  }`}
                >
                  <Checkbox
                    id={event.id}
                    checked={isEnabled}
                    onCheckedChange={() => handleToggleEvent(event.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 space-y-1">
                    <Label
                      htmlFor={event.id}
                      className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                    >
                      <span>{event.emoji}</span>
                      {event.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {event.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          <Separator />

          {/* Test webhook */}
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Test your webhook</p>
                <p className="text-xs text-muted-foreground">
                  Send a test message to verify your setup
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestWebhook}
                disabled={isTesting}
              >
                {isTesting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send Test
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Preferences
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface IntegrationCardProps {
  config: IntegrationConfig
  integration: Integration | undefined
}

function IntegrationCard({ config, integration }: IntegrationCardProps) {
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false)
  const [preferencesDialogOpen, setPreferencesDialogOpen] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const connectIntegration = useConnectIntegration()
  const disconnectIntegration = useDisconnectIntegration()

  const isConnected = integration?.status === 'connected'
  const colors = getIntegrationColor(config.type)

  async function handleConnect() {
    if (config.type === 'github') {
      // GitHub uses OAuth flow
      setIsConnecting(true)
      try {
        const response = await connectIntegration.mutateAsync(config.type)
        if (response.data.authUrl) {
          // Redirect to GitHub OAuth
          window.location.href = response.data.authUrl
        }
      } catch {
        setIsConnecting(false)
      }
    } else {
      // Slack and Discord use webhook configuration
      setWebhookDialogOpen(true)
    }
  }

  async function handleDisconnect() {
    setIsDisconnecting(true)
    try {
      await disconnectIntegration.mutateAsync(config.type)
      setSuccessMessage('Integration disconnected')
      setTimeout(() => setSuccessMessage(null), 3000)
    } finally {
      setIsDisconnecting(false)
    }
  }

  function handleWebhookSuccess() {
    setSuccessMessage('Webhook configured successfully!')
    setTimeout(() => setSuccessMessage(null), 3000)
  }

  function handlePreferencesSuccess() {
    setSuccessMessage('Notification preferences updated!')
    setTimeout(() => setSuccessMessage(null), 3000)
  }

  return (
    <>
      <Card className={isConnected ? 'border-green-200 bg-green-50/30' : ''}>
        <CardHeader className="flex flex-row items-start gap-4 space-y-0">
          <div className={`rounded-lg p-3 ${colors.bg} ${colors.border} border`}>
            {getIntegrationIcon(config.type, `h-6 w-6 ${colors.icon}`)}
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{config.name}</CardTitle>
              {isConnected && (
                <Badge variant="outline" className="border-green-300 bg-green-100 text-green-700">
                  <Check className="mr-1 h-3 w-3" />
                  Connected
                </Badge>
              )}
            </div>
            <CardDescription>{config.description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Features list */}
          <ul className="grid gap-2 text-sm text-gray-600">
            {config.features.map((feature, index) => (
              <li key={index} className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                {feature}
              </li>
            ))}
          </ul>

          {/* Connection details if connected */}
          {isConnected && integration?.metadata && (
            <div className="rounded-md bg-gray-50 p-3 text-sm">
              <div className="font-medium text-gray-700 mb-1">Connection Details</div>
              {config.type === 'github' && integration.metadata.username && (
                <div className="text-gray-600">
                  Connected as: <span className="font-medium">@{integration.metadata.username}</span>
                  {integration.metadata.repository && (
                    <span> • {integration.metadata.repository}</span>
                  )}
                </div>
              )}
              {config.type === 'slack' && integration.metadata.workspace && (
                <div className="text-gray-600">
                  Workspace: <span className="font-medium">{integration.metadata.workspace}</span>
                  {integration.metadata.channel && (
                    <span> • {integration.metadata.channel}</span>
                  )}
                </div>
              )}
              {config.type === 'discord' && integration.metadata.server && (
                <div className="text-gray-600">
                  Server: <span className="font-medium">{integration.metadata.server}</span>
                </div>
              )}
            </div>
          )}

          {/* Success message */}
          {successMessage && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700">
              <Check className="h-4 w-4" />
              {successMessage}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                {(config.type === 'slack' || config.type === 'discord') && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreferencesDialogOpen(true)}
                    >
                      <Bell className="mr-2 h-4 w-4" />
                      Notifications
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setWebhookDialogOpen(true)}
                    >
                      <Settings2 className="mr-2 h-4 w-4" />
                      Configure
                    </Button>
                  </>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                      <Unplug className="mr-2 h-4 w-4" />
                      Disconnect
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect {config.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove the {config.name} integration from your account.
                        Any linked issues or webhooks will stop working. You can reconnect
                        at any time.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDisconnect}
                        className="bg-red-600 hover:bg-red-700"
                        disabled={isDisconnecting}
                      >
                        {isDisconnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Disconnect
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <Button onClick={handleConnect} disabled={isConnecting}>
                {isConnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plug className="mr-2 h-4 w-4" />
                )}
                Connect {config.name}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Webhook configuration dialog for Slack/Discord */}
      {(config.type === 'slack' || config.type === 'discord') && (
        <WebhookDialog
          type={config.type}
          open={webhookDialogOpen}
          onOpenChange={setWebhookDialogOpen}
          onSuccess={handleWebhookSuccess}
        />
      )}

      {/* Notification preferences dialog for Slack/Discord */}
      {(config.type === 'slack' || config.type === 'discord') && integration && (
        <NotificationPreferencesDialog
          type={config.type}
          integration={integration}
          open={preferencesDialogOpen}
          onOpenChange={setPreferencesDialogOpen}
          onSuccess={handlePreferencesSuccess}
        />
      )}
    </>
  )
}

function IntegrationsList() {
  const { data: integrations, isLoading, error } = useIntegrations()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load integrations. Please try again.
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      {INTEGRATIONS_CONFIG.map((config) => (
        <IntegrationCard
          key={config.type}
          config={config}
          integration={getIntegrationStatus(integrations, config.type)}
        />
      ))}
    </div>
  )
}

export default function IntegrationsSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Integrations</h2>
        <p className="text-sm text-gray-500">
          Connect external services to enhance your PlanFlow workflow
        </p>
      </div>

      <Separator />

      {/* Info Card */}
      <div className="rounded-lg border bg-blue-50 border-blue-200 p-4">
        <div className="flex gap-3">
          <Plug className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">What are integrations?</p>
            <p className="mt-1">
              Integrations connect PlanFlow with your favorite tools. Link GitHub to
              automatically track issues and PRs, or set up Slack/Discord webhooks to
              receive real-time notifications about task updates.
            </p>
          </div>
        </div>
      </div>

      {/* Integration Cards */}
      <IntegrationsList />

      {/* Help Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Need Help?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-blue-600">•</span>
              <span>
                <strong>GitHub:</strong> Requires admin access to install the PlanFlow GitHub App
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600">•</span>
              <span>
                <strong>Slack:</strong> Create an Incoming Webhook in your Slack workspace settings
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600">•</span>
              <span>
                <strong>Discord:</strong> Create a Webhook in your Discord server&apos;s Integrations settings
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600">•</span>
              <span>
                Check our{' '}
                <a href="/docs/integrations" className="text-blue-600 hover:underline">
                  integration guides
                </a>{' '}
                for step-by-step instructions
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
