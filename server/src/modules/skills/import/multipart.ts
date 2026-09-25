import { ValidationError } from '../../../platform/errors.js';

/**
 * Minimal multipart/form-data reader for the import-preview upload: extracts
 * exactly ONE file part from an already-buffered body (the route caps the body
 * size before this runs). Pure and in-memory — nothing touches the filesystem.
 * Non-file fields are ignored.
 */
export interface UploadedFile {
  filename: string;
  data: Buffer;
}

const MAX_BOUNDARY_LENGTH = 200;
const CRLF = Buffer.from('\r\n');
const HEADER_END = Buffer.from('\r\n\r\n');

function boundaryOf(contentType: string | undefined): string {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType ?? '');
  const boundary = m?.[1] ?? m?.[2];
  if (!boundary || boundary.length > MAX_BOUNDARY_LENGTH) {
    throw new ValidationError('Expected a multipart/form-data upload');
  }
  return boundary;
}

function filenameOf(headers: string): string | undefined {
  const disposition = /^content-disposition:[^\r\n]*$/im.exec(headers)?.[0];
  if (!disposition) return undefined;
  const m = /filename="([^"]*)"|filename=([^;\s]+)/i.exec(disposition);
  return m ? (m[1] ?? m[2]) : undefined;
}

export function extractUploadedFile(contentType: string | undefined, body: Buffer): UploadedFile {
  const delimiter = Buffer.from(`--${boundaryOf(contentType)}`);
  const files: UploadedFile[] = [];

  let pos = body.indexOf(delimiter);
  while (pos >= 0) {
    let start = pos + delimiter.length;
    // `--` right after the delimiter marks the closing boundary.
    if (body.subarray(start, start + 2).toString('latin1') === '--') break;
    if (!body.subarray(start, start + 2).equals(CRLF)) {
      throw new ValidationError('Malformed multipart body');
    }
    start += 2;
    const next = body.indexOf(delimiter, start);
    if (next < 0) throw new ValidationError('Malformed multipart body');

    // Part = headers, blank line, content, CRLF (which precedes the next delimiter).
    const part = body.subarray(start, next - CRLF.length);
    const headerEnd = part.indexOf(HEADER_END);
    if (headerEnd >= 0) {
      const filename = filenameOf(part.subarray(0, headerEnd).toString('utf8'));
      if (filename !== undefined) {
        files.push({ filename, data: Buffer.from(part.subarray(headerEnd + HEADER_END.length)) });
      }
    }
    pos = next;
  }

  if (files.length !== 1) {
    throw new ValidationError('Upload exactly one file (.md or .zip)');
  }
  return files[0]!;
}
