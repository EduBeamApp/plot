import { describe, expect, it } from 'vitest';
import { DofID } from '@edubeam/fem';
import { modelFromSolver } from './fromSolver';
import { buildStructureScene, defaultResultLayer, tipPlacements, type PlotLayer } from './structure';
import { anchor, fitScene, placeLabels, project, type SceneItem, type SceneText } from './scene';
import { resolveUnits } from './units';
import { appExamples, buildAppExample, buildStepsFrame } from '../testing/appExamples';
import * as S from '../testing/structures';

const scene = (solver: ReturnType<typeof S.simplySupportedUdl>, layers: PlotLayer[], extra = {}) =>
  buildStructureScene(modelFromSolver(solver), {
    layers: new Set(layers),
    compact: false,
    units: resolveUnits(),
    scale: 60,
    diagramSize: 48,
    deformedSize: 30,
    momentOnTensionSide: true,
    fontSize: 13,
    ...extra,
  });

const texts = (items: SceneItem[]) => items.filter((i): i is SceneText => i.kind === 'text');

describe('result labels hang from the tip of their ordinate', () => {
  it('puts the mid-span moment of a simple beam just under the tip of its ordinate', () => {
    const items = scene(S.simplySupportedUdl(), ['members', 'M']);
    const label = texts(items).find((t) => t.text.startsWith('54'))!;
    // Mid-span, 48 px of ordinate below the beam (z down), then 5 px further out.
    expect(label.at.x).toBeCloseTo(3, 9);
    expect(label.at.dx).toBeCloseTo(0, 9);
    expect(label.at.dy).toBeCloseTo(48 + 5, 9);
    expect(label.baseline).toBe('top');
  });

  it("turns the text along the ordinate in 'axis' mode, reading upward across a beam", () => {
    const [p] = tipPlacements(anchor(0, 0, 0, 40), { x: 0, y: 1 }, 'axis');
    expect(p.rotate).toBe(-90);
    // The text runs up its own x axis, so it ends at the anchor and extends down, beyond the tip.
    expect(p.align).toBe('end');
    expect(p.at.dy).toBeCloseTo(45, 9);
  });

  it('only ever moves a label outward along its ordinate or to a side of the same tip', () => {
    const places = tipPlacements(anchor(0, 0, 0, 40), { x: 0, y: 1 }, 'horizontal');
    for (const p of places) {
      expect(Math.abs(p.at.dx)).toBeLessThanOrEqual(4);
      expect(p.at.dy).toBeGreaterThanOrEqual(45);
    }
  });

  it('writes a rigid corner once, at a member tip, never on the bisector', () => {
    const items = scene(buildStepsFrame(), ['members', 'M']);
    const corner = texts(items).filter((t) => t.text === '−50.8');
    expect(corner).toHaveLength(1);
    // At C (6, -4): beyond the beam's ordinate (straight up) or the column's (straight right).
    const { dx, dy } = corner[0].at;
    expect(Math.min(Math.abs(dx), Math.abs(dy))).toBeLessThan(1e-9);
  });
});

describe('the default result for a thumbnail', () => {
  it('is M for beams and frames, N for trusses, w for a beam free to expand', () => {
    const pick = (id: string) =>
      defaultResultLayer(modelFromSolver(buildAppExample(appExamples.find((e) => e.id === id)!)));
    expect(pick('welcome')).toBe('M');
    expect(pick('portal')).toBe('M');
    expect(pick('pratt')).toBe('N');
    expect(pick('temperature')).toBe('w');
  });
});

describe('truss bar forces', () => {
  it('keeps all 11 forces of the app truss on a 520 × 230 lecture slide', () => {
    const solver = buildAppExample(appExamples.find((e) => e.id === 'pratt')!);
    const layers: PlotLayer[] = ['members', 'supports', 'loads', 'reactions', 'N'];
    const first = scene(solver, layers, { scale: 1 });
    const fit = fitScene(first, { width: 520, height: 230, padding: 6, fontSize: 13 });
    const items = scene(solver, layers, { scale: fit.s });
    const placed = placeLabels(items, fit, { fontSize: 13, viewport: fit });
    const bars = texts(items).filter((t) => t.group === 'N');
    expect(bars).toHaveLength(11);
    expect(bars.every((b) => placed.has(b))).toBe(true);
  });
});

describe('hatching', () => {
  it('draws every ordinate perpendicular to its member', () => {
    const items = scene(buildStepsFrame(), ['members', 'M']);
    const t = { s: 60, tx: 0, ty: 0 };
    const hatch = items.filter((i) => i.kind === 'path' && i.layer === 1 && i.group === 'M');
    expect(hatch.length).toBeGreaterThan(0);
    for (const h of hatch) {
      if (h.kind !== 'path') continue;
      for (let i = 0; i < h.segments.length; i += 2) {
        const a = h.segments[i];
        const b = h.segments[i + 1];
        if (a.op === 'Z' || b.op === 'Z') continue;
        const [x0, y0] = project(t, a.p);
        const [x1, y1] = project(t, b.p);
        // Members here are horizontal or vertical: an ordinate is the other.
        const horizontal = Math.abs(a.p.z - -4) < 1e-9 && Math.abs(y1 - y0) > 0;
        expect(horizontal ? Math.abs(x1 - x0) : Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0))).toBeLessThan(1e-6);
      }
    }
  });
});

describe('every kind of load', () => {
  it('is drawn with its magnitude in the display units', async () => {
    const { LinearStaticSolver } = await import('@edubeam/fem');
    const s = new LinearStaticSolver();
    s.domain.createMaterial(1, { e: 210e9, g: 81e9, alpha: 12e-6, d: 7850 });
    s.domain.createCrossSection(1, { ...S.IPE200 });
    s.domain.createNode(1, [0, 0, 0], [DofID.Dx, DofID.Dz, DofID.Ry]);
    s.domain.createNode(2, [4, 0, 0], []);
    s.domain.createNode(3, [8, 0, 0], [DofID.Dz]);
    s.domain.createBeam2D(1, [1, 2], 1, 1);
    s.domain.createBeam2D(2, [2, 3], 1, 1);
    const lc = s.loadCases[0];
    lc.createNodalLoad(2, { [DofID.Ry]: 5e3 });
    lc.createBeamConcentratedLoad(1, [0, 0, -3e3, 1], true);
    lc.createBeamElementTrapezoidalEdgeLoad(2, [0, 2e3], [0, 6e3], true);
    lc.createBeamElementUniformEdgeLoad(1, [1.5e3, 0], true);
    lc.createBeamTemperatureLoad(2, [10, 5, -5]);
    lc.createPrescribedDisplacement(3, { [DofID.Dz]: 0.004 });
    lc.createPrescribedDisplacement(1, { [DofID.Ry]: 0.002 });
    s.solve();
    const labels = texts(scene(s, ['members', 'supports', 'loads', 'reactions']))
      .filter((t) => t.group === 'loads')
      .map((t) => t.text);
    const nb = '\u202f';
    expect(labels).toEqual(
      expect.arrayContaining([
        `5${nb}kNm`, // nodal moment
        `3${nb}kNm`, // point moment
        `2${nb}kN/m`, // trapezoid, both ends
        `6${nb}kN/m`,
        `q = 1.5${nb}kN/m`, // along the member
        `4${nb}mm`, // settlement
        `2${nb}mrad`, // imposed rotation
      ])
    );
    expect(labels.some((l) => l.startsWith('ΔT = 10') && l.includes('ΔTb − ΔTt = 10'))).toBe(true);
  });

  it('draws the deformed shape with its largest displacement, and every support of the gallery', () => {
    const items = scene(S.cantileverTipLoad(), ['members', 'supports', 'w']);
    const w = texts(items).find((t) => t.group === 'w');
    expect(w?.text).toBe('94.4');
    const gallery = buildStructureScene(modelFromSolver(S.supportGallery()), {
      layers: new Set<PlotLayer>(['members', 'supports', 'nodes', 'nodeLabels', 'dimensions']),
      compact: true,
      units: resolveUnits(),
      scale: 40,
      diagramSize: 26,
      deformedSize: 18,
      momentOnTensionSide: true,
    });
    expect(gallery.filter((i) => i.group === 'supports').length).toBeGreaterThan(20);
    // A chain of spans between the supports, then the overall width
    expect(texts(gallery).filter((t) => t.group === 'dimensions').length).toBeGreaterThan(2);
  });

  it('draws N and V, and M on the compression side when asked', () => {
    const tension = scene(S.simplySupportedUdl(), ['members', 'M'], { momentOnTensionSide: true });
    const compression = scene(S.simplySupportedUdl(), ['members', 'M'], { momentOnTensionSide: false });
    const peak = (items: SceneItem[]) => texts(items).find((t) => t.text.startsWith('54'))!.at.dy;
    expect(peak(tension)).toBeGreaterThan(0);
    expect(peak(compression)).toBeLessThan(0);
    const frame = scene(buildStepsFrame(), ['members', 'N', 'V']);
    expect(texts(frame).some((t) => t.group === 'N')).toBe(true);
    expect(texts(frame).some((t) => t.group === 'V')).toBe(true);
  });
});

describe('every end of a diagram is numbered', () => {
  it('writes an end moment that is neither the largest nor the smallest on its member', () => {
    // 6 m simple beam, 12 kN/m, 10 kNm at A: M runs 10 → 59.4 (inside) → 0, so 10 is no extreme
    const solver = S.simplySupportedUdl();
    solver.loadCases[0].createNodalLoad(1, { [DofID.Ry]: -10e3 });
    solver.solve();
    const labels = texts(scene(solver, ['members', 'M'])).map((t) => t.text);
    expect(labels.some((l) => /^−?10$/.test(l))).toBe(true);
  });
});

describe('labels of results shown one at a time', () => {
  const at = anchor(0, 0, 0, 0);
  const label = (group: string, text: string): SceneText => ({
    kind: 'text',
    group,
    layer: 1,
    text,
    tone: 'moment',
    priority: 6,
    at,
    align: 'middle',
    baseline: 'middle',
  });
  const t = { s: 1, tx: 50, ty: 50 };

  it('do not push each other out', () => {
    const items = [label('M', '54'), label('V', '36')];
    expect(placeLabels(items, t, { fontSize: 13, alternativeGroups: new Set(['M', 'V']) }).size).toBe(2);
  });

  it('still give way to everything else', () => {
    const items = [label('M', '54'), label('loads', '12 kN/m')];
    expect(placeLabels(items, t, { fontSize: 13, alternativeGroups: new Set(['M', 'V']) }).size).toBe(1);
  });
});

describe('a nodal load never lies on a member', () => {
  it('hangs a load at a bottom-chord joint below it, clear of the vertical above', () => {
    const items = scene(S.tutorialTruss(), ['members', 'loads']);
    const loads = texts(items).filter((t) => t.group === 'loads');
    expect(loads).toHaveLength(2);
    // Nodes 2 and 3 carry 30 kN down with a vertical above each: the value sits below the joint
    for (const label of loads) expect(label.at.dy).toBeGreaterThan(0);
  });

  it('still points a load on a beam at the beam from above', () => {
    const solver = S.simplySupportedUdl();
    solver.loadCases[0].createNodalLoad(2, { [DofID.Dz]: 10e3 });
    solver.solve();
    const label = texts(scene(solver, ['members', 'loads'])).find((t) => t.text.startsWith('10'))!;
    expect(label.at.dy).toBeLessThan(0);
  });
});

describe('a point load keeps its value whatever result is reserved', () => {
  it('writes "20 kN" over a step in the shear force', () => {
    const solver = S.simplySupportedPointLoad();
    const all = new Set(['members', 'supports', 'loads', 'reactions', 'N', 'V', 'M', 'w'] as const);
    const items = scene(solver, [...all]);
    const fit = fitScene(items, { width: 680, padding: 6, fontSize: 13, maxHeight: 440 });
    const placed = placeLabels(scene(solver, [...all], { scale: fit.s }), fit, {
      fontSize: 13,
      viewport: fit,
      alternativeGroups: new Set(['N', 'V', 'M', 'w']),
    });
    expect([...placed.values()].some((t) => t.group === 'loads' && t.text.startsWith('20'))).toBe(true);
  });
});

describe('dimensions, as an exercise sheet gives them', () => {
  const dims = (solver: ReturnType<typeof S.overhangingBeam>, layers: PlotLayer[]) =>
    texts(scene(solver, layers))
      .filter((t) => t.group === 'dimensions')
      .map((t) => parseFloat(t.text));

  it('chains the spans, the overhang and a point load, then gives the overall length', () => {
    // A 6 m span with a 2 m overhang, 20 kN at 3.2 m
    expect(dims(S.overhangingBeam(), ['members', 'supports', 'loads', 'dimensions'])).toEqual([3.2, 2.8, 2, 8]);
  });

  it('gives a single span just once', () => {
    expect(dims(S.simplySupportedUdl(), ['members', 'dimensions'])).toEqual([6]);
  });
});

describe("a load's value keeps off the diagrams", () => {
  it('moves q away from the fixed end, where the hogging moment stands over the load', () => {
    const solver = S.fixedFixedUdl();
    const layers: PlotLayer[] = ['members', 'supports', 'loads', 'M'];
    const fit = fitScene(scene(solver, layers), { width: 640, padding: 6, fontSize: 13, maxHeight: 480 });
    const placed = placeLabels(scene(solver, layers, { scale: fit.s }), fit, {
      fontSize: 13,
      viewport: fit,
      alternativeGroups: new Set(['N', 'V', 'M', 'w']),
    });
    const q = [...placed.values()].find((t) => t.group === 'loads');
    expect(q).toBeDefined();
    expect(q!.at.x).toBeGreaterThan(0);
  });
});

describe('steps and peaks are labelled where they are', () => {
  it('writes both sides of the shear step over an inner support', () => {
    const dims = texts(scene(S.continuousBeam(), ['members', 'V'])).map((t) => t.text);
    // 2 × 6 m, 10 kN/m: V = ±37.5 over the middle support
    expect(dims.filter((d) => d === '37.5').length).toBeGreaterThanOrEqual(1);
    expect(dims.filter((d) => d === '−37.5').length).toBeGreaterThanOrEqual(1);
  });

  it('labels the largest deflection in both spans of a symmetric beam', () => {
    const w = texts(scene(S.continuousBeam(), ['members', 'w'])).filter((t) => t.group === 'w');
    expect(w).toHaveLength(2);
    expect(w[0].text).toBe(w[1].text);
  });
});

describe('units: given quantities carry them, results do not', () => {
  it('writes reactions as bare numbers, like the diagram values', () => {
    const items = scene(S.simplySupportedUdl(), ['members', 'supports', 'loads', 'reactions']);
    const reactions = texts(items).filter((t) => t.group === 'reactions');
    expect(reactions.map((t) => t.text)).toEqual(['36', '36']);
    expect(texts(items).some((t) => t.group === 'loads' && t.text.endsWith('kN/m'))).toBe(true);
  });

  it('writes a moment reaction as a bare number too', () => {
    const reactions = texts(scene(S.cantileverTipLoad(), ['members', 'supports', 'reactions'])).filter(
      (t) => t.group === 'reactions'
    );
    expect(reactions.length).toBeGreaterThan(1);
    expect(reactions.every((t) => /^[\d.,]+$/.test(t.text))).toBe(true);
  });
});

describe('reactions as the unknowns of an exercise', () => {
  const names = (solver: ReturnType<typeof S.simplySupportedUdl>, extra = {}) =>
    scene(solver, ['members', 'supports', 'reactions'], { reactionLabels: 'names', ...extra });

  it('names every restrained direction, zero reactions included, with a subscript', () => {
    // A cantilever with a vertical tip load: its horizontal reaction is zero, but still unknown
    const labels = texts(names(S.cantileverTipLoad()))
      .filter((t) => t.group === 'reactions')
      .map((t) => `${t.text}_${t.sub}`);
    expect(labels.sort()).toEqual(['1_x', '1_z', 'M_1']);
  });

  it('points each arrow the way it counts as positive: right, up and counter-clockwise', () => {
    const arrows = names(S.simplySupportedUdl()).filter(
      (i): i is Extract<SceneItem, { kind: 'path' }> =>
        i.kind === 'path' && i.group === 'reactions' && i.fill === 'tone'
    );
    // Each head's tip is its first point; its two back corners lie behind it, against the arrow
    const directions = arrows.map((a) => {
      const [tip, b, c] = a.segments.map((s) => ('p' in s ? s.p : null)).filter((p) => p !== null);
      const back = { x: (b.dx + c.dx) / 2, y: (b.dy + c.dy) / 2 };
      return { x: Math.sign(Math.round(tip.dx - back.x)), y: Math.sign(Math.round(tip.dy - back.y)) };
    });
    // Pin at 1: one to the right, one up; roller at 2: up
    expect(directions).toContainEqual({ x: 1, y: 0 });
    expect(directions.filter((d) => d.x === 0 && d.y === -1)).toHaveLength(2);
    expect(directions.some((d) => d.y === 1 || d.x === -1)).toBe(false);
  });

  it('needs no solution', () => {
    const solver = S.simplySupportedUdl();
    const unsolved = modelFromSolver(solver);
    const model = { ...unsolved, results: undefined };
    const items = buildStructureScene(model, {
      layers: new Set(['members', 'supports', 'reactions'] as const),
      compact: false,
      units: resolveUnits(),
      scale: 60,
      diagramSize: 48,
      deformedSize: 30,
      momentOnTensionSide: true,
      reactionLabels: 'names',
    });
    expect(texts(items).filter((t) => t.group === 'reactions')).toHaveLength(3);
  });

  it('writes values, as before, by default', () => {
    const labels = texts(scene(S.simplySupportedUdl(), ['members', 'supports', 'reactions']))
      .filter((t) => t.group === 'reactions')
      .map((t) => t.text);
    expect(labels).toEqual(['36', '36']);
  });
});

describe('dimension lines as a technical drawing marks them', () => {
  it('puts an oblique stroke where each extension line crosses the dimension line', () => {
    const paths = scene(S.simplySupportedUdl(), ['members', 'dimensions']).filter(
      (i): i is Extract<SceneItem, { kind: 'path' }> => i.kind === 'path' && i.group === 'dimensions'
    );
    const oblique = paths.filter((p) => {
      const [a, b] = p.segments.map((s) => ('p' in s ? s.p : null)).filter((q) => q !== null);
      return Math.abs(Math.abs(b.dx - a.dx) - Math.abs(b.dy - a.dy)) < 1e-9 && b.dx !== a.dx;
    });
    // One span: two stops, two strokes
    expect(oblique).toHaveLength(2);
  });
});

describe('an exercise that turns into its solution', () => {
  it('keeps the drawing still from names to values when both are reserved', async () => {
    const { layoutStructure } = await import('./layout');
    const model = modelFromSolver(S.cantileverTipLoad());
    const layers = new Set(['members', 'supports', 'loads', 'reactions', 'nodeLabels'] as const);
    const base = {
      layers,
      compact: false,
      units: resolveUnits(),
      diagramSize: 48,
      deformedSize: 30,
      momentOnTensionSide: true,
    };
    const box = { width: 640, maxHeight: 300, padding: 6, fontSize: 13 };
    const fit = (reactionLabels: 'names' | 'values', reserve: ('names' | 'values')[]) =>
      layoutStructure(model, { ...base, reactionLabels }, box, layers, undefined, reserve).fit;
    const both: ('names' | 'values')[] = ['names', 'values'];
    const [a, b] = [fit('names', both), fit('values', both)];
    expect([a.s, a.tx, a.ty]).toEqual([b.s, b.tx, b.ty]);
  });
});

describe('an exercise sheet keeps every dimension', () => {
  it('writes the short span by a support even with the reaction names beside it', async () => {
    const { layoutStructure } = await import('./layout');
    // 8 m on a pin and a roller, 10 kN at 1 m: the 1 m span sits right by A's reaction names
    const model = {
      nodes: [
        { id: 'A', x: 0, z: 0, fixity: { dx: true, dz: true, ry: false }, angle: 0 },
        { id: 'B', x: 8, z: 0, fixity: { dx: false, dz: true, ry: false }, angle: 0 },
      ],
      members: [{ id: '1', start: 'A', end: 'B', hinges: [false, false] as [boolean, boolean] }],
      loads: [{ kind: 'pointForce' as const, member: '1', at: 1, fx: 0, fz: 10e3, local: false }],
    };
    const layers = new Set(['members', 'supports', 'loads', 'reactions', 'nodeLabels', 'dimensions'] as const);
    const base = {
      layers,
      compact: false,
      units: resolveUnits(),
      diagramSize: 48,
      deformedSize: 30,
      momentOnTensionSide: true,
    };
    for (const width of [640, 360]) {
      const { resolved } = layoutStructure(
        model,
        { ...base, reactionLabels: 'names' },
        { width, maxHeight: 380, padding: 6, fontSize: 13 }
      );
      const dims = resolved.texts.filter((t) => t.group === 'dimensions').map((t) => t.text);
      expect(dims.sort()).toEqual(['1 m', '7 m', '8 m'].sort());
      expect(resolved.texts.filter((t) => t.group === 'reactions')).toHaveLength(3);
    }
  });
});
