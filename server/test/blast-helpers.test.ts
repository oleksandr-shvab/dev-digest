import { describe, it, expect } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import { countBlast, toBlastRadius } from '../src/modules/blast/helpers.js';
import type { BlastCallerRow, BlastResult, IndexStatus } from '../src/modules/repo-intel/types.js';

function caller(
  file: string,
  symbol: string,
  viaSymbol: string,
  line: number,
  rank = 0.5,
): BlastCallerRow {
  return { file, symbol, viaSymbol, line, rank };
}

function result(partial: Partial<BlastResult>): BlastResult {
  return {
    changedSymbols: [],
    callers: [],
    impactedEndpoints: [],
    degraded: false,
    ...partial,
  };
}

/** Maps and checks the output against the shared contract. */
function map(r: BlastResult, status: IndexStatus = 'full') {
  return BlastRadius.parse(toBlastRadius(r, status));
}

const FOO = { file: 'a.ts', name: 'foo', kind: 'function' };
const BAR = { file: 'b.ts', name: 'bar', kind: 'function' };

describe('toBlastRadius', () => {
  it('groups callers by viaSymbol in first-appearance order, keeping facade order', () => {
    const out = map(
      result({
        changedSymbols: [FOO, BAR],
        callers: [
          caller('x.ts', 'xFn', 'bar', 1, 0.9),
          caller('y.ts', 'yFn', 'foo', 2, 0.8),
          caller('z.ts', 'zFn', 'bar', 3, 0.7),
          caller('w.ts', 'wFn', 'foo', 4, 0.6),
        ],
      }),
    );
    expect(out.changed_symbols).toEqual([FOO, BAR]);
    expect(out.downstream.map((g) => g.symbol)).toEqual(['bar', 'foo']);
    expect(out.downstream[0]!.callers).toEqual([
      { name: 'xFn', file: 'x.ts', line: 1 },
      { name: 'zFn', file: 'z.ts', line: 3 },
    ]);
    expect(out.downstream[1]!.callers).toEqual([
      { name: 'yFn', file: 'y.ts', line: 2 },
      { name: 'wFn', file: 'w.ts', line: 4 },
    ]);
  });

  it('keeps a duplicate (viaSymbol, file, symbol) row once, with the first line', () => {
    const out = map(
      result({
        changedSymbols: [FOO],
        callers: [caller('x.ts', 'xFn', 'foo', 10), caller('x.ts', 'xFn', 'foo', 40)],
      }),
    );
    expect(out.downstream).toHaveLength(1);
    expect(out.downstream[0]!.callers).toEqual([{ name: 'xFn', file: 'x.ts', line: 10 }]);
  });

  it('drops a caller in the declaring file of its viaSymbol, only for that symbol', () => {
    const out = map(
      result({
        changedSymbols: [FOO, BAR],
        callers: [
          caller('a.ts', 'inner', 'foo', 5), // a.ts declares foo -> dropped
          caller('a.ts', 'inner', 'bar', 6), // a.ts does not declare bar -> kept
          caller('b.ts', 'self', 'bar', 7), // b.ts declares bar, and bar has other callers
        ],
      }),
    );
    expect(out.downstream.map((g) => g.symbol)).toEqual(['bar']);
    expect(out.downstream[0]!.callers).toEqual([{ name: 'inner', file: 'a.ts', line: 6 }]);
  });

  it('gives no group to a symbol whose only caller is in its declaring file', () => {
    const out = map(
      result({ changedSymbols: [FOO], callers: [caller('a.ts', 'inner', 'foo', 5)] }),
    );
    expect(out.changed_symbols).toEqual([FOO]);
    expect(out.downstream).toEqual([]);
  });

  it('attributes endpoints and crons per group through factsByFile, de-duplicated, first-seen order', () => {
    const out = map(
      result({
        changedSymbols: [FOO, BAR],
        callers: [
          caller('r1.ts', 'h1', 'foo', 1),
          caller('r2.ts', 'h2', 'foo', 2),
          caller('plain.ts', 'p', 'foo', 3), // no facts for this file
          caller('r3.ts', 'h3', 'bar', 4),
        ],
        impactedEndpoints: ['GET /a', 'GET /b', 'POST /c'],
        factsByFile: {
          'r1.ts': { endpoints: ['GET /a', 'GET /b'], crons: ['nightly'] },
          'r2.ts': { endpoints: ['GET /a'], crons: ['nightly', 'hourly'] },
          'r3.ts': { endpoints: ['POST /c'], crons: [] },
        },
      }),
    );
    const [foo, bar] = out.downstream;
    expect(foo!.symbol).toBe('foo');
    expect(foo!.endpoints_affected).toEqual(['GET /a', 'GET /b']);
    expect(foo!.crons_affected).toEqual(['nightly', 'hourly']);
    expect(bar!.endpoints_affected).toEqual(['POST /c']);
    expect(bar!.crons_affected).toEqual([]);
  });

  it('shows a template-literal endpoint placeholder as a route param, merging it with the literal form', () => {
    const out = map(
      result({
        changedSymbols: [FOO],
        callers: [caller('x.ts', 'xFn', 'foo', 1), caller('y.ts', 'yFn', 'foo', 2)],
        factsByFile: {
          'x.ts': { endpoints: ['POST /findings/:id/${action}'], crons: [] },
          'y.ts': { endpoints: ['POST /findings/:id/:action'], crons: [] },
        },
      }),
    );
    expect(out.downstream[0]!.endpoints_affected).toEqual(['POST /findings/:id/:action']);
    expect(out.summary).toBe('symbols: 1, callers: 2, endpoints: 1, crons: 0');
  });

  it('leaves endpoints_affected and crons_affected empty without factsByFile', () => {
    const out = map(
      result({
        changedSymbols: [FOO],
        callers: [caller('x.ts', 'xFn', 'foo', 1)],
        impactedEndpoints: ['GET /a'],
      }),
    );
    expect(out.downstream[0]!.endpoints_affected).toEqual([]);
    expect(out.downstream[0]!.crons_affected).toEqual([]);
  });

  it('counts a caller reaching two symbols once and an endpoint seen twice once; builds the summary', () => {
    const out = map(
      result({
        changedSymbols: [FOO, BAR, { file: 'c.ts', name: 'baz', kind: 'class' }],
        callers: [
          caller('x.ts', 'handler', 'foo', 1),
          caller('x.ts', 'handler', 'bar', 2),
          caller('y.ts', 'job', 'bar', 3),
        ],
        factsByFile: {
          'x.ts': { endpoints: ['GET /a'], crons: [] },
          'y.ts': { endpoints: ['GET /a'], crons: ['nightly'] },
        },
      }),
    );
    expect(countBlast(out)).toEqual({ symbols: 3, callers: 2, endpoints: 1, crons: 1 });
    expect(out.summary).toBe('symbols: 3, callers: 2, endpoints: 1, crons: 1');
  });

  it('passes the facade degraded state through', () => {
    const out = map(result({ degraded: true, reason: 'no_data' }), 'degraded');
    expect(out.degraded).toBe(true);
    expect(out.reason).toBe('no_data');
  });

  it.each<{
    name: string;
    facade: Pick<BlastResult, 'degraded' | 'reason'>;
    status: IndexStatus;
    degraded: boolean;
    reason: string | undefined;
  }>([
    {
      name: 'upgrades a partial index the facade called healthy',
      facade: { degraded: false },
      status: 'partial',
      degraded: true,
      reason: 'index_partial',
    },
    {
      name: 'leaves a full index healthy, with no reason key',
      facade: { degraded: false },
      status: 'full',
      degraded: false,
      reason: undefined,
    },
    {
      name: 'keeps the facade reason on a partial index',
      facade: { degraded: true, reason: 'no_data' },
      status: 'partial',
      degraded: true,
      reason: 'no_data',
    },
  ])('$name', ({ facade, status, degraded, reason }) => {
    const out = map(result(facade), status);
    expect(out.degraded).toBe(degraded);
    if (reason === undefined) {
      expect('reason' in out).toBe(false);
    } else {
      expect(out.reason).toBe(reason);
    }
  });

  it('maps empty results', () => {
    const empty = map(result({}));
    expect(empty.changed_symbols).toEqual([]);
    expect(empty.downstream).toEqual([]);
    expect(empty.summary).toBe('symbols: 0, callers: 0, endpoints: 0, crons: 0');

    const noCallers = map(result({ changedSymbols: [FOO, BAR] }));
    expect(noCallers.downstream).toEqual([]);
    expect(noCallers.summary).toBe('symbols: 2, callers: 0, endpoints: 0, crons: 0');
  });
});

describe('countBlast', () => {
  it('counts distinct (file, name) callers and distinct endpoints and crons across groups', () => {
    const counts = countBlast({
      changed_symbols: [FOO],
      downstream: [
        {
          symbol: 'foo',
          callers: [
            { name: 'h', file: 'x.ts', line: 1 },
            { name: 'h', file: 'y.ts', line: 2 },
          ],
          endpoints_affected: ['GET /a'],
          crons_affected: ['c'],
        },
        {
          symbol: 'bar',
          callers: [{ name: 'h', file: 'x.ts', line: 9 }],
          endpoints_affected: ['GET /a', 'GET /b'],
          crons_affected: ['c'],
        },
      ],
    });
    expect(counts).toEqual({ symbols: 1, callers: 2, endpoints: 2, crons: 1 });
  });
});
