'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'

import { RegisterRequestSchema } from '@planflow/shared'
import { useAuth } from '@/hooks/use-auth'
import { useAnalytics } from '@/hooks/use-analytics'
import { Button } from '@/components/ui/button'
import { ValidatedInput } from '@/components/ui/validated-input'
import { PasswordRequirements, minimalRequirements } from '@/components/ui/password-requirements'
import { PasswordStrengthIndicator } from '@/components/ui/password-strength-indicator'
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

// Extend the schema with confirm password validation
const RegisterFormSchema = RegisterRequestSchema.extend({
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type RegisterFormData = z.infer<typeof RegisterFormSchema>

export default function RegisterPage() {
  const router = useRouter()
  const { register, isLoading: authLoading } = useAuth()
  const { track } = useAnalytics()
  const [error, setError] = useState<string | null>(null)

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(RegisterFormSchema),
    mode: 'onTouched', // Enable real-time validation after field is touched
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  // Watch password for real-time requirements display
  const password = form.watch('password')

  const isLoading = form.formState.isSubmitting || authLoading

  async function onSubmit(data: RegisterFormData) {
    setError(null)

    // Send only the fields the API expects (exclude confirmPassword)
    const result = await register({
      name: data.name,
      email: data.email,
      password: data.password,
    })

    if (result.success) {
      // Track signup event (user will be identified on first login)
      track('user_signed_up', { source: 'web' })
      // Registration successful - redirect to login
      router.push('/login?registered=true')
    } else {
      setError(result.error || 'Registration failed. Please try again.')
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Create an account</CardTitle>
        <CardDescription>
          Enter your details below to create your account
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
              name="name"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
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
                  <FormLabel>Email</FormLabel>
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
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <ValidatedInput
                      type="password"
                      placeholder="Create a password"
                      autoComplete="new-password"
                      disabled={isLoading}
                      isValid={fieldState.isTouched && !fieldState.error && field.value.length >= 8}
                      isError={!!fieldState.error}
                      {...field}
                    />
                  </FormControl>
                  {password && (
                    <div className="mt-2 space-y-2">
                      <PasswordStrengthIndicator password={password} />
                      <PasswordRequirements
                        password={password}
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
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <ValidatedInput
                      type="password"
                      placeholder="Confirm your password"
                      autoComplete="new-password"
                      disabled={isLoading}
                      isValid={fieldState.isTouched && !fieldState.error && field.value !== '' && field.value === password}
                      isError={!!fieldState.error}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create account
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex flex-col space-y-4">
        <div className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </div>
      </CardFooter>
    </Card>
  )
}
