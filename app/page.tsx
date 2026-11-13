'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MarrowNodeLogo } from '@/components/MarrowNodeLogo';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useTheme } from '@/components/ThemeProvider';
import {
  Github,
  ArrowRight,
  ShieldCheck,
  Network,
  GitCommit,
  Layers,
  HelpCircle,
  Cpu,
  FileCode2,
  Users,
  Sun,
  Moon,
  Mail,
  ExternalLink,
  Menu,
  X as CloseIcon,
  Compass,
  CheckCircle2,
} from 'lucide-react';

export default function LandingPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const [activePreviewTab, setActivePreviewTab] = useState<'overview' | 'intelligence' | 'architecture'>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const features = [
    {
      title: 'Codebase Understanding',
      desc: 'Understand the structure, files, modules, components, and technologies inside a project.',
      icon: <FileCode2 className="w-4 h-4 text-forest" />,
    },
    {
      title: 'Architecture Mapping',
      desc: 'Visualize relationships between modules, services, APIs, components, and dependencies.',
      icon: <Network className="w-4 h-4 text-forest" />,
    },
    {
      title: 'Project Timeline',
      desc: 'Explore how the project evolved through commits, pull requests, and important development changes.',
      icon: <GitCommit className="w-4 h-4 text-copper" />,
    },
    {
      title: 'Project Memory',
      desc: 'Preserve important technical context, decisions, changes, and historical project knowledge.',
      icon: <Layers className="w-4 h-4 text-forest" />,
    },
    {
      title: 'Ask Your Project',
      desc: 'Ask natural-language questions about the codebase and receive understandable technical answers.',
      icon: <HelpCircle className="w-4 h-4 text-forest" />,
    },
    {
      title: 'Evidence-Based Answers',
      desc: 'Trace answers back to relevant files, commits, documentation, dependencies, and repository evidence.',
      icon: <ShieldCheck className="w-4 h-4 text-forest" />,
    },
    {
      title: 'Change Impact Analysis',
      desc: 'Understand which areas of the project may be affected when a file, module, API, or dependency changes.',
      icon: <Cpu className="w-4 h-4 text-copper" />,
    },
    {
      title: 'Developer Onboarding',
      desc: 'Help developers quickly understand unfamiliar or long-running projects without manually reading the entire repository.',
      icon: <Users className="w-4 h-4 text-forest" />,
    },
  ];

  return (
    <div className="min-h-screen bg-ivory dark:bg-[#0E1310] text-text-primary selection:bg-forest selection:text-white flex flex-col font-sans scroll-smooth">
      {/* Top Navigation */}
      <header className="border-b border-border bg-surface/90 backdrop-blur-md sticky top-0 z-40 dark:bg-[#131915]/95 dark:border-border-dark font-sans">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center shrink-0 min-w-0" aria-label="MarrowNode home">
            <MarrowNodeLogo variant="full" size="sm" className="sm:hidden" />
            <MarrowNodeLogo variant="full" size="md" className="hidden sm:inline-flex" />
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs text-text-secondary font-medium dark:text-[#C6CDC7]">
            <button
              onClick={() => scrollToSection('about')}
              className="hover:text-text-primary transition-colors dark:hover:text-white"
            >
              About
            </button>
            <button
              onClick={() => scrollToSection('features')}
              className="hover:text-text-primary transition-colors dark:hover:text-white"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('contact')}
              className="hover:text-text-primary transition-colors dark:hover:text-white"
            >
              Contact
            </button>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <button
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="p-2 text-text-muted hover:text-text-primary rounded transition-colors dark:text-[#C6CDC7] dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"
              title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <Link href="/auth" aria-label="Continue with GitHub" className="shrink-0">
              <Button
                variant="primary"
                size="sm"
                className="font-sans font-medium text-xs whitespace-nowrap h-8 px-2.5 sm:px-3"
              >
                <Github className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden min-[360px]:inline sm:hidden ml-1.5">GitHub</span>
                <span className="hidden sm:inline ml-1.5">Continue with GitHub</span>
              </Button>
            </Link>

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 text-text-secondary hover:text-text-primary dark:text-[#C6CDC7] dark:hover:text-white rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <CloseIcon className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-surface px-4 py-3 space-y-1.5 dark:bg-[#151C17] dark:border-border-dark font-sans text-xs">
            <button
              onClick={() => scrollToSection('about')}
              className="block w-full text-left py-2 text-text-secondary hover:text-text-primary dark:text-[#C6CDC7] dark:hover:text-white font-medium"
            >
              About
            </button>
            <button
              onClick={() => scrollToSection('features')}
              className="block w-full text-left py-2 text-text-secondary hover:text-text-primary dark:text-[#C6CDC7] dark:hover:text-white font-medium"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('contact')}
              className="block w-full text-left py-2 text-text-secondary hover:text-text-primary dark:text-[#C6CDC7] dark:hover:text-white font-medium"
            >
              Contact
            </button>
            <div className="pt-2 border-t border-border dark:border-border-dark flex items-center justify-between">
              <Link
                href="/auth"
                className="flex items-center gap-2 py-1 text-xs text-text-primary dark:text-white font-medium"
              >
                <Github className="w-3.5 h-3.5" />
                <span>Continue with GitHub</span>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="pt-12 sm:pt-16 pb-10 sm:pb-14 px-4 sm:px-6 border-b border-border/80 bg-grid-pattern dark:border-border-dark/60 font-sans">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-surface border border-border text-xs text-text-secondary shadow-subtle dark:bg-[#161E19] dark:border-border-dark dark:text-[#A7AFA9] font-medium">
            <span className="w-2 h-2 rounded-full bg-forest" />
            <span>Developer Project Memory & Codebase Intelligence</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-text-primary dark:text-white leading-[1.15] font-sans">
            The Memory Layer for Software.
          </h1>

          <p className="text-sm sm:text-base text-text-secondary dark:text-[#A7AFA9] max-w-2xl mx-auto leading-relaxed font-sans">
            Understand your codebase, trace how it evolved, and uncover the context behind the software you build.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
            <Link href="/auth" className="w-full sm:w-auto">
              <Button variant="primary" size="lg" className="w-full sm:w-auto font-sans font-medium text-xs sm:text-sm h-10 px-5">
                <Github className="w-4 h-4 mr-2" />
                <span>Continue with GitHub</span>
              </Button>
            </Link>

            <Link href="/dashboard" className="w-full sm:w-auto">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto font-sans font-medium text-xs sm:text-sm h-10 px-5">
                <span>Open Dashboard</span>
                <ArrowRight className="w-4 h-4 ml-2 text-forest" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Product Explanation: CODE -> CONTEXT -> HISTORY -> UNDERSTANDING */}
      <section className="py-8 sm:py-10 border-b border-border bg-surface dark:bg-[#131915] dark:border-border-dark font-sans">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-6">
            <span className="text-xs uppercase tracking-wider text-text-muted font-medium font-sans">
              The MarrowNode Intelligence Pipeline
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-xs font-sans">
            {/* Step 1 */}
            <div className="p-4 rounded bg-surface-subtle border border-border dark:bg-[#17201B] dark:border-border-dark space-y-1.5 font-sans">
              <div className="text-text-muted text-[11px] font-medium uppercase tracking-wider">Stage 01</div>
              <div className="text-sm font-bold text-text-primary dark:text-white flex items-center justify-between font-sans">
                <span>CODE</span>
                <ArrowRight className="w-3.5 h-3.5 text-border-strong hidden lg:inline" />
              </div>
              <p className="text-xs text-text-secondary leading-snug dark:text-[#959D96] font-sans">
                Reads your code files, symbols, exports, and folder organization.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-4 rounded bg-surface-subtle border border-border dark:bg-[#17201B] dark:border-border-dark space-y-1.5 font-sans">
              <div className="text-forest text-[11px] font-semibold uppercase tracking-wider">Stage 02</div>
              <div className="text-sm font-bold text-text-primary dark:text-white flex items-center justify-between font-sans">
                <span>CONTEXT</span>
                <ArrowRight className="w-3.5 h-3.5 text-border-strong hidden lg:inline" />
              </div>
              <p className="text-xs text-text-secondary leading-snug dark:text-[#959D96] font-sans">
                Mapping service boundaries, middleware interception, and package dependencies.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-4 rounded bg-surface-subtle border border-border dark:bg-[#17201B] dark:border-border-dark space-y-1.5 font-sans">
              <div className="text-copper text-[11px] font-semibold uppercase tracking-wider">Stage 03</div>
              <div className="text-sm font-bold text-text-primary dark:text-white flex items-center justify-between font-sans">
                <span>HISTORY</span>
                <ArrowRight className="w-3.5 h-3.5 text-border-strong hidden lg:inline" />
              </div>
              <p className="text-xs text-text-secondary leading-snug dark:text-[#959D96] font-sans">
                Git commit blame graph, pull request intents, and schema evolution deltas.
              </p>
            </div>

            {/* Step 4 */}
            <div className="p-4 rounded bg-forest/5 border border-forest/30 dark:bg-forest/10 dark:border-forest/40 space-y-1.5 font-sans">
              <div className="text-forest text-[11px] font-semibold uppercase tracking-wider">Stage 04</div>
              <div className="text-sm font-bold text-forest dark:text-[#88B094] font-sans">
                UNDERSTANDING
              </div>
              <p className="text-xs text-text-secondary leading-snug dark:text-[#A7AFA9] font-sans">
                Evidence-backed answers to why software was constructed this way.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Realistic Project Preview */}
      <section className="py-10 sm:py-14 px-4 sm:px-6 bg-ivory/60 dark:bg-[#0E1310] border-b border-border dark:border-border-dark font-sans">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-wider text-text-muted font-medium block mb-0.5">
                Interactive Project Preview
              </span>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-text-primary dark:text-white font-sans break-words">
                marrownode-oss / core-engine
              </h2>
            </div>

            {/* Interactive Preview Switcher Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-surface border border-border rounded text-xs font-sans dark:bg-[#151C17] dark:border-border-dark w-full sm:w-auto max-w-full overflow-x-auto no-scrollbar">
              {[
                { id: 'overview', label: 'Project Understanding' },
                { id: 'intelligence', label: 'Ask MarrowNode' },
                { id: 'architecture', label: 'Project Structure' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActivePreviewTab(t.id as any)}
                  className={`px-3 py-1.5 sm:py-1 rounded transition-colors font-medium whitespace-nowrap shrink-0 ${
                    activePreviewTab === t.id
                      ? 'bg-charcoal text-white dark:bg-forest'
                      : 'text-text-secondary hover:text-text-primary dark:text-[#C6CDC7] dark:hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Preview Window */}
          <div className="bg-surface border border-border rounded shadow-card overflow-hidden dark:bg-[#151C17] dark:border-border-dark font-sans">
            {/* Window Titlebar */}
            <div className="min-h-[36px] py-2 px-3 sm:px-4 border-b border-border bg-surface-subtle flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted dark:bg-[#1A221D] dark:border-border-dark font-sans">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-border-strong inline-block shrink-0" />
                <span className="w-2.5 h-2.5 rounded-full bg-border-strong inline-block shrink-0" />
                <span className="w-2.5 h-2.5 rounded-full bg-border-strong inline-block shrink-0" />
                <span className="ml-1 font-medium text-text-primary dark:text-white font-sans break-words min-w-0">
                  MarrowNode — main branch
                </span>
              </div>
              <Badge variant="success" size="xs" className="font-sans font-medium">
                Analyzed 14m ago · 87% Project Understanding
              </Badge>
            </div>

            {/* Preview Body depending on active preview tab */}
            <div className="p-3 sm:p-6 bg-ivory/30 dark:bg-[#111713] font-sans">
              {activePreviewTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                    <div className="p-3.5 sm:p-4 rounded bg-surface border border-border dark:bg-[#18201B] dark:border-border-dark">
                      <span className="text-[11px] uppercase tracking-wider text-text-muted font-medium">Project Understanding</span>
                      <div className="text-2xl sm:text-3xl font-bold text-text-primary dark:text-white mt-1 font-sans">
                        87%
                      </div>
                      <div className="w-full h-1.5 bg-surface-muted rounded-full mt-2.5 overflow-hidden">
                        <div className="h-full bg-forest w-[87%]" />
                      </div>
                      <span className="text-xs text-text-muted mt-2 block font-sans">
                        142 code files analyzed across this project
                      </span>
                    </div>

                    <div className="p-3.5 sm:p-4 rounded bg-surface border border-border dark:bg-[#18201B] dark:border-border-dark">
                      <span className="text-[11px] uppercase tracking-wider text-text-muted font-medium">Development History</span>
                      <div className="text-2xl sm:text-3xl font-bold text-copper dark:text-[#E69E7B] mt-1 font-sans">
                        91%
                      </div>
                      <div className="w-full h-1.5 bg-surface-muted rounded-full mt-2.5 overflow-hidden">
                        <div className="h-full bg-copper w-[91%]" />
                      </div>
                      <span className="text-xs text-text-muted mt-2 block font-sans">
                        1,420 commits reviewed for recent changes
                      </span>
                    </div>

                    <div className="p-3.5 sm:p-4 rounded bg-surface border border-border dark:bg-[#18201B] dark:border-border-dark">
                      <span className="text-[11px] uppercase tracking-wider text-text-muted font-medium">Project Structure</span>
                      <div className="text-2xl sm:text-3xl font-bold text-forest dark:text-[#9AC6A7] mt-1 font-sans">
                        84%
                      </div>
                      <div className="w-full h-1.5 bg-surface-muted rounded-full mt-2.5 overflow-hidden">
                        <div className="h-full bg-forest w-[84%]" />
                      </div>
                      <span className="text-xs text-text-muted mt-2 block font-sans">
                        7 project areas and 48 file connections
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-surface border border-border rounded flex flex-wrap items-center justify-between gap-2 dark:bg-[#18201B] dark:border-border-dark text-xs font-sans">
                    <span className="text-text-muted">
                      Recent important change: <strong className="text-text-primary dark:text-white font-medium">Security middleware updated</strong>
                    </span>
                    <span className="text-copper dark:text-[#E69E7B] font-mono">commit #142 (David Ross)</span>
                  </div>
                </div>
              )}

              {activePreviewTab === 'intelligence' && (
                <div className="p-3.5 sm:p-4 rounded bg-surface border border-border space-y-3 dark:bg-[#18201B] dark:border-border-dark font-sans">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 dark:border-border-dark">
                    <span className="text-xs sm:text-sm font-semibold text-text-primary dark:text-white font-sans">
                      “How does login and authentication work?”
                    </span>
                    <Badge variant="success" size="xs" className="font-sans font-medium">Confirmed from project</Badge>
                  </div>

                  <p className="text-xs sm:text-sm leading-relaxed text-text-secondary dark:text-[#C6CDC7] font-sans">
                    Login is handled through the authentication service and session checks. Login requests go through the auth route, and protected pages verify the user session automatically.
                  </p>

                  <div className="pt-2 border-t border-border flex flex-wrap gap-2 dark:border-border-dark font-sans items-center">
                    <span className="text-[11px] uppercase tracking-wider text-text-muted font-medium">Found in:</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-subtle border border-border dark:bg-[#141A16] dark:border-border-dark break-all">
                      src/auth/service.ts
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-subtle border border-border dark:bg-[#141A16] dark:border-border-dark break-all">
                      src/middleware.ts
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-subtle border border-border dark:bg-[#141A16] dark:border-border-dark">
                      commit #142
                    </span>
                  </div>
                </div>
              )}

              {activePreviewTab === 'architecture' && (
                <div className="p-3.5 sm:p-4 rounded bg-surface border border-border space-y-3 dark:bg-[#18201B] dark:border-border-dark font-sans">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-sans">
                    {['App Routes', 'UI Components', 'Login & Auth', 'API Endpoints', 'Core Logic', 'Database', 'External Services'].map((node, i) => (
                      <div key={i} className="p-2.5 rounded bg-surface-subtle border border-border dark:bg-[#141A16] dark:border-border-dark">
                        <span className="font-semibold text-text-primary dark:text-white block font-sans">{node}</span>
                        <span className="text-xs text-text-muted font-sans">Connected via imports</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Preview Footer Callout */}
            <div className="p-3 bg-surface-subtle border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs dark:bg-[#1A221D] dark:border-border-dark font-sans">
              <span className="text-text-muted">
                Clear explanations · Backed by your files &amp; commits · Built for developers &amp; students
              </span>
              <Link href="/dashboard" className="text-forest dark:text-[#9AC6A7] hover:underline font-semibold inline-flex items-center gap-1 shrink-0">
                <span>Open Interactive Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION: ABOUT MARROWNODE */}
      {/* ============================================================ */}
      <section id="about" className="py-12 sm:py-16 px-4 sm:px-6 bg-surface dark:bg-[#131915] border-b border-border dark:border-border-dark font-sans">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="space-y-2">
            <span className="text-xs uppercase tracking-wider text-forest font-semibold block font-sans">
              About MarrowNode
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary dark:text-white font-sans">
              About MarrowNode
            </h2>
          </div>

          <p className="text-sm sm:text-base text-text-secondary leading-relaxed dark:text-[#A7AFA9] font-sans">
            MarrowNode helps you open any project and immediately understand what it contains, how its parts connect, what changed recently, and what could be affected by edits. It combines project structure, packages, development history, and real code evidence in one clear place.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded bg-surface-subtle border border-border dark:bg-[#18201B] dark:border-border-dark space-y-1">
              <span className="text-xs font-semibold text-text-primary dark:text-white block font-sans">
                How Files Connect
              </span>
              <p className="text-xs text-text-muted leading-relaxed font-sans">
                Import connections show how files and project areas depend on one another.
              </p>
            </div>

            <div className="p-4 rounded bg-surface-subtle border border-border dark:bg-[#18201B] dark:border-border-dark space-y-1">
              <span className="text-xs font-semibold text-text-primary dark:text-white block font-sans">
                Development History
              </span>
              <p className="text-xs text-text-muted leading-relaxed font-sans">
                Commit diffs, author intent, and pull requests explain why patterns exist.
              </p>
            </div>

            <div className="p-4 rounded bg-surface-subtle border border-border dark:bg-[#18201B] dark:border-border-dark space-y-1">
              <span className="text-xs font-semibold text-text-primary dark:text-white block font-sans">
                Verifiable Evidence
              </span>
              <p className="text-xs text-text-muted leading-relaxed font-sans">
                Every answer points directly to exact file paths, commits, and schema models.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION: FEATURES */}
      {/* ============================================================ */}
      <section id="features" className="py-12 sm:py-16 px-4 sm:px-6 bg-ivory/60 dark:bg-[#0E1310] border-b border-border dark:border-border-dark font-sans">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="max-w-xl space-y-2">
            <span className="text-xs uppercase tracking-wider text-forest font-semibold block font-sans">
              Capabilities
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary dark:text-white font-sans">
              Built to Understand Your Software
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feat, idx) => (
              <div
                key={idx}
                className="p-4 rounded bg-surface border border-border hover:border-forest/60 transition-colors space-y-2 dark:bg-[#161E19] dark:border-border-dark font-sans"
              >
                <div className="p-1.5 rounded bg-surface-subtle border border-border dark:bg-[#141A16] dark:border-border-dark inline-block">
                  {feat.icon}
                </div>
                <h3 className="text-xs sm:text-sm font-semibold text-text-primary dark:text-white font-sans">
                  {feat.title}
                </h3>
                <p className="text-xs text-text-secondary leading-relaxed font-sans dark:text-[#A7AFA9]">
                  {feat.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION: BUILT BY */}
      {/* ============================================================ */}
      <section id="built-by" className="py-10 sm:py-12 px-4 sm:px-6 bg-surface dark:bg-[#131915] border-b border-border dark:border-border-dark font-sans">
        <div className="max-w-4xl mx-auto space-y-2">
          <span className="text-[11px] uppercase tracking-wider text-text-muted font-medium block font-sans">
            Built By
          </span>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary dark:text-white font-sans">
            Rejiesh Ashwanth V
          </h2>
          <p className="text-xs sm:text-sm text-text-secondary dark:text-[#A7AFA9] font-sans">
            Co-Founder of ADYK
          </p>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION: CONTACT US */}
      {/* ============================================================ */}
      <section id="contact" className="py-12 sm:py-16 px-4 sm:px-6 bg-surface dark:bg-[#131915] border-b border-border dark:border-border-dark font-sans">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="space-y-2">
            <span className="text-xs uppercase tracking-wider text-forest font-semibold block font-sans">
              Get in Touch
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary dark:text-white font-sans">
              Contact Us
            </h2>
            <p className="text-sm text-text-secondary dark:text-[#A7AFA9] font-sans">
              Have a question, idea, or want to learn more about MarrowNode? Get in touch.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {/* Email Card */}
            <a
              href="mailto:rejieshashwanth30@gmail.com"
              className="p-4 rounded bg-surface-subtle border border-border hover:border-forest hover:bg-forest/5 transition-all space-y-2 dark:bg-[#18201B] dark:border-border-dark dark:hover:bg-[#1D2721] group block font-sans"
            >
              <div className="flex items-center justify-between text-text-muted group-hover:text-forest transition-colors">
                <span className="text-xs font-semibold uppercase tracking-wider font-sans">Email</span>
                <Mail className="w-4 h-4" />
              </div>
              <div className="text-xs sm:text-sm font-semibold text-text-primary dark:text-white break-all font-sans">
                rejieshashwanth30@gmail.com
              </div>
              <p className="text-xs text-text-muted font-sans">
                Send an email directly to the project team.
              </p>
            </a>

            {/* X (Twitter) Card */}
            <a
              href="https://x.com/rejieshashhh"
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded bg-surface-subtle border border-border hover:border-forest hover:bg-forest/5 transition-all space-y-2 dark:bg-[#18201B] dark:border-border-dark dark:hover:bg-[#1D2721] group block font-sans"
            >
              <div className="flex items-center justify-between text-text-muted group-hover:text-forest transition-colors">
                <span className="text-xs font-semibold uppercase tracking-wider font-sans">X</span>
                <ExternalLink className="w-4 h-4" />
              </div>
              <div className="text-xs sm:text-sm font-semibold text-text-primary dark:text-white font-sans">
                @rejieshashhh
              </div>
              <p className="text-xs text-text-muted font-sans">
                Follow updates and discuss codebase intelligence on X.
              </p>
            </a>

            {/* LinkedIn Card */}
            <a
              href="http://www.linkedin.com/in/rejiesh-ashwanth-v-33ab1b37b"
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded bg-surface-subtle border border-border hover:border-forest hover:bg-forest/5 transition-all space-y-2 dark:bg-[#18201B] dark:border-border-dark dark:hover:bg-[#1D2721] group block font-sans"
            >
              <div className="flex items-center justify-between text-text-muted group-hover:text-forest transition-colors">
                <span className="text-xs font-semibold uppercase tracking-wider font-sans">LinkedIn</span>
                <ExternalLink className="w-4 h-4" />
              </div>
              <div className="text-xs sm:text-sm font-semibold text-text-primary dark:text-white font-sans truncate">
                Rejiesh Ashwanth V
              </div>
              <p className="text-xs text-text-muted font-sans">
                Connect professionally on LinkedIn.
              </p>
            </a>
          </div>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="mt-auto py-8 px-4 sm:px-6 border-t border-border bg-surface dark:bg-[#101512] dark:border-border-dark text-xs font-sans text-text-muted">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 font-sans">
          <div className="flex items-center gap-3">
            <MarrowNodeLogo variant="mark" size="sm" />
            <div>
              <span className="font-semibold text-text-primary dark:text-white">MarrowNode</span>
              <span className="text-text-subtle ml-2 hidden sm:inline">— The Memory Layer for Software.</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <button
              onClick={() => scrollToSection('about')}
              className="hover:text-text-primary transition-colors dark:hover:text-white"
            >
              About
            </button>
            <button
              onClick={() => scrollToSection('features')}
              className="hover:text-text-primary transition-colors dark:hover:text-white"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('contact')}
              className="hover:text-text-primary transition-colors dark:hover:text-white"
            >
              Contact
            </button>
            <span className="text-border-strong">·</span>
            <a
              href="https://x.com/rejieshashhh"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text-primary transition-colors dark:hover:text-white"
            >
              X
            </a>
            <a
              href="http://www.linkedin.com/in/rejiesh-ashwanth-v-33ab1b37b"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text-primary transition-colors dark:hover:text-white"
            >
              LinkedIn
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
