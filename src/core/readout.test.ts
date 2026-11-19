import { describe, expect, it } from 'vitest';
import { modelFromSolver } from './fromSolver';
import { readoutAt, readoutMarks } from './readout';
import * as S from '../testing/structures';

describe('a readout points at the value it reads', () => {
  const model = modelFromSolver(S.simplySupportedUdl());
  // 6 m beam drawn 60 px per metre from (20, 100); 48 px of ordinate for the 54 kNm at mid-span
  const t = { s: 60, tx: 20, ty: 100 };
  const k = { N: 0, V: 0, M: 48 / 54e3, w: 0 };
  const side = { N: -1, V: -1, M: 1 } as const;

  it('finds the member under the pointer, at mid-span', () => {
    const r = readoutAt(model, t, 20 + 180, 104, 18)!;
    expect(r.x).toBeCloseTo(3, 6);
    expect(r.values.M.right).toBeCloseTo(54e3, 0);
  });

  it('marks the tip of the moment ordinate, not the member', () => {
    const r = readoutAt(model, t, 20 + 180, 104, 18)!;
    const [mark] = readoutMarks(model, t, r, ['M'], k, side);
    expect(mark.from[1]).toBeCloseTo(100, 6);
    // Sagging hangs below the beam (screen y down): the tip is 48 px under it
    expect(mark.to[1] - mark.from[1]).toBeCloseTo(48, 3);
    expect(mark.tone).toBe('moment');
  });

  it('marks both tips across a step', () => {
    const stepped = modelFromSolver(S.simplySupportedPointLoad());
    const r = readoutAt(stepped, t, 20 + 120, 100, 18)!;
    const marks = readoutMarks(stepped, t, r, ['V'], { N: 0, V: 1e-3, M: 0, w: 0 }, side);
    expect(marks).toHaveLength(2);
  });
});
