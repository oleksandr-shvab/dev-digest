import { inflateRawSync } from 'node:zlib';
import { PayloadTooLargeError, ValidationError } from '../../../platform/errors.js';

/**
 * Minimal, dependency-free, IN-MEMORY zip reader (central-directory based).
 *
 * Why not extract: an uploaded skill archive is untrusted. This module only
 * lists entries from the central directory (metadata — nothing is inflated)
 * and inflates ONE named entry on request, capped to its declared size. It
 * never touches the filesystem, never spawns a process, and never follows
 * symlink entries (they are surfaced as `isSymlink` so callers can refuse them).
 *
 * Supports stored (0) and deflate (8) entries; ZIP64 and encryption are not
 * supported (rejected with a 422 when relevant).
 */

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
/** EOCD is at most 22 bytes + a 65535-byte comment. */
const EOCD_SEARCH_WINDOW = 22 + 0xffff;

export interface ZipEntry {
  /** Normalized path: forward slashes, no leading `./` or `/`. */
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  encrypted: boolean;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function corrupt(detail: string): ValidationError {
  return new ValidationError(`Invalid zip archive: ${detail}`);
}

function normalizePath(raw: string): string {
  return raw.replaceAll('\\', '/').replace(/^(\.\/|\/)+/, '');
}

/**
 * List the entries of a zip from its central directory. `maxEntries` is checked
 * from the EOCD count BEFORE any entry is parsed; the caller applies its own
 * limits (entry count / total size) to the returned metadata.
 */
export function listZipEntries(bytes: Uint8Array, maxEntries: number): ZipEntry[] {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < 22) throw corrupt('file too small');

  // Locate the end-of-central-directory record (scan backwards).
  let eocd = -1;
  const stop = Math.max(0, buf.length - EOCD_SEARCH_WINDOW);
  for (let i = buf.length - 22; i >= stop; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw corrupt('end of central directory not found');

  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new ValidationError('ZIP64 archives are not supported');
  }
  if (total > maxEntries) {
    throw new PayloadTooLargeError(`Zip has too many entries (${total} > ${maxEntries})`);
  }
  if (cdOffset + cdSize > buf.length) throw corrupt('central directory out of bounds');

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CENTRAL) {
      throw corrupt('bad central directory entry');
    }
    const madeBy = buf.readUInt16LE(p + 4);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const externalAttrs = buf.readUInt32LE(p + 38);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    const end = p + 46 + nameLen + extraLen + commentLen;
    if (end > buf.length) throw corrupt('central directory entry out of bounds');

    const utf8 = (flags & 0x800) !== 0;
    const rawName = buf.toString(utf8 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLen);
    const path = normalizePath(rawName);
    const hostUnix = madeBy >> 8 === 3;
    const unixMode = externalAttrs >>> 16;
    entries.push({
      path,
      isDirectory: rawName.endsWith('/') || rawName.endsWith('\\'),
      isSymlink: hostUnix && (unixMode & 0xf000) === 0xa000,
      encrypted: (flags & 0x1) !== 0,
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    p = end;
  }
  return entries;
}

/**
 * Inflate ONE entry into memory. Output is capped at the entry's declared
 * uncompressed size (a lying header cannot expand past it) and must match it.
 */
export function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Buffer {
  if (entry.encrypted) throw new ValidationError(`${entry.path} is encrypted`);
  if (entry.isSymlink) throw new ValidationError(`${entry.path} is a symlink`);
  if (entry.method !== 0 && entry.method !== 8) {
    throw new ValidationError(`${entry.path} uses an unsupported compression method`);
  }
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lh = entry.localHeaderOffset;
  if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== SIG_LOCAL) throw corrupt('bad local header');
  const nameLen = buf.readUInt16LE(lh + 26);
  const extraLen = buf.readUInt16LE(lh + 28);
  const start = lh + 30 + nameLen + extraLen;
  const end = start + entry.compressedSize;
  if (end > buf.length) throw corrupt('entry data out of bounds');
  const data = buf.subarray(start, end);

  let out: Buffer;
  if (entry.method === 0) {
    out = Buffer.from(data);
  } else {
    if (entry.uncompressedSize === 0) return Buffer.alloc(0);
    try {
      out = inflateRawSync(data, { maxOutputLength: entry.uncompressedSize });
    } catch {
      throw corrupt(`${entry.path} could not be inflated (corrupt or size mismatch)`);
    }
  }
  if (out.length !== entry.uncompressedSize) throw corrupt(`${entry.path} size mismatch`);
  return out;
}
