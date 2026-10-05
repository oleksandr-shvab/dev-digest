import { crc32, deflateRawSync } from 'node:zlib';

/**
 * Tiny in-memory zip WRITER for tests (the production code only reads zips).
 * `declaredSize` lets a test forge the central-directory uncompressed size to
 * simulate a zip bomb; `symlink` marks the entry as a Unix symlink.
 */
export interface TestZipEntry {
  path: string;
  data?: string | Buffer;
  method?: 0 | 8;
  declaredSize?: number;
  symlink?: boolean;
}

export function buildZip(entries: TestZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const isDir = e.path.endsWith('/');
    const raw = Buffer.from(e.data ?? '');
    const method = isDir ? 0 : (e.method ?? 8);
    const stored = method === 8 && raw.length > 0 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(e.path);
    const crc = raw.length ? crc32(raw) : 0;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x800, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(stored.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, stored);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE((3 << 8) | 20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(stored.length, 20);
    ch.writeUInt32LE(e.declaredSize ?? raw.length, 24);
    ch.writeUInt16LE(name.length, 28);
    const mode = e.symlink ? 0o120777 : isDir ? 0o040755 : 0o100644;
    ch.writeUInt32LE((mode << 16) >>> 0, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);

    offset += lh.length + name.length + stored.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

/** Build a multipart/form-data body with one file part (+ an ignored text field). */
export function buildMultipart(
  filename: string,
  data: Buffer | string,
  boundary = '----devdigestboundary',
): { body: Buffer; contentType: string } {
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\nhello\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([head, Buffer.from(data), tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
