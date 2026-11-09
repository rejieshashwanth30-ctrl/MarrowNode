# MarrowNode — The Memory Layer for Software

> **Developer project memory and codebase intelligence platform.**  
> Understand your codebase, trace how it evolved, and uncover the context behind the software you build.

---

## Overview

MarrowNode provides deterministic, evidence-backed project intelligence for serious engineering teams. This frontend implementation is built as a production-grade developer workstation following editorial precision and restrained visual design principles.

### Key Philosophy
- **Serious Engineering Tooling**: No glowing neon, no floating sci-fi blobs, no "AI magic" decorations.
- **Evidence-Oriented**: Every insight cites verified file paths, commit hashes, PRs, or architecture relationships.
- **AST & Blame Depth**: Context coverage represents static symbol analysis and commit history depth, not arbitrary probabilistic scores.

---

## Visual Design System

- **Warm Ivory Background**: `#F5F4EF` (Dark: `#0E1310`)
- **Deep Forest Charcoal**: `#17201B`
- **White Surface**: `#FFFFFF` (Dark: `#151C17`)
- **Soft Neutral**: `#ECEBE5` (Dark: `#1F2822`)
- **Muted Forest Green** *(Primary Functional Accent)*: `#56735F`
- **Restrained Copper** *(Secondary Highlights)*: `#B56B45`
- **Border**: `#D9DAD4` (Dark: `#28352D`)
- **Primary Text**: `#171918` (Dark: `#F2F3EE`)
- **Muted Text**: `#6F746F` (Dark: `#959D96`)

---

## Application Structure

```text
├── app/
│   ├── layout.tsx             # Root layout with ThemeProvider and font tokens
│   ├── page.tsx               # Public compact landing page (hero, pipeline, preview, capabilities)
│   ├── auth/page.tsx          # Authentication (Sign In, Sign Up, Forgot Password, GitHub OAuth)
│   ├── onboarding/page.tsx    # 3-step onboarding (Authorize, Select Repo, Indexing progress)
│   └── dashboard/page.tsx     # Full developer workstation shell with 8 interactive views
├── components/
│   ├── MarrowNodeLogo.tsx     # Official brand logo renderer (full, mark, light, dark)
│   ├── Topbar.tsx             # Breadcrumbs, Cmd+K search trigger, theme switcher
│   ├── Sidebar.tsx            # Left workstation navigation & user profile
│   ├── MobileNavigation.tsx   # Mobile drawer & persistent bottom navigation bar
│   ├── ProjectHeader.tsx      # Repository metadata bar & re-index trigger
│   ├── ContextCoverageWidget.tsx # 87% coverage breakdown with metric meters
│   ├── ProjectIntelligencePanel.tsx # Central Q&A with suggested investigations & evidence
│   ├── ArchitectureGraph.tsx  # SVG topology graph with 7 layers & Node Inspector
│   ├── ProjectTimeline.tsx    # Git memory milestone timeline with author blame
│   ├── ChangeImpactAnalysis.tsx # Change blast-radius predictor (Direct, Potential, Dependencies)
│   ├── EvidenceExplorer.tsx   # Provenance browser across Files, Commits, PRs, Docs
│   ├── RepositoryExplorer.tsx # File tree, metadata inspector, and syntax viewer
│   ├── AskProjectInterface.tsx# 3-column full-page investigation dialogue
│   ├── ProjectSettings.tsx    # General, Analysis, GitHub, and Appearance preferences
│   ├── ThemeProvider.tsx      # Light (default), Dark, and System theme management
│   └── ui/                    # Atomic primitives (Badge, Button, Card, CommandPalette, EvidenceBadge)
├── lib/
│   ├── mockService.ts         # Centralized mock service layer ready for backend API replacement
│   └── utils.ts               # Formatting and class merging helpers
├── mock/
│   └── data.ts                # Structured mock models for adyk-platform repository
└── types/
    └── index.ts               # TypeScript interfaces for projects, AST nodes, commits, evidence
```

---

## Running the Application

### 1. Development Mode
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Production Build
```bash
npm run build
npm run start
```

---

## Keyboard Shortcuts
- `⌘K` or `Ctrl+K`: Open Command Palette to search files, AST symbols, commits, and views.
- `ESC`: Dismiss Command Palette or mobile navigation drawer.

---

## Backend Integration Readiness
All data fetching routes through `lib/mockService.ts` utilizing contracts defined in `types/index.ts`. When the MarrowNode backend engine (GitHub OAuth, PostgreSQL, indexing worker, and AI context provider) is deployed, swap the static resolver methods in `MarrowNodeMockService` with `fetch()` calls to the API gateway.

