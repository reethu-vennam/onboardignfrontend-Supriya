import archiver = require('archiver');
import archiverZipEncrypted = require('archiver-zip-encrypted');
import { Writable } from 'stream';
import crypto from 'crypto';

archiver.registerFormat('zip-encrypted', archiverZipEncrypted);

type ZipEntry = {
  filename: string;
  content: Buffer;
};

/** Uppercase A–Z + digits 0–9 (36 chars per position). */
const ZIP_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Generate a unique strong code for ZIP protection.
 * Format: SABBPE-XXXXXXXX (8 random uppercase alphanumeric chars)
 */
export const generateZipCode = (): string => {
  let code = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    code += ZIP_CODE_CHARS[bytes[i] % ZIP_CODE_CHARS.length];
  }
  return `SABBPE-${code}`;
};

/** Prominent ZIP code block for approval email HTML. */
export const buildZipCodeEmailSection = (zipCode: string): string => `
<div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border-radius:12px;padding:24px;margin:0 0 30px;border:2px solid #f59e0b;text-align:center;">
  <p style="margin:0 0 8px;color:#92400e;font-size:15px;font-weight:600;">🔐 Your ZIP Code</p>
  <p style="margin:0;color:#78350f;font-size:32px;font-weight:800;letter-spacing:4px;font-family:monospace;">${zipCode}</p>
  <p style="margin:12px 0 0;color:#92400e;font-size:14px;line-height:1.5;">Use this code to unlock the attached ZIP and view documents.</p>
  <p style="margin:8px 0 0;color:#b45309;font-size:12px;">Password-protected · unique per merchant · not stored</p>
</div>`;

const buildArchiveBuffer = (
  format: 'zip' | 'zip-encrypted',
  entries: ZipEntry[],
  options?: { password?: string }
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });

    const archiveOptions: Record<string, unknown> = { zlib: { level: 6 } };
    if (options?.password) {
      archiveOptions.password = options.password;
      // zip20 = native Windows/macOS password prompt + browser JSZip support
      archiveOptions.encryptionMethod = 'zip20';
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const archive = archiver(format as any, archiveOptions);

    archive.on('error', (err) => reject(err));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.pipe(writable);

    for (const entry of entries) {
      archive.append(entry.content, { name: entry.filename });
    }

    archive.finalize();
  });

/** Unencrypted ZIP (outer delivery package). */
export const createPlainZipBuffer = async (entries: ZipEntry[]): Promise<Buffer> => {
  const result = await buildArchiveBuffer('zip', entries);
  console.log(`📦 Plain ZIP created: ${entries.length} files, ${result.length} bytes`);
  return result;
};

/**
 * Password-protected inner ZIP (documents). Password = SABBPE-XXXXXXXX code.
 */
export const createZipBuffer = async (
  entries: ZipEntry[],
  password: string
): Promise<Buffer> => {
  if (!password) {
    throw new Error('ZIP password is required for encrypted archive');
  }

  const result = await buildArchiveBuffer('zip-encrypted', entries, { password });
  console.log(`🔐 Encrypted documents ZIP: ${entries.length} files, ${result.length} bytes`);
  return result;
};
