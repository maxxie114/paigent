/**
 * Landing Page
 *
 * @description Public landing page for Paigent Studio.
 */

import Link from "next/link";
import { Sparkles, Play, Wallet, Zap, Shield, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border/50 bg-card/30 backdrop-blur-xl fixed top-0 w-full z-50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-accent to-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-cyan-accent to-primary bg-clip-text text-transparent">
              Paigent Studio
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <Link href="/sign-in">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/sign-up">
              <Button className="bg-gradient-to-r from-cyan-accent to-primary hover:opacity-90">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-accent/10 border border-cyan-accent/30 text-cyan-accent text-sm mb-8">
            <Sparkles className="w-4 h-4" />
            <span>Powered by x402 Protocol & MongoDB Atlas</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            <span className="bg-gradient-to-r from-foreground via-cyan-accent to-primary bg-clip-text text-transparent">
              Agentic Workflows
            </span>
            <br />
            <span className="text-muted-foreground">with Micropayments</span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Design and execute multi-agent workflows that pay for premium tools on-demand.
            Voice-first interface, real-time execution, and USDC micropayments.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link href="/sign-up">
              <Button
                size="lg"
                className="bg-gradient-to-r from-cyan-accent to-primary hover:opacity-90 text-lg px-8 h-14"
              >
                Start Building
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button size="lg" variant="outline" className="text-lg px-8 h-14">
                View Demo
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-center mb-12">
            Everything you need for intelligent automation
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="p-6 rounded-2xl bg-card/50 backdrop-blur border border-border/50 hover:border-cyan-accent/50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-cyan-accent/20 flex items-center justify-center mb-4">
                <Play className="w-6 h-6 text-cyan-accent" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Voice-First Design</h3>
              <p className="text-muted-foreground">
                Describe your workflow goals using natural language or voice input.
                Our AI planner creates the optimal execution graph automatically.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-2xl bg-card/50 backdrop-blur border border-border/50 hover:border-payment/50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-payment/20 flex items-center justify-center mb-4">
                <Wallet className="w-6 h-6 text-payment" />
              </div>
              <h3 className="text-xl font-semibold mb-2">x402 Micropayments</h3>
              <p className="text-muted-foreground">
                Pay only for the tools you use with USDC micropayments.
                Built-in budget controls and approval gates for cost management.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-2xl bg-card/50 backdrop-blur border border-border/50 hover:border-success/50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-success" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Real-Time Execution</h3>
              <p className="text-muted-foreground">
                Watch your workflows execute step-by-step with live updates.
                Pause, approve, or cancel at any point during execution.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-6 rounded-2xl bg-card/50 backdrop-blur border border-border/50 hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Enterprise Security</h3>
              <p className="text-muted-foreground">
                SSRF protection, tool allowlisting, and complete audit trails.
                Every action is logged and traceable.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-6 rounded-2xl bg-card/50 backdrop-blur border border-border/50 hover:border-warning/50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-warning" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Multi-Agent System</h3>
              <p className="text-muted-foreground">
                Specialized agents for planning, retrieval, negotiation,
                execution, and quality assurance work together seamlessly.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-6 rounded-2xl bg-card/50 backdrop-blur border border-border/50 hover:border-cyan-accent/50 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-cyan-accent/20 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-cyan-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">MongoDB Atlas</h3>
              <p className="text-muted-foreground">
                State persistence, vector search for tool discovery,
                and real-time change streams for live updates.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-bold mb-6">
            Ready to automate with intelligence?
          </h2>
          <p className="text-xl text-muted-foreground mb-10">
            Start building workflows that pay for themselves.
            No credit card required for testnet.
          </p>
          <Link href="/sign-up">
            <Button
              size="lg"
              className="bg-gradient-to-r from-cyan-accent to-primary hover:opacity-90 text-lg px-8 h-14"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 px-6">
        <div className="container mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-cyan-accent to-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm text-muted-foreground">
              © 2025 Paigent Studio. Built for the MongoDB AI Hackathon.
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Base Sepolia Testnet</span>
            <span>•</span>
            <span>x402 Protocol</span>
            <span>•</span>
            <span>Coinbase CDP</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
