import { describe, expect, it } from 'vitest';
import { groundDirection, supportKind, supportPlacement } from './supports';
import { modelFromSolver } from './fromSolver';
import * as S from '../testing/structures';

describe('supportKind', () => {
  it('names every DOF combination', () => {
    const f = (dx: boolean, dz: boolean, ry: boolean) => supportKind({ dx, dz, ry });
    expect(f(true, true, true)).toBe('fixed');
    expect(f(true, true, false)).toBe('pin');
    expect(f(false, true, false)).toBe('roller');
    expect(f(true, false, false)).toBe('roller');
    expect(f(false, true, true)).toBe('slider');
    expect(f(true, false, true)).toBe('slider');
    expect(f(false, false, true)).toBe('rotation');
    expect(f(false, false, false)).toBe('none');
  });
});

describe('supportPlacement', () => {
  it('stands a pin under a beam and a clamp behind a cantilever', () => {
    const beam = modelFromSolver(S.simplySupportedUdl());
    expect(supportPlacement(beam, beam.nodes[0]).rotation).toBe(0);
    const cantilever = modelFromSolver(S.cantileverTipLoad());
    const g = groundDirection(supportPlacement(cantilever, cantilever.nodes[0]).rotation);
    expect(g.x).toBeCloseTo(-1, 9);
  });

  it('turns a rotated roller with its track', () => {
    const model = modelFromSolver(S.rotatedRollerBeam(30));
    expect(supportPlacement(model, model.nodes[1]).rotation).toBeCloseTo(30, 9);
  });
});
