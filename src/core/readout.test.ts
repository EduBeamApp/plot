import { describe, expect, it } from 'vitest';
import { modelFromSolver } from './fromSolver';
import { placeReadoutTags as placeTags, readMember, readoutAt, readoutMarks } from './readout';
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

describe('readout tags', () => {
  // A horizontal member through (0, 100)-(400, 100); the pointer at x = 200
  const member = [
    [0, 100],
    [400, 100],
  ] as const;
  const at = (dy: number, tone: 'shear' | 'moment' | 'normal') => ({
    tone,
    from: [200, 100] as const,
    to: [200, 100 + dy] as const,
  });

  it('puts each value past its own tip, out along its ordinate, and never on another or the member', () => {
    const tags = placeTags(
      [
        { mark: at(40, 'moment'), text: 'M = 12.5 kNm' },
        { mark: at(36, 'shear'), text: 'V = 8 kN' },
        { mark: at(-30, 'normal'), text: 'N = −20 kN' },
      ],
      'x = 2.4 m',
      member,
      [200, 100],
      12
    );
    expect(tags).toHaveLength(4);
    // Below the member for the values drawn below, above for the one drawn above
    expect(tags[0].y).toBeGreaterThan(140);
    expect(tags[1].y).toBeGreaterThan(140);
    expect(tags[2].y + tags[2].h).toBeLessThan(70);
    for (const [i, a] of tags.entries()) {
      expect(a.y > 100 || a.y + a.h < 100).toBe(true);
      for (const b of tags.slice(i + 1)) {
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
    }
  });
});

describe('readout tags on a column', () => {
  it('lines values whose ordinates share a line up along it, none on another, none moved aside', () => {
    // A vertical member: every ordinate is level, three of them to the right
    const member = [
      [100, 0],
      [100, 300],
    ] as const;
    const mark = (dx: number, tone: 'shear' | 'moment' | 'normal' | 'deformed') => ({
      tone,
      from: [100, 150] as const,
      to: [100 + dx, 150] as const,
    });
    const tags = placeTags(
      [
        { mark: mark(-40, 'moment'), text: 'M = −17.2 kNm' },
        { mark: mark(30, 'normal'), text: 'N = −45.15 kN' },
        { mark: mark(8, 'shear'), text: 'V = 8 kN' },
        { mark: mark(1, 'deformed'), text: 'w = 0 m' },
      ],
      'E1, x = 3 m',
      member,
      [100, 150],
      12
    );
    // Every value's tag on its own ordinate's line: level with the station
    for (const tag of tags.slice(0, 4)) expect(tag.y + tag.h / 2).toBeCloseTo(150, 6);
    for (const [i, a] of tags.entries()) {
      for (const b of tags.slice(i + 1)) {
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
    }
  });
});

describe('reading a member near its ends', () => {
  it("snaps to an end and reads the member's own value there", () => {
    // A cantilever under a tip load: M is −F·L at the wall, zero at the tip
    const model = modelFromSolver(S.cantileverTipLoad(4, 18e3));
    const member = model.members[0];
    const results = model.results!.members[member.id];
    const near = readMember(results, 0.05, 0.1, 4);
    expect(near.x).toBe(0);
    expect(near.values.M.left).toBeCloseTo(near.values.M.right, 9);
    expect(Math.abs(near.values.M.right)).toBeCloseTo(72e3, -1);
    const tip = readMember(results, 3.95, 0.1, 4);
    expect(tip.x).toBe(4);
    expect(Math.abs(tip.values.M.left)).toBeLessThan(1);
    // Mid-member nothing moves
    expect(readMember(results, 2, 0.1, 4).x).toBe(2);
  });
});

describe('reading a member near an extreme', () => {
  it('snaps to the largest moment, where the shear is zero, when the moment is read', () => {
    // A 6 m simply supported beam under 12 kN/m: M = qL²/8 = 54 kNm at mid-span, V = 0 there
    const model = modelFromSolver(S.simplySupportedUdl(6, 12e3));
    const results = model.results!.members[model.members[0].id];
    const r = readMember(results, 3.07, 0.1, 6, ['M']);
    expect(r.x).toBeCloseTo(3, 6);
    expect(Math.abs(r.values.M.right)).toBeCloseTo(54e3, -1);
    expect(Math.abs(r.values.V.right)).toBeLessThan(1);
    // Not when only the shear is read: its extremes are at the supports
    expect(readMember(results, 3.07, 0.1, 6, ['V']).x).toBe(3.07);
  });

  it('snaps to the largest deflection when the deformed shape is read', () => {
    // 20 kN at a = 2 m on a 6 m span: the deflection is largest √(b(b + 2a)/3) = 3.27 m from the
    // far end, x ≈ 2.73 m (a little off with shear deformation)
    const model = modelFromSolver(S.simplySupportedPointLoad(6, 20e3, 2));
    const results = model.results!.members[model.members[0].id];
    expect(readMember(results, 2.68, 0.1, 6, ['w']).x).toBeCloseTo(2.73, 1);
    // Nearer the load, the step under it wins
    expect(readMember(results, 2.04, 0.1, 6, ['w']).x).toBe(2);
  });
});

describe('several extremes within reach', () => {
  it('snap to the largest moment before the largest deflection, even when that is nearer', () => {
    // A 6 m propped cantilever under a UDL: the span moment peaks at 5L/8 = 3.75 m (V = 0), the
    // deflection at 0.5785 L = 3.47 m
    const model = modelFromSolver(S.proppedCantileverUdl(6, 12e3));
    const results = model.results!.members[model.members[0].id];
    const r = readMember(results, 3.6, 0.2, 6, ['w', 'M']);
    expect(r.x).toBeCloseTo(3.75, 2);
    expect(Math.abs(r.values.V.right)).toBeLessThan(1);
    // The deflection's peak alone, when the moment is not read
    expect(readMember(results, 3.6, 0.2, 6, ['w']).x).toBeCloseTo(3.47, 1);
  });
});
