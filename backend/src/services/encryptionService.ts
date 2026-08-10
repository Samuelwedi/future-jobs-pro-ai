import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function encryptionKey(): Buffer {
  const configured = process.env.ENCRYPTION_KEY?.trim();
  if (!configured || configured.length < 32) {
    throw new Error('ENCRYPTION_KEY must be configured with at least 32 characters');
  }
  return crypto.createHash('sha256').update(configured, 'utf8').digest();
}

export function encrypt(text: string): string {
  if (!text) throw new Error('Cannot encrypt an empty value');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export function decrypt(value: string): string {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(':');
  if (version !== 'v2' || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error('Stored integration credential uses an unsupported encryption format; reconnect the integration');
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(ivValue, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function generateState(): string {
  return crypto.randomBytes(32).toString('base64url');
}
