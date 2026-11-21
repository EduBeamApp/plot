import { describe, expect, it } from 'vitest';
import { mergePaths, resolveScene, textRuns, type ResolvedPath } from './scene';
import { modelFromSolver } from './fromSolver';
import { buildStructureScene, RESULT_LAYERS, type PlotLayer } from './structure';
import { resolveUnits } from './units';
import * as S from '../testing/structures';

describe('merging paths that paint alike', () => {
  const path = (d: string, extra: Partial<ResolvedPath> = {}): ResolvedPath => ({
    group: 'loads',
    entity: 'elementLoad:0',
    d,
    layer: 7,
    tone: 'load',
    width: 1.25,
    ...extra,
  });

  it('joins alike paths of one entity and keeps different styles, entities and layers apart', () => {
    const merged = mergePaths([
      path('M0 0L0 10'),
      path('M0 12L2 10L-2 10Z', { width: 0, fill: 'tone' }),
      path('M5 0L5 10'),
      path('M5 12L7 10L3 10Z', { width: 0, fill: 'tone' }),
      path('M9 0L9 10', { entity: 'elementLoad:1' }),
      path('M0 0L9 0', { layer: 8 }),
    ]);
    expect(merged.map((p) => p.d)).toEqual([
      'M0 0L0 10M5 0L5 10',
      'M0 12L2 10L-2 10ZM5 12L7 10L3 10Z',
      'M9 0L9 10',
      'M0 0L9 0',
    ]);
  });

  it('leaves animated paths alone', () => {
    expect(mergePaths([path('M0 0L1 1', { draw: 0 }), path('M0 0L1 1', { draw: 1 })])).toHaveLength(2);
  });
});

describe('placing labels at any zoom', () => {
  it("stays quick when the members span millions of px, as at a fit's first probe", () => {
    const layers = new Set<PlotLayer>(['members', 'supports', 'loads', 'reactions', 'nodeLabels', 'M']);
    const scale = 1e7;
    const items = buildStructureScene(modelFromSolver(S.simplySupportedUdl()), {
      layers,
      compact: false,
      units: resolveUnits(),
      scale,
      diagramSize: 48,
      deformedSize: 30,
      momentOnTensionSide: true,
      fontSize: 13,
    });
    const started = performance.now();
    const resolved = resolveScene(
      items,
      { s: scale, tx: 0, ty: 0 },
      { fontSize: 13, shields: new Set(RESULT_LAYERS), lateGroups: new Set(RESULT_LAYERS) }
    );
    expect(performance.now() - started).toBeLessThan(1000);
    expect(resolved.texts.length).toBeGreaterThan(0);
  });
});

describe('a label in runs', () => {
  it('raises a power of ten as a superscript, in plain digits, and comes back down after it', () => {
    expect(textRuns('1.63·10⁻³ m', 14)).toEqual([
      { text: '1.63·10' },
      { text: '−3', size: 10.5, dy: -5.32 },
      { text: ' m', dy: 5.32 },
    ]);
  });

  it('is one run without one', () => {
    expect(textRuns('18.63', 14)).toEqual([{ text: '18.63' }]);
  });
});

describe('a mark that belongs to a label', () => {
  it('is drawn only when the label is', () => {
    const label = {
      kind: 'text' as const,
      group: 'M',
      layer: 0 as const,
      at: { x: 0, z: 0, dx: 0, dy: 0 },
      text: '15.61',
      tone: 'moment' as const,
      align: 'start' as const,
      baseline: 'middle' as const,
      priority: 1,
    };
    const mark = {
      kind: 'path' as const,
      group: 'M',
      layer: 0 as const,
      tone: 'moment' as const,
      width: 1,
      segments: [
        { op: 'M' as const, p: { x: 0, z: 0, dx: 0, dy: 0 } },
        { op: 'L' as const, p: { x: 0, z: 0, dx: 0, dy: 20 } },
      ],
      requires: label,
    };
    const t = { s: 1, tx: 0, ty: 0 };
    expect(resolveScene([label, mark], t, { fontSize: 13 }).paths).toHaveLength(1);
    // Left out, the label takes its mark with it
    expect(resolveScene([label, mark], t, { fontSize: 13, exclude: new Set([label]) }).paths).toHaveLength(0);
  });
});
