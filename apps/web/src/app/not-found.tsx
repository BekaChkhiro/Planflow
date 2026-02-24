import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-2xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-primary px-6 py-3 text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
