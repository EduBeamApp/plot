import { describe, expect, it } from 'vitest';
import {
  cleanPiecewise,
  evalPiece,
  extremes,
  fitPiece,
  pieceDegree,
  pieceExtrema,
  pieceToBeziers,
  valueAt,
  type Piecewise,
} from './polynomial';

const cubic = (x: number) => 2 - 3 * x + 0.5 * x * x - 0.25 * x ** 3;

/** A cubic Bézier at parameter t. */
const bezier = (p: readonly (readonly [number, number])[], t: number): [number, number] => {
  const m = 1 - t;
  const w = [m ** 3, 3 * m * m * t, 3 * m * t * t, t ** 3];
  return [w.reduce((s, wi, i) => s + wi * p[i][0], 0), w.reduce((s, wi, i) => s + wi * p[i][1], 0)];
};

describe('fitPiece', () => {
  it('reproduces a cubic exactly from interior samples', () => {
    const piece = fitPiece(cubic, 1, 5, 3);
    for (const x of [1, 1.7, 3, 4.2, 5]) expect(evalPiece(piece, x)).toBeCloseTo(cubic(x), 12);
  });

  it('never samples the ends, so a jump there does not leak in', () => {
    const stepped = (x: number) => (x >= 4 ? 100 : x);
    const piece = fitPiece(stepped, 0, 4, 3);
    expect(evalPiece(piece, 4)).toBeCloseTo(4, 10);
  });

  it('reproduces a quintic', () => {
    const f = (x: number) => x ** 5 - 2 * x ** 3 + x;
    const piece = fitPiece(f, -1, 2, 5);
    for (const x of [-1, 0, 0.5, 2]) expect(evalPiece(piece, x)).toBeCloseTo(f(x), 9);
  });
});

describe('degree and cleaning', () => {
  it('drops round-off terms and reports the true degree', () => {
    const [piece] = cleanPiecewise([fitPiece((x) => 3 * x + 1e-13 * x * x, 0, 2, 3)], 1e-9);
    expect(pieceDegree(piece)).toBe(1);
    const [zero] = cleanPiecewise([fitPiece(() => 1e-14, 0, 2, 3)], 1e-9);
    expect(pieceDegree(zero)).toBeNull();
  });
});

describe('extrema', () => {
  it('finds where a parabola peaks', () => {
    const piece = fitPiece((x) => 36 * x - 6 * x * x, 0, 6, 3);
    const roots = pieceExtrema(piece);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toBeCloseTo(3, 12);
  });

  it('reports the largest and smallest value with the side of a jump', () => {
    const pw: Piecewise = [fitPiece(() => 5, 0, 2, 1), fitPiece(() => -3, 2, 4, 1)];
    const e = extremes(pw)!;
    expect(e.max.value).toBeCloseTo(5);
    expect(e.min.value).toBeCloseTo(-3);
    expect(valueAt(pw, 2, 'left')).toBeCloseTo(5);
    expect(valueAt(pw, 2, 'right')).toBeCloseTo(-3);
  });
});

describe('pieceToBeziers', () => {
  it('draws a cubic as one exact Bézier', () => {
    const piece = fitPiece(cubic, 0, 3, 3);
    const segments = pieceToBeziers(piece);
    expect(segments).toHaveLength(1);
    // Control x are evenly spaced, so the curve's x is linear in t and y must equal f(x).
    for (const t of [0.1, 0.37, 0.5, 0.81]) {
      const [x, y] = bezier(segments[0], t);
      expect(y).toBeCloseTo(cubic(x), 12);
    }
  });

  it('splits a quintic into Hermite cubics that stay on the curve', () => {
    const f = (x: number) => x ** 5 - 2 * x ** 3;
    const piece = fitPiece(f, 0, 2, 5);
    const segments = pieceToBeziers(piece, 8);
    expect(segments).toHaveLength(8);
    for (const seg of segments) {
      const [x, y] = bezier(seg, 0.5);
      // the Hermite error h⁴·max|f⁗|/384 = 0.0025 here, 0.02 % of the 16-unit range
      expect(Math.abs(y - f(x))).toBeLessThan(2.6e-3);
    }
  });
});
