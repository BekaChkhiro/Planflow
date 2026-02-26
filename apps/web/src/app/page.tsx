import { Navbar, Hero, Features, Pricing, FAQ, Footer } from "@/components/landing"

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <Features />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </div>
  )
}
