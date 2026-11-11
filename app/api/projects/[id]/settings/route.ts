import { NextResponse, type NextRequest } from 'next/server';
import { AuthError, requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { getUserProject } from '@/lib/services/projects';
import {
  encryptWebhookSecret,
  generateWebhookSecret,
  maskSecretLast4,
} from '@/lib/security/webhook-crypto';

export const dynamic = 'force-dynamic';

function buildSanitizedSettings(project: any) {
  const webhookUrl = `${env.NEXT_PUBLIC_APP_URL}/api/github/webhooks?projectId=${encodeURIComponent(project.id)}`;
  return {
    projectId: project.id,
    prChecksEnabled: Boolean(project.prChecksEnabled),
    prCheckAutoPublish: Boolean(project.prCheckAutoPublish),
    hasWebhookSecret: Boolean(project.prWebhookSecretEnc),
    maskedWebhookSecret: maskSecretLast4(project.prWebhookSecretLast4),
    webhookUrl,
    globalWebhookConfigured: Boolean(process.env.GITHUB_WEBHOOK_SECRET),
  };
}

/**
 * GET /api/projects/[id]/settings
 * Returns sanitized project PR Check & webhook settings (never exposes secrets or OAuth tokens).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const project = await getUserProject(params.id);
    return NextResponse.json({ settings: buildSanitizedSettings(project) });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to load project settings.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[id]/settings
 * Updates PR Check integration configuration and rotates encrypted per-project webhook secrets.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const existing = await getUserProject(params.id);
    const body = await request.json().catch(() => ({}));

    const updateData: {
      prChecksEnabled?: boolean;
      prCheckAutoPublish?: boolean;
      prWebhookSecretEnc?: string;
      prWebhookSecretLast4?: string;
    } = {};

    if (typeof body.prChecksEnabled === 'boolean') {
      updateData.prChecksEnabled = body.prChecksEnabled;
    }
    if (typeof body.prCheckAutoPublish === 'boolean') {
      updateData.prCheckAutoPublish = body.prCheckAutoPublish;
    }

    let plaintextSecretOnce: string | null = null;
    const customSecret =
      typeof body.customWebhookSecret === 'string' ? body.customWebhookSecret.trim() : '';

    if (customSecret) {
      if (customSecret.length < 16) {
        return NextResponse.json(
          { error: 'Custom webhook secret must be at least 16 characters long.' },
          { status: 400 }
        );
      }
      const { encrypted, last4 } = encryptWebhookSecret(customSecret);
      updateData.prWebhookSecretEnc = encrypted;
      updateData.prWebhookSecretLast4 = last4;
    } else if (
      body.rotateWebhookSecret === true ||
      (updateData.prChecksEnabled === true && !(existing as any).prWebhookSecretEnc)
    ) {
      const generated = generateWebhookSecret();
      const { encrypted, last4 } = encryptWebhookSecret(generated);
      updateData.prWebhookSecretEnc = encrypted;
      updateData.prWebhookSecretLast4 = last4;
      plaintextSecretOnce = generated;
    }

    const updated = await prisma.project.update({
      where: { id: existing.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      settings: buildSanitizedSettings(updated),
      plaintextSecretOnce,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to update project settings.' },
      { status: 500 }
    );
  }
}

