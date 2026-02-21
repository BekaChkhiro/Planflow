'use client'

import { useState } from 'react'
import {
  Bell,
  BellOff,
  Mail,
  MessageSquare,
  UserPlus,
  GitPullRequest,
  CheckCircle,
  AlertCircle,
  Loader2,
  TestTube,
  Clock,
  Calendar,
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { useNotificationPreferences } from '@/hooks/use-notification-preferences'
import { useToast } from '@/hooks/use-toast'

export default function NotificationsSettingsPage() {
  const { toast } = useToast()
  const [testingSent, setTestingSent] = useState(false)

  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading: pushLoading,
    error: pushError,
    subscribe,
    unsubscribe,
    sendTestNotification,
  } = usePushNotifications()

  const {
    preferences,
    isLoading: prefsLoading,
    isUpdating,
    togglePreference,
    updatePreference,
  } = useNotificationPreferences()

  const handleTogglePush = async () => {
    if (isSubscribed) {
      const success = await unsubscribe()
      if (success) {
        toast({
          title: 'Push notifications disabled',
          description: 'You will no longer receive browser notifications.',
        })
      }
    } else {
      const success = await subscribe()
      if (success) {
        toast({
          title: 'Push notifications enabled',
          description: 'You will now receive browser notifications.',
        })
      }
    }
  }

  const handleTestNotification = async () => {
    setTestingSent(true)
    const success = await sendTestNotification()
    if (success) {
      toast({
        title: 'Test notification sent',
        description: 'Check your browser notifications.',
      })
    } else {
      toast({
        title: 'Failed to send test',
        description: pushError || 'Please enable push notifications first.',
        variant: 'destructive',
      })
    }
    setTimeout(() => setTestingSent(false), 3000)
  }

  const handleTogglePreference = async (key: keyof typeof preferences) => {
    const success = await togglePreference(key)
    if (success) {
      toast({
        title: 'Preference updated',
        description: 'Your notification settings have been saved.',
      })
    }
  }

  const isLoading = pushLoading || prefsLoading

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Notification Settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Choose how and when you want to be notified about activity.
        </p>
      </div>

      {/* Push Notifications Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isSubscribed ? (
              <Bell className="h-5 w-5 text-green-600" />
            ) : (
              <BellOff className="h-5 w-5 text-gray-400" />
            )}
            Browser Push Notifications
          </CardTitle>
          <CardDescription>
            Receive notifications even when PlanFlow is not open in your browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isSupported ? (
            <div className="flex items-center gap-2 rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800">
              <AlertCircle className="h-5 w-5" />
              <span>
                Push notifications are not supported in your browser. Try using
                Chrome, Firefox, or Edge.
              </span>
            </div>
          ) : permission === 'denied' ? (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-800">
              <AlertCircle className="h-5 w-5" />
              <span>
                Notification permission was denied. Please enable it in your
                browser settings to receive push notifications.
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="push-toggle" className="text-base">
                    Enable Push Notifications
                  </Label>
                  <p className="text-sm text-gray-500">
                    {isSubscribed
                      ? 'You will receive browser notifications'
                      : 'Enable to receive browser notifications'}
                  </p>
                </div>
                <Switch
                  id="push-toggle"
                  checked={isSubscribed}
                  onCheckedChange={handleTogglePush}
                  disabled={pushLoading}
                />
              </div>

              {isSubscribed && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestNotification}
                  disabled={testingSent}
                >
                  {testingSent ? (
                    <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                  ) : (
                    <TestTube className="mr-2 h-4 w-4" />
                  )}
                  {testingSent ? 'Notification Sent!' : 'Send Test Notification'}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Push Notification Types */}
      <Card>
        <CardHeader>
          <CardTitle>Push Notification Types</CardTitle>
          <CardDescription>
            Choose which types of events trigger push notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <MessageSquare className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <Label>Mentions</Label>
                <p className="text-sm text-gray-500">When someone @mentions you</p>
              </div>
            </div>
            <Switch
              checked={preferences.pushMentions}
              onCheckedChange={() => handleTogglePreference('pushMentions')}
              disabled={isLoading || isUpdating}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2">
                <UserPlus className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <Label>Task Assignments</Label>
                <p className="text-sm text-gray-500">When a task is assigned to you</p>
              </div>
            </div>
            <Switch
              checked={preferences.pushAssignments}
              onCheckedChange={() => handleTogglePreference('pushAssignments')}
              disabled={isLoading || isUpdating}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-2">
                <MessageSquare className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <Label>Comments</Label>
                <p className="text-sm text-gray-500">When someone comments on your tasks</p>
              </div>
            </div>
            <Switch
              checked={preferences.pushComments}
              onCheckedChange={() => handleTogglePreference('pushComments')}
              disabled={isLoading || isUpdating}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-100 p-2">
                <GitPullRequest className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <Label>Status Changes</Label>
                <p className="text-sm text-gray-500">When task status is updated</p>
              </div>
            </div>
            <Switch
              checked={preferences.pushStatusChanges}
              onCheckedChange={() => handleTogglePreference('pushStatusChanges')}
              disabled={isLoading || isUpdating}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-100 p-2">
                <Mail className="h-4 w-4 text-indigo-600" />
              </div>
              <div>
                <Label>Team Invitations</Label>
                <p className="text-sm text-gray-500">When you receive team invitations</p>
              </div>
            </div>
            <Switch
              checked={preferences.pushInvitations}
              onCheckedChange={() => handleTogglePreference('pushInvitations')}
              disabled={isLoading || isUpdating}
            />
          </div>
        </CardContent>
      </Card>

      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-gray-600" />
            Email Notifications
          </CardTitle>
          <CardDescription>
            Configure email notification preferences.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Email Notifications</Label>
              <p className="text-sm text-gray-500">
                Receive important updates via email
              </p>
            </div>
            <Switch
              checked={preferences.emailEnabled}
              onCheckedChange={() => handleTogglePreference('emailEnabled')}
              disabled={isLoading || isUpdating}
            />
          </div>

          {preferences.emailEnabled && (
            <>
              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label>Mention Emails</Label>
                  <p className="text-sm text-gray-500">Email when someone @mentions you</p>
                </div>
                <Switch
                  checked={preferences.emailMentions}
                  onCheckedChange={() => handleTogglePreference('emailMentions')}
                  disabled={isLoading || isUpdating}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label>Assignment Emails</Label>
                  <p className="text-sm text-gray-500">Email when tasks are assigned to you</p>
                </div>
                <Switch
                  checked={preferences.emailAssignments}
                  onCheckedChange={() => handleTogglePreference('emailAssignments')}
                  disabled={isLoading || isUpdating}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label>Email Digest</Label>
                  <p className="text-sm text-gray-500">
                    Receive periodic summaries of your activity
                  </p>
                </div>
                <Switch
                  checked={preferences.emailDigest}
                  onCheckedChange={() => handleTogglePreference('emailDigest')}
                  disabled={isLoading || isUpdating}
                />
              </div>

              {preferences.emailDigest && (
                <>
                  <div className="ml-4 space-y-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <Label>Frequency</Label>
                      </div>
                      <Select
                        value={preferences.emailDigestFrequency}
                        onValueChange={(value) =>
                          updatePreference('emailDigestFrequency', value as 'daily' | 'weekly' | 'none')
                        }
                        disabled={isLoading || isUpdating}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-gray-500" />
                        <Label>Send Time (UTC)</Label>
                      </div>
                      <Select
                        value={preferences.emailDigestTime}
                        onValueChange={(value) =>
                          updatePreference('emailDigestTime', value)
                        }
                        disabled={isLoading || isUpdating}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="06:00">6:00 AM</SelectItem>
                          <SelectItem value="07:00">7:00 AM</SelectItem>
                          <SelectItem value="08:00">8:00 AM</SelectItem>
                          <SelectItem value="09:00">9:00 AM</SelectItem>
                          <SelectItem value="10:00">10:00 AM</SelectItem>
                          <SelectItem value="12:00">12:00 PM</SelectItem>
                          <SelectItem value="17:00">5:00 PM</SelectItem>
                          <SelectItem value="18:00">6:00 PM</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {preferences.lastDigestSentAt && (
                      <p className="text-xs text-gray-500">
                        Last digest sent:{' '}
                        {new Date(preferences.lastDigestSentAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* In-App Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-gray-600" />
            In-App Notifications
          </CardTitle>
          <CardDescription>
            Toast notifications while using PlanFlow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Toast Notifications</Label>
              <p className="text-sm text-gray-500">
                Show pop-up notifications while using the app
              </p>
            </div>
            <Switch
              checked={preferences.toastEnabled}
              onCheckedChange={() => handleTogglePreference('toastEnabled')}
              disabled={isLoading || isUpdating}
            />
          </div>
        </CardContent>
      </Card>

      {isUpdating && (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving preferences...
        </div>
      )}
    </div>
  )
}
