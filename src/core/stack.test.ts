import { describe, expect, it } from 'vitest';
import { modelFromSolver } from './fromSolver';
import { beamLine, lineDiagram, pointLoadAt, rowBreaks, rowPeaks } from './stack';
import { valueAt } from './polynomial';
import * as S from '../testing/structures';
import { buildStepsFrame } from '../testing/appExamples';

describe('beamLine', () => {
  it('joins the spans of a beam left to right', () => {
    const line = beamLine(modelFromSolver(S.overhangingBeam()));
    expect(line.length).toBe(8);
    expect(line.members.map((m) => m.offset)).toEqual([0, 6]);
  });

  it('refuses a frame, which has no single x axis', () => {
    expect(() => beamLine(modelFromSolver(buildStepsFrame()))).toThrow(/horizontal/);
  });
});

describe('lineDiagram', () => {
  const model = modelFromSolver(S.overhangingBeam(3.2));
  const line = beamLine(model);
  const V = lineDiagram(model, line, 'V');

  it('steps at the point load and over the support, with both values', () => {
    expect(rowBreaks(V)).toEqual(expect.arrayContaining([3.2, 6]));
    expect(valueAt(V, 3.2, 'left') - valueAt(V, 3.2, 'right')).toBeCloseTo(20e3, 6);
    // Over B the shear jumps by the reaction.
    const RB = -model.results!.reactions.find((r) => r.node === 'B' && r.dof === 'dz')!.value;
    expect(valueAt(V, 6, 'right') - valueAt(V, 6, 'left')).toBeCloseTo(RB, 6);
  });

  it('finds the movable load and the sagging peak under it', () => {
    expect(pointLoadAt(model, line, 3.2)?.kind).toBe('pointForce');
    const M = rowPeaks(lineDiagram(model, line, 'M'));
    expect(M.find((p) => p.kind === 'max')!.x).toBeCloseTo(3.2, 9);
  });
});
