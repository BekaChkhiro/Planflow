'use client'

import { useRouter } from 'next/navigation'
import { XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Navbar, Footer } from '@/components/landing'

export default function CheckoutCancelPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="pb-4">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <XCircle className="h-10 w-10 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">Checkout Cancelled</CardTitle>
          <CardDescription>
            Your checkout was cancelled. No charges were made.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            If you have any questions about our pricing or need help choosing the
            right plan, feel free to reach out to our support team.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button
            className="w-full"
            onClick={() => router.push('/pricing')}
          >
            View Plans
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push('/dashboard/projects')}
          >
            Go to Projects
          </Button>
        </CardFooter>
      </Card>
      </main>
      <Footer />
    </div>
  )
}
