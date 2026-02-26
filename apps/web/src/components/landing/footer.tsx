import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          {/* Brand */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center space-x-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="text-sm font-bold text-primary-foreground">P</span>
              </div>
              <span className="text-xl font-bold">PlanFlow</span>
            </Link>
            <nav className="flex items-center gap-4">
              <Link
                href="/docs"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Docs
              </Link>
              <Link
                href="/pricing"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Pricing
              </Link>
              <Link
                href="https://github.com/BekaChkhiro"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                GitHub
              </Link>
            </nav>
          </div>

          {/* Credits */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Created by <span className="font-medium text-foreground">Chkhiro</span></span>
            <span className="hidden md:inline">•</span>
            <span>&copy; {new Date().getFullYear()} PlanFlow</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
