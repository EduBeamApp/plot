/**
 * The closed-form cases of the app's docs/en/guide/verification.md and its two tutorials, read
 * through the sampled pieces the drawing is made from.
 */
import { describe, expect, it } from 'vitest';
import { Beam2D } from '@edubeam/fem';
import { modelFromSolver } from './fromSolver';
import type { MemberResults, PlotModel, ReactionDof } from './model';
import { extremes, innerBreaks, pieceDegree, valueAt } from './polynomial';
import * as S from '../testing/structures';

const results = (model: PlotModel, id: string): MemberResults => {
  const r = model.results?.members[id];
  if (!r) throw new Error(`no results for ${id}`);
  return r;
};

const reaction = (model: PlotModel, node: string, dof: ReactionDof): number =>
  model.results?.reactions.find((r) => r.node === node && r.dof === dof)?.value ?? NaN;

const kN = (v: number) => v / 1000;
const mm = (v: number) => v * 1000;

describe('simply supported beam, uniform load (L = 6 m, q = 12 kN/m)', () => {
  const model = modelFromSolver(S.simplySupportedUdl());
  const r = results(model, '1');

  it('has the textbook shear, moment and reactions', () => {
    expect(kN(valueAt(r.V, 0))).toBeCloseTo(36, 9);
    expect(kN(valueAt(r.V, 6))).toBeCloseTo(-36, 9);
    expect(kN(valueAt(r.M, 3))).toBeCloseTo(54, 9);
    // Upward reactions act toward -z.
    expect(kN(reaction(model, '1', 'dz'))).toBeCloseTo(-36, 9);
    expect(kN(reaction(model, '2', 'dz'))).toBeCloseTo(-36, 9);
    expect(reaction(model, '1', 'dx')).toBe(0);
  });

  it('keeps the polynomial degrees: V linear, M quadratic, w quartic', () => {
    expect(pieceDegree(r.V[0])).toBe(1);
    expect(pieceDegree(r.M[0])).toBe(2);
    expect(pieceDegree(r.w[0])).toBe(4);
    expect(pieceDegree(r.N[0])).toBeNull();
  });

  it('finds the moment peak where the shear is zero', () => {
    const e = extremes(r.M)!;
    expect(e.max.x).toBeCloseTo(3, 9);
    expect(kN(e.max.value)).toBeCloseTo(54, 9);
  });

  it('sags 49.86 mm at mid-span (bending 49.63 + shear 0.23)', () => {
    expect(mm(valueAt(r.w, 3))).toBeCloseTo(49.86, 2);
  });

  it('sags 5qL⁴/384EI when the section does not deform in shear', () => {
    const w = valueAt(results(modelFromSolver(S.simplySupportedUdl(6, 12e3, S.IPE200_NO_SHEAR)), '1').w, 3);
    expect(w).toBeCloseTo((5 * 12e3 * 6 ** 4) / (384 * S.EI_IPE200), 9);
  });

  it('matches computeLocalDefl at its grid points', () => {
    const solver = S.simplySupportedUdl();
    const beam = solver.domain.getElement(1);
    if (!(beam instanceof Beam2D)) throw new Error('not a beam');
    const grid = beam.computeLocalDefl(solver.loadCases[0], 10);
    const pieces = results(modelFromSolver(solver), '1');
    grid.w.forEach((w, i) => expect(valueAt(pieces.w, (6 * i) / 10)).toBeCloseTo(w, 12));
  });
});

describe('cantilever, tip load (L = 4 m, F = 18 kN)', () => {
  const model = modelFromSolver(S.cantileverTipLoad());
  const r = results(model, '1');

  it('has the fixing moment and the reaction', () => {
    expect(kN(reaction(model, '1', 'dz'))).toBeCloseTo(-18, 9);
    // The support resists with a counter-clockwise moment.
    expect(kN(reaction(model, '1', 'ry'))).toBeCloseTo(72, 9);
    expect(kN(valueAt(r.M, 0))).toBeCloseTo(-72, 9);
    expect(kN(valueAt(r.V, 2))).toBeCloseTo(18, 9);
  });

  it('deflects 94.42 mm at the tip', () => {
    expect(mm(valueAt(r.w, 4))).toBeCloseTo(94.42, 2);
  });
});

describe('fixed-fixed and propped beams (L = 6 m, q = 12 kN/m)', () => {
  it('fixed-fixed: −qL²/12 at the supports, qL²/24 at mid-span, 10.16 mm', () => {
    const r = results(modelFromSolver(S.fixedFixedUdl()), '1');
    expect(kN(valueAt(r.M, 0))).toBeCloseTo(-36, 9);
    expect(kN(valueAt(r.M, 6))).toBeCloseTo(-36, 9);
    expect(kN(valueAt(r.M, 3))).toBeCloseTo(18, 9);
    expect(mm(valueAt(r.w, 3))).toBeCloseTo(10.16, 2);
  });

  it('propped: 5qL/8 and 3qL/8, and 9qL²/128 at 5L/8 from the fixed end', () => {
    const model = modelFromSolver(S.proppedCantileverUdl(6, 12e3, S.IPE200_NO_SHEAR));
    expect(kN(reaction(model, '1', 'dz'))).toBeCloseTo(-45, 6);
    expect(kN(reaction(model, '2', 'dz'))).toBeCloseTo(-27, 6);
    const r = results(model, '1');
    expect(kN(valueAt(r.M, 0))).toBeCloseTo(-54, 6);
    const e = extremes(r.M)!;
    expect(e.max.x).toBeCloseTo(3.75, 9);
    expect(kN(e.max.value)).toBeCloseTo((9 * 12 * 36) / 128, 6);
  });
});

describe('simply supported beam, point load (L = 6 m, P = 20 kN at 2 m)', () => {
  const r = results(modelFromSolver(S.simplySupportedPointLoad()), '1');

  it('breaks the results at the load', () => {
    expect(innerBreaks(r.V)).toEqual([2]);
    expect(r.M.map(pieceDegree)).toEqual([1, 1]);
  });

  it('has two shear values under the load: Pb/L left, −Pa/L right', () => {
    expect(kN(valueAt(r.V, 2, 'left'))).toBeCloseTo((20 * 4) / 6, 9);
    expect(kN(valueAt(r.V, 2, 'right'))).toBeCloseTo((-20 * 2) / 6, 9);
    expect(kN(valueAt(r.M, 2))).toBeCloseTo((20 * 2 * 4) / 6, 9);
  });
});

describe('continuous beam, two equal spans (L = 6 m, q = 10 kN/m)', () => {
  const model = modelFromSolver(S.continuousBeam(6, 10e3, S.IPE200_NO_SHEAR));

  it('has 3qL/8, 10qL/8, 3qL/8 and −qL²/8 over the middle support', () => {
    expect(kN(reaction(model, '1', 'dz'))).toBeCloseTo(-22.5, 6);
    expect(kN(reaction(model, '2', 'dz'))).toBeCloseTo(-75, 6);
    expect(kN(reaction(model, '3', 'dz'))).toBeCloseTo(-22.5, 6);
    expect(kN(valueAt(results(model, '1').M, 6))).toBeCloseTo(-45, 6);
    expect(kN(valueAt(results(model, '2').M, 0))).toBeCloseTo(-45, 6);
  });

  it('jumps in shear over the middle support by the reaction', () => {
    const left = valueAt(results(model, '1').V, 6, 'left');
    const right = valueAt(results(model, '2').V, 0);
    expect(kN(right - left)).toBeCloseTo(75, 6);
  });
});

describe('two-bar truss', () => {
  const model = modelFromSolver(S.twoBarTruss());

  it('carries −F/(2 sin 45°) in each bar and no bending', () => {
    for (const id of ['1', '2']) {
      const r = results(model, id);
      expect(kN(valueAt(r.N, 1))).toBeCloseTo(-20 / (2 * Math.sin(Math.PI / 4)), 6);
      expect(r.M.every((p) => pieceDegree(p) === null)).toBe(true);
      expect(r.V.every((p) => pieceDegree(p) === null)).toBe(true);
    }
    expect(kN(reaction(model, '1', 'dz'))).toBeCloseTo(-10, 6);
    expect(Math.abs(kN(reaction(model, '1', 'dx')))).toBeCloseTo(10, 6);
  });
});

describe('the truss tutorial', () => {
  const model = modelFromSolver(S.tutorialTruss());
  // Bars as created: 1-2, 2-3, 3-4, 5-6, 1-5, 2-5, 5-3, 3-6, 6-4
  const N = (bar: number) => kN(valueAt(results(model, String(bar)).N, 0.5));

  it('matches the method of joints and of sections', () => {
    expect(N(5)).toBeCloseTo(-50, 6);
    expect(N(1)).toBeCloseTo(40, 6);
    expect(N(6)).toBeCloseTo(30, 6);
    expect(N(4)).toBeCloseTo(-40, 6);
    expect(N(7)).toBeCloseTo(0, 6);
  });
});

describe('three-hinged frame (q = 10 kN/m)', () => {
  const model = modelFromSolver(S.threeHingedFrame());

  it('has V = 40 kN and an inward thrust of 20 kN at both bases', () => {
    expect(kN(reaction(model, 'A', 'dz'))).toBeCloseTo(-40, 6);
    expect(kN(reaction(model, 'E', 'dz'))).toBeCloseTo(-40, 6);
    expect(kN(reaction(model, 'A', 'dx'))).toBeCloseTo(20, 6);
    expect(kN(reaction(model, 'E', 'dx'))).toBeCloseTo(-20, 6);
  });

  it('has −80 kNm at the corners and nothing at the hinge', () => {
    expect(kN(valueAt(results(model, '2').M, 0))).toBeCloseTo(-80, 6);
    expect(kN(valueAt(results(model, '2').M, 4))).toBeCloseTo(0, 6);
    expect(kN(valueAt(results(model, '3').M, 4))).toBeCloseTo(-80, 6);
    expect(kN(valueAt(results(model, '1').N, 2))).toBeCloseTo(-40, 6);
    expect(kN(valueAt(results(model, '2').N, 2))).toBeCloseTo(-20, 6);
  });

  it('lets the hinge sink 43.1 mm', () => {
    expect(mm(valueAt(results(model, '2').w, 4))).toBeCloseTo(43.1, 1);
  });
});

describe('temperature', () => {
  it('curves a free beam up by κL²/8 = 4.8 mm without forces', () => {
    const r = results(modelFromSolver(S.temperatureBeam(false)), '1');
    expect(mm(valueAt(r.w, 4))).toBeCloseTo(-4.8, 9);
    expect(r.M.every((p) => pieceDegree(p) === null)).toBe(true);
  });

  it('gives a constant M = EIκ when the ends cannot turn', () => {
    const r = results(modelFromSolver(S.temperatureBeam(true)), '1');
    const kappa = (12e-6 * 10) / 0.2;
    for (const x of [0, 3, 8]) expect(valueAt(r.M, x)).toBeCloseTo(S.EI_IPE200 * kappa, 6);
    expect(pieceDegree(r.M[0])).toBe(0);
  });

  it('reads the load as ΔTc and ΔTb − ΔTt', () => {
    const load = modelFromSolver(S.temperatureBeam(false, 15)).loads[0];
    expect(load).toEqual({ kind: 'temperature', member: '1', uniform: 15, gradient: -10, source: 'elementLoad:0' });
  });
});

describe('prescribed displacement', () => {
  it('pushes the roller of a propped cantilever down with R ≈ 3EIw/L³', () => {
    const model = modelFromSolver(S.proppedCantileverSettlement());
    const R = (3 * S.EI_IPE200 * 0.01) / 6 ** 3;
    // Timoshenko shear flexibility takes a fraction of a percent off the Euler-Bernoulli value.
    expect(reaction(model, '2', 'dz') / R).toBeCloseTo(1, 2);
    expect(kN(reaction(model, '1', 'ry'))).toBeCloseTo(3.4, 1);
    expect(model.loads).toContainEqual({
      kind: 'prescribed',
      node: '2',
      dx: undefined,
      dz: 0.01,
      ry: undefined,
      source: 'prescribed:0',
    });
  });
});

describe('rotated roller', () => {
  it('reports one reaction across the track, in the node axes', () => {
    const model = modelFromSolver(S.rotatedRollerBeam(30));
    const node = model.nodes.find((n) => n.id === '2')!;
    expect(node.angle).toBeCloseTo(Math.PI / 6, 12);
    const R = reaction(model, '2', 'dz');
    // Its vertical part carries half of q·L = 60 kN.
    expect(kN(R * Math.cos(node.angle))).toBeCloseTo(-30, 6);
    expect(model.results!.reactions.filter((r) => r.node === '2')).toHaveLength(1);
  });
});

describe('an unsolved solver', () => {
  it('gives the model without results', () => {
    const model = modelFromSolver(S.supportGallery());
    expect(model.results).toBeUndefined();
    expect(model.members).toHaveLength(7);
  });
});

describe("the website's four-step portal frame", async () => {
  const { buildStepsFrame } = await import('../testing/appExamples');
  const model = modelFromSolver(buildStepsFrame());

  it('has the corner moments, the sagging peak and the reactions BuildSteps shows', () => {
    expect(kN(valueAt(results(model, '2').M, 0))).toBeCloseTo(9.2, 1);
    expect(kN(valueAt(results(model, '2').M, 6))).toBeCloseTo(-50.8, 1);
    expect(kN(extremes(results(model, '2').M)!.max.value)).toBeCloseTo(29.2, 1);
    expect(kN(reaction(model, 'A', 'dz'))).toBeCloseTo(-20, 1);
    expect(kN(reaction(model, 'D', 'dz'))).toBeCloseTo(-40, 1);
    expect(kN(reaction(model, 'A', 'dx'))).toBeCloseTo(-2.3, 1);
    expect(kN(reaction(model, 'D', 'dx'))).toBeCloseTo(-12.7, 1);
  });
});
