import crypto from 'node:crypto';

const ENCRYPTION_VERSION = 'v1';

function getEncryptionKey(): Buffer {
  const material =
    process.env.MARROWNODE_ENCRYPTION_KEY ||
    process.env.WEBHOOK_ENCRYPTION_KEY ||
    process.env.DATABASE_URL ||
    'marrownode-local-webhook-key';

  return crypto.createHash('sha256').update(material, 'utf8').digest();
}

export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

export function encryptWebhookSecret(secret: string): { encrypted: string; last4: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: `${ENCRYPTION_VERSION}:${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`,
    last4: secret.slice(-4),
  };
}

export function decryptWebhookSecret(payload: string | null | undefined): string | null {
  if (!payload || typeof payload !== 'string') return null;

  try {
    const parts = payload.split(':');
    if (parts.length !== 4 || parts[0] !== ENCRYPTION_VERSION) return null;

    const [, ivHex, tagHex, dataHex] = parts;
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export function verifyGitHubWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!secret || !signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')}`;

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader.trim(), 'utf8');

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

export function maskSecretLast4(last4: string | null | undefined): string | null {
  if (!last4) return null;
  return `whsec_••••••••${last4}`;
}

