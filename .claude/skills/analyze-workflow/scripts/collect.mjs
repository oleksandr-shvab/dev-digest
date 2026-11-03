#!/usr/bin/env node
// Collects the measurable facts of one finished multi-agent workflow from
// Claude Code's own transcripts. Read-only; prints JSON (or a table with --text).
//
//   node collect.mjs [--session <id|path>] [--since <iso>] [--text]
//
// Layout it reads (Claude Code 2.1.x):
//   ~/.claude/projects/<cwd, non-alphanumerics → "-">/<session>.jsonl
//   ~/.claude/projects/<…>/<session>/subagents/agent-<id>.jsonl + .meta.json
//
// Token rule that matters: one API response is written as several `assistant`
// records (one per content block) that repeat the same `requestId` and `usage`.
// Summing records overcounts several times over, so usage is counted once per
// requestId.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const asText = args.includes('--text');
const since = opt('since') ? Date.parse(opt('since')) : 0;
if (opt('since') && Number.isNaN(since)) fail(`--since is not a date: ${opt('since')}`);

function fail(msg) {
  console.error(`collect.mjs: ${msg}`);
  process.exit(1);
}

function readJsonl(path) {
  const rows = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // a half-written last line of a live session; skip it
    }
  }
  return rows;
}

// ---- locate the session ----------------------------------------------------
const projectsDir = join(homedir(), '.claude', 'projects');
const projectDir = join(projectsDir, process.cwd().replace(/[^a-zA-Z0-9]/g, '-'));
if (!existsSync(projectDir)) fail(`no transcripts for this directory: ${projectDir}`);

function resolveSession() {
  const want = opt('session');
  if (want && existsSync(want) && want.endsWith('.jsonl')) return want;
  if (want) {
    const p = join(projectDir, `${want.replace(/\.jsonl$/, '')}.jsonl`);
    if (!existsSync(p)) fail(`session not found: ${p}`);
    return p;
  }
  const newest = readdirSync(projectDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ f, t: statSync(join(projectDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0];
  if (!newest) fail(`no session transcripts in ${projectDir}`);
  return join(projectDir, newest.f);
}

const sessionFile = resolveSession();
const sessionId = basename(sessionFile, '.jsonl');
const subDir = join(projectDir, sessionId, 'subagents');

// ---- helpers ---------------------------------------------------------------
const ms = (ts) => (ts ? Date.parse(ts) : NaN);
const inWindow = (ts) => !since || ms(ts) >= since;

function addUsage(acc, u) {
  acc.input += u.input_tokens ?? 0;
  acc.cache_creation += u.cache_creation_input_tokens ?? 0;
  acc.cache_read += u.cache_read_input_tokens ?? 0;
  acc.output += u.output_tokens ?? 0;
}
const zeroUsage = () => ({ input: 0, cache_creation: 0, cache_read: 0, output: 0 });

/** Facts from one transcript (main session or one subagent). */
function analyze(rows, { windowed }) {
  const usage = zeroUsage();
  const seenRequests = new Set();
  const models = new Set();
  const tools = {};
  const errors = [];
  const reads = new Set();
  const writes = new Set();
  const bash = [];
  const toolNameById = new Map();
  let first = Infinity;
  let last = 0;
  let turns = 0;
  let finalText = '';
  let handback = '';

  for (const r of rows) {
    if (windowed && r.timestamp && !inWindow(r.timestamp)) continue;
    const t = ms(r.timestamp);
    if (!Number.isNaN(t)) {
      first = Math.min(first, t);
      last = Math.max(last, t);
    }
    const content = r.message?.content;
    if (r.type === 'assistant' && r.message) {
      const key = r.requestId ?? r.message.id ?? r.uuid;
      if (!seenRequests.has(key)) {
        seenRequests.add(key);
        turns += 1;
        addUsage(usage, r.message.usage ?? {});
        if (r.message.model) models.add(r.message.model);
      }
      for (const b of Array.isArray(content) ? content : []) {
        if (b.type === 'text' && b.text?.trim()) finalText = b.text;
        if (b.type !== 'tool_use') continue;
        tools[b.name] = (tools[b.name] ?? 0) + 1;
        toolNameById.set(b.id, b.name);
        const inp = b.input ?? {};
        // A subagent's real report is its SubagentHandback message; its last plain text is often a stray note.
        if (b.name === 'SubagentHandback' && typeof inp.message === 'string') handback = inp.message;
        if (b.name === 'Read' && inp.file_path) reads.add(inp.file_path);
        if ((b.name === 'Edit' || b.name === 'Write') && inp.file_path) writes.add(inp.file_path);
        if (b.name === 'Bash' && inp.command) bash.push(String(inp.command).trim());
      }
    }
    if (r.type === 'user' && Array.isArray(content)) {
      for (const b of content) {
        if (b.type !== 'tool_result' || !b.is_error) continue;
        const text = Array.isArray(b.content)
          ? b.content.map((c) => c.text ?? '').join(' ')
          : String(b.content ?? '');
        errors.push({ tool: toolNameById.get(b.tool_use_id) ?? '?', message: text.slice(0, 200) });
      }
    }
  }
  return {
    usage,
    models: [...models],
    turns,
    tools,
    errors,
    reads: [...reads],
    writes: [...writes],
    bash,
    startedAt: Number.isFinite(first) ? new Date(first).toISOString() : null,
    endedAt: last ? new Date(last).toISOString() : null,
    durationMs: Number.isFinite(first) && last ? last - first : null,
    finalText: (handback || finalText).slice(0, 2500),
  };
}

// ---- main session ----------------------------------------------------------
const mainRows = readJsonl(sessionFile);
const main = analyze(mainRows, { windowed: true });

// Agent launches in the main session, in launch order.
const launches = [];
const statusByTask = new Map(); // agentId -> last notified status
const launchAgentId = new Map(); // toolUseId -> agentId
for (const r of mainRows) {
  if (r.type === 'assistant' && inWindow(r.timestamp)) {
    for (const b of Array.isArray(r.message?.content) ? r.message.content : []) {
      if (b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task')) {
        launches.push({
          toolUseId: b.id,
          launchedAt: r.timestamp,
          subagentType: b.input?.subagent_type ?? 'general-purpose',
          description: b.input?.description ?? '',
          background: !!b.input?.run_in_background,
          promptChars: String(b.input?.prompt ?? '').length,
        });
      }
    }
  }
  if (r.type === 'user' && r.toolUseResult?.agentId && r.message?.content) {
    for (const b of Array.isArray(r.message.content) ? r.message.content : []) {
      if (b.type === 'tool_result') launchAgentId.set(b.tool_use_id, r.toolUseResult.agentId);
    }
  }
  const noticeText =
    r.type === 'queue-operation' ? r.content : r.attachment?.type === 'queued_command' ? r.attachment.prompt : null;
  if (typeof noticeText === 'string' && noticeText.includes('<task-notification>')) {
    const id = /<task-id>([^<]+)<\/task-id>/.exec(noticeText)?.[1];
    const st = /<status>([^<]+)<\/status>/.exec(noticeText)?.[1];
    if (id && st) statusByTask.set(id, st);
  }
}

// ---- subagents -------------------------------------------------------------
const agents = [];
if (existsSync(subDir)) {
  for (const f of readdirSync(subDir).filter((x) => x.endsWith('.jsonl'))) {
    const agentId = f.replace(/^agent-/, '').replace(/\.jsonl$/, '');
    const metaPath = join(subDir, f.replace(/\.jsonl$/, '.meta.json'));
    const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
    const a = analyze(readJsonl(join(subDir, f)), { windowed: false });
    const launch =
      launches.find((l) => l.toolUseId === meta.toolUseId) ??
      launches.find((l) => launchAgentId.get(l.toolUseId) === agentId);
    if (since && !launch) continue; // belongs to work before --since
    agents.push({
      agentId,
      type: meta.agentType ?? launch?.subagentType ?? '?',
      description: meta.description ?? launch?.description ?? '',
      depth: meta.spawnDepth ?? 1,
      background: launch?.background ?? meta.requestShape === 'background',
      launchedAt: launch?.launchedAt ?? a.startedAt,
      status: statusByTask.get(agentId) ?? (meta.finished ? 'finished' : 'unknown'),
      briefChars: launch?.promptChars ?? null,
      ...a,
    });
  }
}
agents.sort((x, y) => ms(x.launchedAt) - ms(y.launchedAt));
agents.forEach((a, i) => (a.order = i + 1));

// ---- cross-agent facts -----------------------------------------------------
// Max number of agents alive at once, and which launches overlapped.
const spans = agents
  .filter((a) => a.startedAt && a.endedAt)
  .map((a) => ({ id: a.agentId, s: ms(a.launchedAt ?? a.startedAt), e: ms(a.endedAt) }));
let maxParallel = 0;
for (const p of spans) {
  maxParallel = Math.max(maxParallel, spans.filter((q) => q.s <= p.s && q.e > p.s).length);
}
const waves = [];
for (const a of agents) {
  const w = waves[waves.length - 1];
  const wEnd = w ? Math.max(...w.map((x) => ms(x.endedAt))) : -1;
  if (w && ms(a.launchedAt) < wEnd) w.push(a);
  else waves.push([a]);
}

function sharedBy(listOf) {
  const owners = new Map();
  for (const a of agents) {
    for (const item of new Set(listOf(a))) {
      if (!owners.has(item)) owners.set(item, new Set());
      owners.get(item).add(a.agentId);
    }
  }
  return [...owners]
    .filter(([, o]) => o.size >= 2)
    .map(([item, o]) => ({ item, agents: o.size }))
    .sort((x, y) => y.agents - x.agents);
}
const norm = (c) => c.replace(/\s+/g, ' ').slice(0, 160);
const duplicates = {
  filesReadByManyAgents: sharedBy((a) => a.reads).slice(0, 15),
  commandsRunByManyAgents: sharedBy((a) => a.bash.map(norm)).slice(0, 15),
  filesWrittenByManyAgents: sharedBy((a) => a.writes).slice(0, 15),
};

const total = zeroUsage();
for (const u of [main.usage, ...agents.map((a) => a.usage)]) addUsage(total, { input_tokens: u.input, cache_creation_input_tokens: u.cache_creation, cache_read_input_tokens: u.cache_read, output_tokens: u.output });

const byType = {};
for (const a of agents) {
  const t = (byType[a.type] ??= { agents: 0, output: 0, freshInput: 0, cacheRead: 0, errors: 0 });
  t.agents += 1;
  t.output += a.usage.output;
  t.freshInput += a.usage.input + a.usage.cache_creation;
  t.cacheRead += a.usage.cache_read;
  t.errors += a.errors.length;
}

const slim = (a) => ({
  order: a.order,
  agentId: a.agentId,
  type: a.type,
  description: a.description,
  depth: a.depth,
  background: a.background,
  status: a.status,
  launchedAt: a.launchedAt,
  durationMs: a.durationMs,
  turns: a.turns,
  usage: a.usage,
  tools: a.tools,
  filesWritten: a.writes,
  errors: a.errors,
  briefChars: a.briefChars,
  finalText: a.finalText,
});

const report = {
  session: { id: sessionId, file: sessionFile, since: since ? new Date(since).toISOString() : null, models: main.models },
  totals: {
    agents: agents.length,
    maxParallel,
    waves: waves.map((w) => w.map((a) => a.order)),
    ...total,
    freshInput: total.input + total.cache_creation,
    note: 'Tokens are counted once per API request. cache_read is context re-read from cache, not new text. No cost is computed: this tool has no price list.',
  },
  mainSession: { usage: main.usage, turns: main.turns, tools: main.tools, errors: main.errors.length, startedAt: main.startedAt, endedAt: main.endedAt },
  byAgentType: byType,
  agents: agents.map(slim),
  duplicates,
};

if (!asText) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  const sec = (n) => (n == null ? '-' : `${Math.round(n / 1000)}s`);
  console.log(`session ${sessionId}${since ? ` (since ${report.session.since})` : ''}`);
  console.log(`agents ${agents.length} · max parallel ${maxParallel} · waves ${report.totals.waves.map((w) => `[${w.join(',')}]`).join(' ')}`);
  console.log(`tokens: fresh input ${k(report.totals.freshInput)} · cache read ${k(total.cache_read)} · output ${k(total.output)}`);
  console.log(`main session: fresh ${k(main.usage.input + main.usage.cache_creation)} · cache read ${k(main.usage.cache_read)} · output ${k(main.usage.output)} · ${main.turns} turns`);
  console.log('\n#  type                     status     time   turns fresh   cacheR  out    err  description');
  for (const a of agents) {
    console.log(
      `${String(a.order).padEnd(2)} ${a.type.padEnd(24)} ${String(a.status).padEnd(10)} ${sec(a.durationMs).padEnd(6)} ${String(a.turns).padEnd(5)} ${k(a.usage.input + a.usage.cache_creation).padEnd(7)} ${k(a.usage.cache_read).padEnd(7)} ${k(a.usage.output).padEnd(6)} ${String(a.errors.length).padEnd(4)} ${a.description}`,
    );
  }
  for (const [name, list] of Object.entries(duplicates)) {
    if (list.length === 0) continue;
    console.log(`\n${name}:`);
    for (const d of list.slice(0, 8)) console.log(`  ×${d.agents}  ${d.item}`);
  }
}
