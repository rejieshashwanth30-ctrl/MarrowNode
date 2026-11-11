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
    setQuery('');
    setLoading(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: data.error || 'Unable to retrieve answer for this query.',
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
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: 'Unable to reach MarrowNode right now. Please try again.',
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
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <CardTitle>Ask MarrowNode</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-muted font-sans hidden sm:inline">
              Answer based on analyzed project data
            </span>
            <Badge variant="success" size="xs" className="font-sans font-medium">
              Based on your project
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 flex-1 flex flex-col justify-between min-h-[500px]">
        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
          {messages.length === 0 ? (
            <div className="py-8 text-center space-y-4 max-w-lg mx-auto">
              <div className="w-10 h-10 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest mx-auto dark:text-[#88B094]">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-text-primary dark:text-white">
                  Ask questions about your project
                </h4>
                <p className="text-xs text-text-muted leading-relaxed">
                  Ask about your files, packages, project structure, or development history. Every answer clearly shows what was found directly in your code and what files support it.
                </p>
              </div>

              {/* Suggested Questions */}
              <div className="pt-2 text-left space-y-1.5">
                <div className="text-[11px] uppercase font-semibold text-text-muted">
                  Try asking
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SUGGESTED_QUERIES.map((sq) => (
                    <button
                      key={sq}
                      type="button"
                      onClick={() => handleAsk(sq)}
                      className="p-2.5 text-left text-xs rounded border border-border dark:border-border-dark bg-surface-subtle/50 hover:bg-surface-subtle dark:hover:bg-[#1A221D] text-text-secondary hover:text-text-primary dark:text-[#A7AFA9] dark:hover:text-white transition-colors"
                    >
                      {sq}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="text-[10px] text-text-muted mb-1 px-1">
                  {msg.role === 'user' ? 'You' : 'MarrowNode'} • {msg.timestamp}
                </div>

                {msg.role === 'user' ? (
                  <div className="max-w-xl p-3 rounded-lg bg-charcoal text-white dark:bg-forest text-xs leading-relaxed font-sans">
                    {msg.content}
                  </div>
                ) : (
                  <div className="max-w-2xl w-full p-4 rounded-lg bg-surface-subtle dark:bg-[#151C17] border border-border dark:border-border-dark space-y-3 text-xs leading-relaxed font-sans">
                    {msg.fact && (
                      <div className="p-2.5 rounded bg-forest/10 border border-forest/20 text-text-primary dark:text-white space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-forest dark:text-[#88B094]">
                          CONFIRMED FROM YOUR PROJECT
                        </div>
                        <div className="whitespace-pre-line">{msg.fact}</div>
                      </div>
                    )}

                    {msg.inference && (
                      <div className="p-2.5 rounded bg-copper/10 border border-copper/20 text-text-primary dark:text-white space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-copper dark:text-[#E08F6B]">
                          BASED ON PROJECT STRUCTURE
                        </div>
                        <div>{msg.inference}</div>
                      </div>
                    )}

                    {msg.unknown && (
                      <div className="p-2.5 rounded bg-surface border border-border dark:bg-[#121814] dark:border-border-dark text-text-muted space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                          NOT FOUND IN THE PROJECT
                        </div>
                        <div>{msg.unknown}</div>
                      </div>
                    )}

                    {/* Fallback plain content if no structured sections */}
                    {!msg.fact && !msg.inference && !msg.unknown && (
                      <div>{msg.content}</div>
                    )}

                    {/* Citations */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="pt-2 border-t border-border dark:border-border-dark space-y-1.5">
                        <div className="text-[10px] uppercase font-semibold text-text-muted">
                          Found in ({msg.citations.length})
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.citations.map((c, i) => (
                            <span
                              key={i}
                              onClick={() => onInspectFile && onInspectFile(c.path)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-surface border border-border dark:bg-[#1A221D] dark:border-border-dark text-forest dark:text-[#88B094] cursor-pointer hover:underline"
                            >
                              <FileCode className="w-3 h-3" />
                              <span>{c.label}</span>
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
            <div className="flex items-center gap-2 text-xs text-text-muted p-2">
              <Loader2 className="w-4 h-4 text-forest animate-spin" />
              <span>Searching your project…</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="border-t border-border pt-4 dark:border-border-dark">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask anything about your files, packages, structure, or history…"
              disabled={loading}
              className="flex-1 h-9 px-3 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#151C17] dark:border-border-dark dark:text-white"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!query.trim() || loading}
              className="text-xs font-sans font-medium gap-1 px-3"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Ask</span>
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
