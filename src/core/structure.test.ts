import { describe, expect, it } from 'vitest';
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
    const { DofID, LinearStaticSolver } = await import('@edubeam/fem');
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
    expect(texts(gallery).filter((t) => t.group === 'dimensions')).toHaveLength(2);
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
