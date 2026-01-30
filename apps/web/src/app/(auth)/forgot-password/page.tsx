'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, ArrowLeft, Mail } from 'lucide-react'

import { ForgotPasswordRequestSchema, type ForgotPasswordRequest, type ApiResponse } from '@planflow/shared'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
} from '@/components/ui/form'

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState('')

  const form = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(ForgotPasswordRequestSchema),
    defaultValues: {
      email: '',
    },
  })

  const isLoading = form.formState.isSubmitting

  async function onSubmit(data: ForgotPasswordRequest) {
    setError(null)

    try {
      const response = await api.post<ApiResponse<{ message: string }>>('/auth/forgot-password', data)

      if (response.success) {
        setSubmittedEmail(data.email)
        setIsSubmitted(true)
      } else {
        setError(response.error || 'Failed to send reset email. Please try again.')
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          // Don't reveal if email exists - show success anyway for security
          setSubmittedEmail(data.email)
          setIsSubmitted(true)
        } else if (err.status === 429) {
          setError('Too many requests. Please wait a few minutes and try again.')
        } else {
          setError(err.message || 'An error occurred. Please try again.')
        }
      } else {
        setError('Unable to connect to the server. Please try again later.')
      }
    }
  }

  // Success state - email sent
  if (isSubmitted) {
    return (
      <Card>
        <CardHeader className="space-y-1">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <Mail className="h-6 w-6 text-green-600" />
          </div>
          <CardTitle className="text-center text-2xl font-bold">Check your email</CardTitle>
          <CardDescription className="text-center">
            We sent a password reset link to
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center font-medium">{submittedEmail}</p>
          <p className="text-center text-sm text-muted-foreground">
            If an account exists with this email, you&apos;ll receive a password reset link shortly.
            The link will expire in 1 hour.
          </p>
          <p className="text-center text-sm text-muted-foreground">
            Didn&apos;t receive the email? Check your spam folder or{' '}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => {
                setIsSubmitted(false)
                setSubmittedEmail('')
              }}
            >
              try again
            </button>
          </p>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Link href="/login">
            <Button variant="ghost">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to sign in
            </Button>
          </Link>
        </CardFooter>
      </Card>
    )
  }

  // Form state
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Forgot password?</CardTitle>
        <CardDescription>
          Enter your email address and we&apos;ll send you a link to reset your password
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

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="name@example.com"
                      autoComplete="email"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send reset link
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-center">
        <Link href="/login">
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to sign in
          </Button>
        </Link>
      </CardFooter>
    </Card>
  )
}
