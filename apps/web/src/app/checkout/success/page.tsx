'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useInvalidateSubscription } from '@/hooks/use-subscription'

export default function CheckoutSuccessPage() {
  const router = useRouter()
  const invalidateSubscription = useInvalidateSubscription()

  // Invalidate subscription query to fetch updated data
  useEffect(() => {
    invalidateSubscription()
  }, [invalidateSubscription])

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="pb-4">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl">Payment Successful!</CardTitle>
          <CardDescription>
            Thank you for subscribing to PlanFlow. Your account has been upgraded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You now have access to all premium features. Your subscription is active
            and will renew automatically.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button
            className="w-full"
            onClick={() => router.push('/dashboard/projects')}
          >
            Go to Projects
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push('/dashboard/settings')}
          >
            Manage Subscription
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
