/**
 * Tiny YAML-frontmatter reader for SKILL.md / .md imports. Only flat
 * `key: value` scalars are understood (quoted or plain, plus `>` / `|` block
 * scalars and indented continuation lines); everything else is ignored — the
 * parser never evaluates anything.
 */
export interface Frontmatter {
  found: boolean;
  data: Record<string, string>;
  /** Markdown body with the frontmatter block removed. */
  body: string;
}

const FENCE = /^---[ \t]*$/;

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

export function parseFrontmatter(source: string): Frontmatter {
  const text = source.replace(/^﻿/, '').replaceAll('\r\n', '\n');
  const lines = text.split('\n');
  if (!FENCE.test(lines[0] ?? '')) return { found: false, data: {}, body: text };
  const close = lines.findIndex((l, i) => i > 0 && FENCE.test(l));
  if (close < 0) return { found: false, data: {}, body: text };

  const data: Record<string, string> = {};
  for (let i = 1; i < close; i++) {
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(lines[i]!);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const rest = m[2]!;
    // Collect indented continuation lines belonging to this key.
    const cont: string[] = [];
    while (i + 1 < close && /^[ \t]+\S/.test(lines[i + 1]!)) cont.push(lines[++i]!.trim());
    if (/^[>|][+-]?$/.test(rest.trim())) {
      data[key] = cont.join(rest.trim().startsWith('|') ? '\n' : ' ').trim();
    } else {
      data[key] = [unquote(rest), ...cont].filter(Boolean).join(' ').trim();
    }
  }
  return { found: true, data, body: lines.slice(close + 1).join('\n') };
}
