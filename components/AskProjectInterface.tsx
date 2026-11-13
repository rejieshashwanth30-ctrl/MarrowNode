'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Terminal,
  ShieldCheck,
  HelpCircle,
  Search,
  Sparkles,
  Send,
  FileCode,
  CheckCircle2,
  AlertCircle,
  GitCommit,
  ExternalLink,
  Loader2,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';

interface AskProjectInterfaceProps {
  projectId?: string;
  hasAnalyzedProject?: boolean;
  hasProject?: boolean;
  isAnalyzing?: boolean;
  onInspectFile?: (filePath: string) => void;
  onConnectRepo?: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  fact?: string | null;
  inference?: string | null;
  unknown?: string | null;
  citations?: Array<{ path: string; label: string; type: string }>;
  confidence?: 'High' | 'Medium' | 'Low';
  timestamp: string;
  isError?: boolean;
  canRetry?: boolean;
  failedQuery?: string;
}

const SUGGESTED_QUERIES = [
  'How does login and authentication work?',
  'What database does this project use?',
  'What external packages does this project use?',
  'What changed recently in this project?',
];

export function AskProjectInterface({
  projectId,
  hasAnalyzedProject = false,
  hasProject = false,
  isAnalyzing = false,
  onInspectFile,
  onConnectRepo,
}: AskProjectInterfaceProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Reset conversation state cleanly when switching projects or logging out
  React.useEffect(() => {
    setMessages([]);
    setQuery('');
    setLoading(false);
  }, [projectId]);

  const handleAsk = async (questionToAsk?: string) => {
    const q = (questionToAsk || query).trim();
    if (!q || !projectId || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // Body was non-JSON (e.g. gateway timeout HTML)
      }

      if (!res.ok) {
        let errorMsg = data?.error;
        if (!errorMsg) {
          if (res.status === 401) {
            errorMsg = 'GitHub or MarrowNode authentication expired. Please sign in or reconnect GitHub.';
          } else if (res.status === 404) {
            errorMsg = 'Project analysis not found. Please select or analyze a repository first.';
          } else if (res.status === 504 || res.status === 408) {
            errorMsg = 'Request timed out while analyzing repository evidence. Please tap Retry.';
          } else {
            errorMsg = `Server error (${res.status}). Please tap Retry to try again.`;
          }
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: errorMsg,
            isError: true,
            canRetry: true,
            failedQuery: q,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } else {
        const r = data.result;
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: r.answer,
            fact: r.fact,
            inference: r.inference,
            unknown: r.unknown,
            citations: r.citations,
            confidence: r.confidence,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        // Only clear user query on successful answer retrieval
        setQuery('');
      }
    } catch (err: any) {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      const errorMsg = isOffline
        ? 'No internet connection detected. Please check your network and tap Retry.'
        : 'Unable to reach MarrowNode right now. Please check your connection or tap Retry.';

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: errorMsg,
          isError: true,
          canRetry: true,
          failedQuery: q,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (isAnalyzing) {
    return (
      <Card className="h-full flex flex-col overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-forest dark:text-[#88B094]" />
              <CardTitle>Ask MarrowNode</CardTitle>
            </div>
            <Badge variant="neutral" size="xs" className="font-sans font-medium">
              Based on your project
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex-1 flex flex-col items-center justify-center text-center space-y-4 min-h-[460px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094] animate-spin">
            <Terminal className="w-6 h-6" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="text-base sm:text-lg font-bold text-text-primary dark:text-white">
              Reading your project…
            </h3>
            <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
              MarrowNode is analyzing your files, packages, and history. You can ask questions as soon as this finishes.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasAnalyzedProject) {
    return (
      <Card className="h-full flex flex-col overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-forest dark:text-[#88B094]" />
              <CardTitle>Ask MarrowNode</CardTitle>
            </div>
            <Badge variant="neutral" size="xs" className="font-sans font-medium">
              Based on your project
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex-1 flex flex-col items-center justify-center text-center space-y-4 min-h-[460px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094]">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="text-base sm:text-lg font-bold text-text-primary dark:text-white">
              {hasProject
                ? 'Analyze your project to start asking questions.'
                : 'Choose a repository to ask questions about your project.'}
            </h3>
            <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
              Ask questions about your project using the files, packages, structure, and development history MarrowNode analyzed.
            </p>
          </div>

          {!hasProject && (
            <div className="w-full max-w-sm pt-2">
              <Button
                variant="primary"
                size="md"
                onClick={onConnectRepo}
                className="w-full text-xs font-sans font-medium"
              >
                Choose repository
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col overflow-hidden font-sans">
      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D] p-3 sm:p-4 border-b border-border dark:border-border-dark">
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <div className="flex items-center gap-2 min-w-0">
            <Terminal className="w-4 h-4 text-forest dark:text-[#9AC6A7] shrink-0" />
            <CardTitle>Ask MarrowNode</CardTitle>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-text-muted font-sans hidden sm:inline">
              Answer based on analyzed project data
            </span>
            <Badge variant="success" size="xs" className="font-sans font-medium">
              Based on your project
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-5 flex-1 flex flex-col justify-between min-h-[340px] sm:min-h-[460px]">
        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto space-y-3 sm:space-y-4 mb-3 sm:mb-4 pr-0.5 min-w-0">
          {messages.length === 0 ? (
            <div className="py-3 sm:py-6 text-center space-y-3 sm:space-y-4 max-w-lg mx-auto">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest mx-auto dark:text-[#9AC6A7]">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
                  Ask questions about your project
                </h4>
                <p className="text-xs text-text-muted leading-relaxed max-w-sm mx-auto">
                  Ask about files, packages, structure, or history. Answers cite real files in your codebase.
                </p>
              </div>

              {/* Suggested Questions */}
              <div className="pt-2 text-left space-y-2 max-w-lg mx-auto w-full">
                <div className="text-[10px] tracking-wider uppercase font-semibold text-text-muted px-0.5">
                  Try asking
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SUGGESTED_QUERIES.map((sq) => (
                    <button
                      key={sq}
                      type="button"
                      onClick={() => handleAsk(sq)}
                      className="w-full min-h-[44px] h-auto px-3.5 py-2.5 text-left text-xs leading-snug rounded-xl border border-border bg-surface hover:bg-surface-subtle text-text-primary dark:bg-[#1B251E] dark:border-[#324237] dark:text-[#EEF2ED] dark:hover:bg-[#233028] transition-colors font-medium flex items-center justify-between group shadow-2xs cursor-pointer active:scale-[0.99]"
                    >
                      <span className="truncate pr-2">{sq}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-text-muted group-hover:text-forest dark:group-hover:text-[#9AC6A7] transition-colors shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col min-w-0 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="text-[11px] text-text-muted mb-1 px-1">
                  {msg.role === 'user' ? 'You' : 'MarrowNode'} • {msg.timestamp}
                </div>

                {msg.role === 'user' ? (
                  <div className="max-w-[88%] sm:max-w-xl p-3 sm:p-3.5 rounded-2xl rounded-tr-xs bg-forest text-white dark:bg-forest text-xs sm:text-[13px] leading-relaxed font-sans break-words shadow-2xs">
                    {msg.content}
                  </div>
                ) : msg.isError ? (
                  /* Error Card */
                  <div className="max-w-full sm:max-w-2xl w-full p-3.5 sm:p-4 rounded-2xl rounded-tl-xs bg-copper/5 dark:bg-[#231815] border border-copper/30 dark:border-copper/40 space-y-2.5 text-xs sm:text-[13px] leading-relaxed font-sans min-w-0 break-words shadow-2xs">
                    <div className="flex items-center gap-2 text-copper dark:text-[#E69E7B] font-semibold text-xs">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span className="uppercase tracking-wider text-[10px]">Unable to reach MarrowNode</span>
                    </div>
                    <div className="text-text-primary dark:text-[#F2F4F0] leading-relaxed">
                      {msg.content}
                    </div>
                    {msg.canRetry && msg.failedQuery && (
                      <div className="pt-1.5 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAsk(msg.failedQuery)}
                          disabled={loading}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-subtle border border-border dark:bg-[#1E2721] dark:border-[#324237] text-text-primary dark:text-[#EEF2ED] transition-colors cursor-pointer active:scale-95"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-forest dark:text-[#9AC6A7]" />
                          <span>Retry</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Normal Grounded Answer Card */
                  <div className="max-w-full sm:max-w-2xl w-full p-3.5 sm:p-4 rounded-2xl rounded-tl-xs bg-surface-subtle dark:bg-[#18201B] border border-border dark:border-[#2E3C33] space-y-2.5 sm:space-y-3 text-xs sm:text-[13px] leading-relaxed font-sans min-w-0 break-words shadow-2xs">
                    {msg.fact && (
                      <div className="p-2.5 rounded-lg bg-forest/10 border border-forest/20 text-text-primary dark:text-[#F2F4F0] space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-forest dark:text-[#9AC6A7]">
                          CONFIRMED FROM YOUR PROJECT
                        </div>
                        <div className="whitespace-pre-line break-words leading-relaxed">{msg.fact}</div>
                      </div>
                    )}

                    {msg.inference && (
                      <div className="p-2.5 rounded-lg bg-copper/10 border border-copper/20 text-text-primary dark:text-[#F2F4F0] space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-copper dark:text-[#E69E7B]">
                          BASED ON PROJECT STRUCTURE
                        </div>
                        <div className="break-words leading-relaxed">{msg.inference}</div>
                      </div>
                    )}

                    {msg.unknown && (
                      <div className="p-2.5 rounded-lg bg-surface border border-border dark:bg-[#131915] dark:border-[#2C3930] text-text-secondary dark:text-[#C6CDC7] space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                          NOT FOUND IN THE PROJECT
                        </div>
                        <div className="break-words leading-relaxed">{msg.unknown}</div>
                      </div>
                    )}

                    {/* Fallback plain content if no structured sections */}
                    {!msg.fact && !msg.inference && !msg.unknown && (
                      <div className="text-text-primary dark:text-[#F2F4F0] break-words leading-relaxed">{msg.content}</div>
                    )}

                    {/* Citations */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="pt-2 border-t border-border dark:border-[#2C3930] space-y-1.5">
                        <div className="text-[10px] uppercase font-semibold text-text-muted">
                          Found in ({msg.citations.length})
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.citations.map((c, i) => (
                            <span
                              key={i}
                              onClick={() => onInspectFile && onInspectFile(c.path)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-surface border border-border dark:bg-[#1E2721] dark:border-[#324237] text-forest dark:text-[#9AC6A7] cursor-pointer hover:underline max-w-full break-all"
                            >
                              <FileCode className="w-3 h-3 shrink-0" />
                              <span className="truncate">{c.label}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          {loading && (
            <div className="flex items-center gap-2.5 text-xs text-text-muted p-3 rounded-xl bg-surface-subtle dark:bg-[#1A221D] border border-border dark:border-[#324237]">
              <Loader2 className="w-4 h-4 text-forest dark:text-[#9AC6A7] animate-spin shrink-0" />
              <span>Thinking… searching your project evidence</span>
            </div>
          )}
        </div>

        {/* Input Bar — Mobile-optimized 48px touch target, 16px font to prevent iOS zoom */}
        <div className="border-t border-border pt-3 pb-1 sm:pt-4 sm:pb-0 dark:border-[#2C3930]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="flex flex-row items-center gap-2 sm:gap-2.5"
          >
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about files, packages, or history…"
                aria-label="Ask a question about your project"
                disabled={loading}
                className="w-full h-12 px-4 rounded-xl text-base sm:text-sm font-sans bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-forest focus:border-forest dark:bg-[#1A221D] dark:border-[#324237] dark:text-[#F2F4F0] dark:placeholder:text-[#98A49A] transition-all shadow-2xs"
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              disabled={!query.trim() || loading}
              className="h-12 px-4 sm:px-6 rounded-xl text-sm font-sans font-medium gap-2 shrink-0 bg-forest hover:bg-forest/90 text-white dark:bg-forest dark:hover:bg-forest/90 border border-forest/20 shadow-sm active:scale-[0.98] transition-all flex items-center justify-center min-w-[72px] sm:min-w-[88px]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <>
                  <Send className="w-4 h-4 shrink-0" />
                  <span>Ask</span>
                </>
              )}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
