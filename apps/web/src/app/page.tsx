import { Navbar, Hero, Features, Tutorials, Pricing, Testimonials, FAQ } from "@/components/landing"

export default function Home() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Tutorials />
        <Pricing />
        <Testimonials />
        <FAQ />
      </main>
    </div>
  )
}
