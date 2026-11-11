'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  GitPullRequest,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  KeyRound,
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

  // PR Check & Webhook settings state
  const [prChecksEnabled, setPrChecksEnabled] = useState(false);
  const [prCheckAutoPublish, setPrCheckAutoPublish] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [maskedSecret, setMaskedSecret] = useState<string | null>(null);
  const [plaintextSecretOnce, setPlaintextSecretOnce] = useState<string | null>(null);
  const [isLoadingPrSettings, setIsLoadingPrSettings] = useState(false);
  const [isSavingPrSettings, setIsSavingPrSettings] = useState(false);
  const [prSettingsError, setPrSettingsError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'url' | 'secret' | null>(null);

  const loadPrSettings = useCallback(async () => {
    if (!project?.id) return;
    setIsLoadingPrSettings(true);
    setPrSettingsError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}/settings`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load PR Check settings.');
      }
      if (data.settings) {
        setPrChecksEnabled(Boolean(data.settings.prChecksEnabled));
        setPrCheckAutoPublish(Boolean(data.settings.prCheckAutoPublish));
        setWebhookUrl(data.settings.webhookUrl || '');
        setMaskedSecret(data.settings.maskedWebhookSecret || null);
      }
    } catch (err: any) {
      setPrSettingsError(err?.message || 'Unable to load webhook configuration.');
    } finally {
      setIsLoadingPrSettings(false);
    }
  }, [project?.id]);

  useEffect(() => {
    setPlaintextSecretOnce(null);
    if (project?.id) {
      loadPrSettings();
    }
  }, [project?.id, loadPrSettings]);

  const patchPrSettings = async (payload: {
    prChecksEnabled?: boolean;
    prCheckAutoPublish?: boolean;
    rotateWebhookSecret?: boolean;
  }) => {
    if (!project?.id) return;
    setIsSavingPrSettings(true);
    setPrSettingsError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save PR Check settings.');
      }
      if (data.settings) {
        setPrChecksEnabled(Boolean(data.settings.prChecksEnabled));
        setPrCheckAutoPublish(Boolean(data.settings.prCheckAutoPublish));
        setWebhookUrl(data.settings.webhookUrl || '');
        setMaskedSecret(data.settings.maskedWebhookSecret || null);
      }
      if (data.plaintextSecretOnce) {
        setPlaintextSecretOnce(data.plaintextSecretOnce);
      }
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    } catch (err: any) {
      setPrSettingsError(err?.message || 'Unable to update settings.');
    } finally {
      setIsSavingPrSettings(false);
    }
  };

  const handleCopy = async (field: 'url' | 'secret', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      // ignore clipboard errors cleanly
    }
  };

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
      <div className="px-3 sm:px-4 py-2 border-b border-border bg-surface-subtle/50 flex items-center gap-2 overflow-x-auto no-scrollbar text-xs font-sans dark:bg-[#151C17] dark:border-border-dark">
        {[
          { id: 'general', label: 'General' },
          { id: 'analysis', label: 'Analysis' },
          { id: 'github', label: 'GitHub & PR Check' },
          { id: 'appearance', label: 'Appearance' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3 py-1 rounded whitespace-nowrap shrink-0 transition-colors font-medium ${
              activeTab === tab.id
                ? 'bg-charcoal text-white dark:bg-forest'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted dark:text-[#C6CDC7] dark:hover:bg-[#1F2822] dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <CardContent className="p-3.5 sm:p-6 space-y-6">
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
                placeholder="my-project"
                className="w-full h-9 px-3 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#1A221D] dark:border-[#324237] dark:text-[#F2F4F0] dark:placeholder:text-[#98A49A]"
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
                placeholder="Describe what this project does."
                className="w-full p-3 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#1A221D] dark:border-[#324237] dark:text-[#F2F4F0] dark:placeholder:text-[#98A49A]"
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
                className="w-full h-9 px-3 bg-surface border border-border rounded text-xs font-sans text-text-primary dark:bg-[#1A221D] dark:border-[#324237] dark:text-[#F2F4F0]"
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
              MarrowNode analyzes your project files, how they connect, and your recent commit history so you can explore your codebase clearly.
            </p>
            <div className="p-3 bg-surface-subtle border border-border rounded space-y-2 dark:bg-[#151C17] dark:border-border-dark">
              <div className="font-semibold text-text-primary dark:text-white">How MarrowNode analyzes your project</div>
              <ul className="list-disc pl-4 space-y-1 text-xs">
                <li>Reads code files and finds how they connect to each other</li>
                <li>Reviews recent Git commits to track what changed over time</li>
                <li>Grounds every answer in real files, commits, and packages</li>
              </ul>
            </div>
          </div>
        )}

        {/* Tab 3: GitHub & PR Check Webhooks */}
        {activeTab === 'github' && (
          <div className="space-y-5 max-w-2xl text-xs font-sans">
            <div className="flex items-center gap-3 p-3 bg-surface-subtle border border-border rounded dark:bg-[#151C17] dark:border-border-dark">
              <Github className="w-5 h-5 text-text-primary dark:text-white shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-text-primary dark:text-white">GitHub Integration</div>
                <div className="text-text-muted text-xs">
                  Authenticated repository access via Supabase OAuth
                </div>
              </div>
            </div>

            {project?.id ? (
              <div className="p-4 rounded-lg border border-border bg-surface-subtle/60 dark:bg-[#151C17] dark:border-border-dark space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <GitPullRequest className="w-4 h-4 text-forest" />
                    <span className="text-sm font-medium text-text-primary dark:text-white">
                      Automated GitHub PR Checks
                    </span>
                  </div>
                  <Badge variant={prChecksEnabled ? 'success' : 'neutral'} size="xs">
                    {prChecksEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>

                <p className="text-xs text-text-secondary">
                  Evaluate incoming GitHub Pull Requests against your repository dependency graph whenever a PR opens or updates.
                </p>

                {prSettingsError && (
                  <div className="p-2.5 rounded border border-copper/40 bg-copper/5 text-copper flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span className="break-words">{prSettingsError}</span>
                  </div>
                )}

                {/* Toggles */}
                <div className="space-y-3 pt-1">
                  <label className="flex items-start justify-between gap-3 p-3 rounded border border-border bg-surface dark:bg-[#1A221D] cursor-pointer">
                    <div className="min-w-0">
                      <span className="font-medium text-text-primary dark:text-white block">
                        Enable Webhook PR Checks
                      </span>
                      <span className="text-[11px] text-text-muted">
                        Verify HMAC-signed GitHub pull_request webhooks and persist PR impact reports automatically.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={prChecksEnabled}
                      disabled={isLoadingPrSettings || isSavingPrSettings}
                      onChange={(e) => patchPrSettings({ prChecksEnabled: e.target.checked })}
                      className="mt-1 h-4 w-4 accent-forest shrink-0"
                    />
                  </label>

                  <label className="flex items-start justify-between gap-3 p-3 rounded border border-border bg-surface dark:bg-[#1A221D] cursor-pointer">
                    <div className="min-w-0">
                      <span className="font-medium text-text-primary dark:text-white block">
                        Publish Compact Commit Status to GitHub
                      </span>
                      <span className="text-[11px] text-text-muted">
                        Posts a concise commit status linking to the MarrowNode PR report when your OAuth token permits status writes.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={prCheckAutoPublish}
                      disabled={isLoadingPrSettings || isSavingPrSettings}
                      onChange={(e) => patchPrSettings({ prCheckAutoPublish: e.target.checked })}
                      className="mt-1 h-4 w-4 accent-forest shrink-0"
                    />
                  </label>
                </div>

                {/* Webhook Endpoint & Secret Management */}
                {webhookUrl && (
                  <div className="space-y-3 pt-2 border-t border-border/70">
                    <div>
                      <label className="block text-[11px] font-medium text-text-secondary mb-1">
                        GitHub Webhook Payload URL
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={webhookUrl}
                          className="flex-1 min-w-0 px-2.5 py-1.5 rounded border border-border bg-surface font-mono text-[11px] text-text-primary dark:bg-[#1A221D]"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleCopy('url', webhookUrl)}
                        >
                          {copiedField === 'url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="text-[11px] font-medium text-text-secondary">
                          Webhook Secret (HMAC-SHA256)
                        </label>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isSavingPrSettings}
                          onClick={() => patchPrSettings({ rotateWebhookSecret: true })}
                        >
                          <KeyRound className="w-3 h-3 mr-1" />
                          {maskedSecret ? 'Rotate Secret' : 'Generate Secret'}
                        </Button>
                      </div>

                      {maskedSecret ? (
                        <div className="text-[11px] font-mono text-text-muted">
                          Configured secret: <span className="text-text-primary">{maskedSecret}</span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-text-muted">
                          No project webhook secret generated yet. Enable PR Checks or click Generate Secret.
                        </div>
                      )}

                      {plaintextSecretOnce && (
                        <div className="mt-2 p-3 rounded border border-forest/40 bg-forest/10 space-y-1.5">
                          <div className="text-[11px] font-semibold text-forest">
                            Copy this webhook secret now — it will not be shown again:
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 min-w-0 font-mono text-[11px] text-text-primary break-all">
                              {plaintextSecretOnce}
                            </code>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleCopy('secret', plaintextSecretOnce)}
                            >
                              {copiedField === 'secret' ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="text-[11px] text-text-muted space-y-1 pt-1">
                      <div className="font-medium text-text-secondary">GitHub Repository Setup:</div>
                      <p>
                        Repo Settings → Webhooks → Add webhook → Content type: <code>application/json</code> → Secret above → Let me select individual events → <strong>Pull requests</strong>.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-text-muted">
                Connect or select a project to configure GitHub PR Check webhooks.
              </p>
            )}
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
                      ? 'bg-surface border-forest text-forest shadow-subtle dark:bg-[#1C2720] dark:border-[#9AC6A7] dark:text-[#9AC6A7] font-medium'
                      : 'bg-surface text-text-secondary border-border hover:border-border-strong hover:text-text-primary dark:bg-[#151C17] dark:border-[#2C3930] dark:text-[#C6CDC7] dark:hover:text-white'
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
