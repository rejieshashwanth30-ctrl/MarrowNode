import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  decryptWebhookSecret,
  verifyGitHubWebhookSignature,
} from '@/lib/security/webhook-crypto';
import { runPullRequestCheckFromWebhook } from '@/lib/services/pr-check';

export const dynamic = 'force-dynamic';

const TRACKED_PR_ACTIONS = new Set([
  'opened',
  'synchronize',
  'reopened',
  'edited',
  'ready_for_review',
]);

/**
 * POST /api/github/webhooks
 * Receives GitHub Pull Request webhooks with mandatory HMAC-SHA256 verification
 * and strict multi-tenant project isolation.
 */
export async function POST(request: NextRequest) {
  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: 'Unable to read webhook payload.' }, { status: 400 });
  }

  const event = request.headers.get('x-github-event') || '';
  const signature = request.headers.get('x-hub-signature-256');
  const deliveryId = request.headers.get('x-github-delivery') || null;
  const projectIdParam = request.nextUrl.searchParams.get('projectId');

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON webhook payload.' }, { status: 400 });
  }

  const repoFullName = payload?.repository?.full_name
    ? String(payload.repository.full_name).toLowerCase()
    : null;
  const repoIdStr = payload?.repository?.id ? String(payload.repository.id) : null;

  // Locate candidate projects explicitly enabled for PR Checks
  const candidates = projectIdParam
    ? await prisma.project.findMany({
        where: { id: projectIdParam, prChecksEnabled: true },
        include: { repository: true },
      })
    : await prisma.project.findMany({
        where: {
          prChecksEnabled: true,
          repository: {
            isNot: null,
          },
        },
        include: { repository: true },
      });

  const matchingProjects = candidates.filter((proj) => {
    const repo = proj.repository;
    if (!repo) return false;
    if (repoFullName && repo.fullName.toLowerCase() === repoFullName) return true;
    if (repoIdStr && repo.githubRepoId === repoIdStr) return true;
    return !repoFullName && !repoIdStr && Boolean(projectIdParam);
  });

  // Strict HMAC verification per project (or global fallback secret)
  const globalSecret = process.env.GITHUB_WEBHOOK_SECRET || null;
  const verifiedProjects = matchingProjects.filter((proj) => {
    const projectSecret = decryptWebhookSecret(proj.prWebhookSecretEnc);
    if (projectSecret && verifyGitHubWebhookSignature(rawBody, signature, projectSecret)) {
      return true;
    }
    if (globalSecret && verifyGitHubWebhookSignature(rawBody, signature, globalSecret)) {
      return true;
    }
    return false;
  });

  if (verifiedProjects.length === 0) {
    // Allow signature-verified global secret ping cleanly if repo isn't connected yet
    if (
      event === 'ping' &&
      globalSecret &&
      verifyGitHubWebhookSignature(rawBody, signature, globalSecret)
    ) {
      return NextResponse.json({ ok: true, event: 'ping', deliveryId });
    }
    return NextResponse.json({ error: 'Invalid or unauthorized webhook signature.' }, { status: 401 });
  }

  if (event === 'ping') {
    return NextResponse.json({
      ok: true,
      event: 'ping',
      deliveryId,
      matchedProjects: verifiedProjects.length,
    });
  }

  if (event !== 'pull_request') {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: `Event "${event}" is not processed by PR Check.`,
    });
  }

  const action = String(payload?.action || '');
  const prNumber = Number(payload?.pull_request?.number || payload?.number);

  if (!TRACKED_PR_ACTIONS.has(action)) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      action,
      prNumber: Number.isInteger(prNumber) ? prNumber : null,
    });
  }

  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return NextResponse.json({ error: 'Invalid pull_request number in payload.' }, { status: 400 });
  }

  const results = await Promise.all(
    verifiedProjects.map(async (proj) => {
      try {
        const res = await runPullRequestCheckFromWebhook({
          projectId: proj.id,
          prNumber,
          prPayload: payload.pull_request,
        });
        return {
          projectId: proj.id,
          status: 'processed',
          deduplicated: Boolean((res as any).deduplicated),
          checkStatus: (res as any).report?.status || null,
        };
      } catch (err: any) {
        return {
          projectId: proj.id,
          status: 'error',
          message: err?.message || 'PR Check execution failed.',
        };
      }
    })
  );

  return NextResponse.json({
    ok: true,
    deliveryId,
    action,
    prNumber,
    results,
  });
}

