'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Check } from 'lucide-react'

import { UpdateProfileRequestSchema, ChangePasswordRequestSchema } from '@planflow/shared'
import type { ApiResponse, User } from '@planflow/shared'
import { useUser, useAuthStore } from '@/stores/auth-store'
import { authApi } from '@/lib/auth-api'
import { Button } from '@/components/ui/button'
import { ValidatedInput } from '@/components/ui/validated-input'
import { PasswordRequirements, minimalRequirements } from '@/components/ui/password-requirements'
import { PasswordStrengthIndicator } from '@/components/ui/password-strength-indicator'
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
import { Separator } from '@/components/ui/separator'

// Profile form schema
const ProfileFormSchema = UpdateProfileRequestSchema.extend({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  email: z.string().email('Invalid email address'),
})

type ProfileFormData = z.infer<typeof ProfileFormSchema>

// Password form schema with confirm
const PasswordFormSchema = ChangePasswordRequestSchema.extend({
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type PasswordFormData = z.infer<typeof PasswordFormSchema>

function ProfileForm() {
  const user = useUser()
  const updateUser = useAuthStore((state) => state.updateUser)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(ProfileFormSchema),
    mode: 'onTouched', // Enable real-time validation after field is touched
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
    },
  })

  const isLoading = form.formState.isSubmitting

  async function onSubmit(data: ProfileFormData) {
    setError(null)
    setSuccess(false)

    try {
      const response = await authApi.patch<ApiResponse<{ user: User }>>('/users/profile', {
        name: data.name,
        email: data.email,
      })

      if (response.success && response.data) {
        updateUser(response.data.user)
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      } else {
        setError(response.error || 'Failed to update profile')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
        <CardDescription>
          Update your account details and email address
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950 p-3 text-sm text-green-700 dark:text-green-400">
                <Check className="h-4 w-4" />
                Profile updated successfully
              </div>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <ValidatedInput
                      type="text"
                      placeholder="John Doe"
                      autoComplete="name"
                      disabled={isLoading}
                      isValid={fieldState.isTouched && !fieldState.error && field.value !== ''}
                      isError={!!fieldState.error}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <ValidatedInput
                      type="email"
                      placeholder="name@example.com"
                      autoComplete="email"
                      disabled={isLoading}
                      isValid={fieldState.isTouched && !fieldState.error && field.value !== ''}
                      isError={!!fieldState.error}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Changing your email will require you to log in again
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

function PasswordForm() {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const form = useForm<PasswordFormData>({
    resolver: zodResolver(PasswordFormSchema),
    mode: 'onTouched', // Enable real-time validation after field is touched
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  // Watch newPassword for real-time requirements display
  const newPassword = form.watch('newPassword')

  const isLoading = form.formState.isSubmitting

  async function onSubmit(data: PasswordFormData) {
    setError(null)
    setSuccess(false)

    try {
      const response = await authApi.patch<ApiResponse<{ message: string }>>('/users/password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      })

      if (response.success) {
        setSuccess(true)
        form.reset()
        setTimeout(() => setSuccess(false), 3000)
      } else {
        setError(response.error || 'Failed to change password')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>
          Update your password to keep your account secure
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950 p-3 text-sm text-green-700 dark:text-green-400">
                <Check className="h-4 w-4" />
                Password changed successfully
              </div>
            )}

            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Current Password</FormLabel>
                  <FormControl>
                    <ValidatedInput
                      type="password"
                      placeholder="Enter your current password"
                      autoComplete="current-password"
                      disabled={isLoading}
                      isValid={fieldState.isTouched && !fieldState.error && field.value !== ''}
                      isError={!!fieldState.error}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newPassword"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl>
                    <ValidatedInput
                      type="password"
                      placeholder="Enter your new password"
                      autoComplete="new-password"
                      disabled={isLoading}
                      isValid={fieldState.isTouched && !fieldState.error && field.value.length >= 8}
                      isError={!!fieldState.error}
                      {...field}
                    />
                  </FormControl>
                  {newPassword && (
                    <div className="mt-2 space-y-2">
                      <PasswordStrengthIndicator password={newPassword} />
                      <PasswordRequirements
                        password={newPassword}
                        requirements={minimalRequirements}
                      />
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Confirm New Password</FormLabel>
                  <FormControl>
                    <ValidatedInput
                      type="password"
                      placeholder="Confirm your new password"
                      autoComplete="new-password"
                      disabled={isLoading}
                      isValid={fieldState.isTouched && !fieldState.error && field.value !== '' && field.value === newPassword}
                      isError={!!fieldState.error}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Change Password
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

export default function ProfileSettingsPage() {
  const user = useUser()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-foreground">Profile</h2>
        <p className="text-sm text-muted-foreground">
          Manage your personal information and account security
        </p>
      </div>

      <Separator />

      {/* Account Info Display */}
      <div className="rounded-lg border bg-muted/50 p-4">
        <div className="grid gap-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Account ID</span>
            <span className="font-mono text-foreground">{user?.id?.slice(0, 8)}...</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Member since</span>
            <span className="text-foreground">
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : '-'}
            </span>
          </div>
        </div>
      </div>

      <ProfileForm />

      <PasswordForm />
    </div>
  )
}
