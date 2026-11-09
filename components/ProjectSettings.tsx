'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useTheme } from '@/components/ThemeProvider';
import {
  Settings,
  Github,
  Sun,
  Moon,
  Laptop,
  CheckCircle2,
  Save,
} from 'lucide-react';

interface ProjectSettingsProps {
  project?: {
    id: string;
    name: string;
    description?: string | null;
    defaultBranch?: string;
    visibility?: string;
  } | null;
}

export function ProjectSettings({ project }: ProjectSettingsProps) {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'general' | 'analysis' | 'github' | 'appearance'>('general');
  const [savedNotice, setSavedNotice] = useState(false);
  const [projectName, setProjectName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [branch, setBranch] = useState(project?.defaultBranch || 'main');

  const handleSave = () => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <Card className="overflow-hidden font-sans">
      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <CardTitle>Project Configuration & Settings</CardTitle>
          </div>
          {savedNotice && (
            <Badge variant="success" size="sm" className="gap-1 font-sans font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Settings Saved
            </Badge>
          )}
        </div>
      </CardHeader>

      {/* Tabs */}
      <div className="px-4 py-2 border-b border-border bg-surface-subtle/50 flex items-center gap-2 overflow-x-auto text-xs font-sans dark:bg-[#151C17] dark:border-border-dark">
        {[
          { id: 'general', label: 'General' },
          { id: 'analysis', label: 'Analysis' },
          { id: 'github', label: 'GitHub Connection' },
          { id: 'appearance', label: 'Appearance' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3 py-1 rounded transition-colors font-medium ${
              activeTab === tab.id
                ? 'bg-charcoal text-white dark:bg-forest'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted dark:text-[#A7AFA9] dark:hover:bg-[#1F2822]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Tab 1: General */}
        {activeTab === 'general' && (
          <div className="space-y-4 max-w-xl font-sans">
            <div>
              <label className="text-xs font-medium text-text-primary dark:text-white block mb-1.5 font-sans">
                Project Name
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="marrownode-workspace"
                className="w-full h-9 px-3 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#151C17] dark:border-border-dark dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-text-primary dark:text-white block mb-1.5 font-sans">
                Description
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Software intelligence and project context layer."
                className="w-full p-3 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#151C17] dark:border-border-dark dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-text-primary dark:text-white block mb-1.5 font-sans">
                Default Branch
              </label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full h-9 px-3 bg-surface border border-border rounded text-xs font-sans text-text-primary dark:bg-[#151C17] dark:border-border-dark dark:text-white"
              />
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              className="text-xs font-sans font-medium"
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              Save Configuration
            </Button>
          </div>
        )}

        {/* Tab 2: Analysis */}
        {activeTab === 'analysis' && (
          <div className="space-y-4 max-w-xl text-xs font-sans text-text-secondary dark:text-[#A7AFA9]">
            <p>
              MarrowNode statically indexes source files, AST symbol tables, and commit history into Neon PostgreSQL to preserve codebase context.
            </p>
            <div className="p-3 bg-surface-subtle border border-border rounded space-y-2 dark:bg-[#151C17] dark:border-border-dark">
              <div className="font-semibold text-text-primary dark:text-white">Analysis Pipeline</div>
              <ul className="list-disc pl-4 space-y-1 text-xs">
                <li>Deterministic AST export mapping</li>
                <li>Git blame and commit intent indexing</li>
                <li>Zero AI hallucinations; evidence-backed only</li>
              </ul>
            </div>
          </div>
        )}

        {/* Tab 3: GitHub */}
        {activeTab === 'github' && (
          <div className="space-y-4 max-w-xl text-xs font-sans">
            <div className="flex items-center gap-3 p-3 bg-surface-subtle border border-border rounded dark:bg-[#151C17] dark:border-border-dark">
              <Github className="w-5 h-5 text-text-primary dark:text-white" />
              <div>
                <div className="font-semibold text-text-primary dark:text-white">GitHub Integration</div>
                <div className="text-text-muted text-xs">Read-only repository access via Supabase OAuth</div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Appearance */}
        {activeTab === 'appearance' && (
          <div className="space-y-4 max-w-xl font-sans">
            <label className="text-xs font-medium text-text-primary dark:text-white block font-sans">
              Theme Mode
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'light', label: 'Light', icon: <Sun className="w-4 h-4" /> },
                { id: 'dark', label: 'Dark', icon: <Moon className="w-4 h-4" /> },
                { id: 'system', label: 'System', icon: <Laptop className="w-4 h-4" /> },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setTheme(m.id as any)}
                  className={`p-3 rounded border text-xs font-sans flex flex-col items-center gap-2 transition-all ${
                    theme === m.id
                      ? 'bg-surface border-forest text-forest shadow-subtle dark:border-[#88B094] dark:text-[#88B094] font-medium'
                      : 'bg-surface text-text-muted border-border hover:border-border-strong hover:text-text-primary dark:bg-[#151C17] dark:border-border-dark'
                  }`}
                >
                  {m.icon}
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
