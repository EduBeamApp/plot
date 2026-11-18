/**
 * Piecewise polynomials: the exact form of every beam result between two points where a point load
 * breaks it. N, V and M are at most cubic and the deflection at most quintic, so a handful of
 * coefficients per piece holds the solver's answer exactly, can be stored as plain JSON, and gives
 * any value, extreme or curve without sampling the solver again.
 */

/**
 * One piece over [x0, x1] (metres along the member), value = Σ c[k]·sᵏ with s = (x − x0)/(x1 − x0).
 * The normalised parameter keeps the fit well conditioned whatever the member's length.
 */
export interface Piece {
  readonly x0: number;
  readonly x1: number;
  readonly c: readonly number[];
}

export type Piecewise = readonly Piece[];

export type Side = 'left' | 'right';

const evalPoly = (c: readonly number[], s: number): number => {
  let value = 0;
  for (let k = c.length - 1; k >= 0; k--) value = value * s + c[k];
  return value;
};

const derivPoly = (c: readonly number[]): number[] => c.slice(1).map((ck, i) => ck * (i + 1));

const span = (piece: Piece): number => piece.x1 - piece.x0;

const param = (piece: Piece, x: number): number => (span(piece) > 0 ? (x - piece.x0) / span(piece) : 0);

export const evalPiece = (piece: Piece, x: number): number => evalPoly(piece.c, param(piece, x));

/** dv/dx in value units per metre. */
export const evalPieceSlope = (piece: Piece, x: number): number =>
  span(piece) > 0 ? evalPoly(derivPoly(piece.c), param(piece, x)) / span(piece) : 0;

/** Solves a small dense system in place by Gaussian elimination with partial pivoting. */
const solveDense = (a: number[][], b: number[]): number[] => {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    for (let row = col + 1; row < n; row++) {
      const f = a[row][col] / a[col][col];
      for (let k = col; k < n; k++) a[row][k] -= f * a[col][k];
      b[row] -= f * b[col];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let k = row + 1; k < n; k++) sum -= a[row][k] * x[k];
    x[row] = sum / a[row][row];
  }
  return x;
};

/**
 * The polynomial of the given degree through `f` on (x0, x1). It samples only interior points
 * (Chebyshev nodes), so a jump at either end - a point load, or the solver returning the value just
 * right of one - never leaks into the piece: its end values are the one-sided limits.
 */
export const fitPiece = (f: (x: number) => number, x0: number, x1: number, degree: number): Piece => {
  const n = degree + 1;
  const nodes = Array.from({ length: n }, (_, k) => (1 - Math.cos(((2 * k + 1) * Math.PI) / (2 * n))) / 2);
  const matrix = nodes.map((s) => Array.from({ length: n }, (_, k) => s ** k));
  const values = nodes.map((s) => f(x0 + s * (x1 - x0)));
  return { x0, x1, c: solveDense(matrix, values) };
};

/** Largest |value| over the pieces, end values and interior extremes included. */
export const maxAbs = (pw: Piecewise): number => {
  let max = 0;
  for (const piece of pw) {
    for (const x of [piece.x0, piece.x1, ...pieceExtrema(piece)]) max = Math.max(max, Math.abs(evalPiece(piece, x)));
  }
  return max;
};

/**
 * Drops coefficients below `tolerance`: the round-off a solved structure leaves in a value that is
 * zero (a truss bar's moment) or a term that is absent (the cubic term of a uniformly loaded span).
 */
export const cleanPiecewise = (pw: Piecewise, tolerance: number): Piecewise =>
  pw.map((piece) => {
    const c = piece.c.map((ck) => (Math.abs(ck) <= tolerance ? 0 : ck));
    while (c.length > 1 && c[c.length - 1] === 0) c.pop();
    return { x0: piece.x0, x1: piece.x1, c };
  });

/** Polynomial degree of a cleaned piece, or null when it is zero throughout. */
export const pieceDegree = (piece: Piece): number | null => {
  for (let k = piece.c.length - 1; k >= 0; k--) if (piece.c[k] !== 0) return k;
  return null;
};

export const isZero = (pw: Piecewise): boolean => pw.every((piece) => pieceDegree(piece) === null);

/**
 * Where the slope is zero inside the piece, in metres. Bisection on a fine grid of the derivative
 * finds every root of a polynomial up to the quintic deflection, to machine precision.
 */
export const pieceExtrema = (piece: Piece): number[] => {
  const d = derivPoly(piece.c);
  if (d.every((dk) => dk === 0)) return [];
  const steps = 64;
  const roots: number[] = [];
  let s0 = 0;
  let d0 = evalPoly(d, s0);
  for (let i = 1; i <= steps; i++) {
    const s1 = i / steps;
    const d1 = evalPoly(d, s1);
    if (d0 === 0 && s0 > 0) roots.push(s0);
    else if (d0 * d1 < 0) {
      let a = s0;
      let b = s1;
      let fa = d0;
      for (let it = 0; it < 80 && b - a > 1e-15; it++) {
        const m = (a + b) / 2;
        const fm = evalPoly(d, m);
        if (fa * fm <= 0) b = m;
        else {
          a = m;
          fa = fm;
        }
      }
      roots.push((a + b) / 2);
    }
    s0 = s1;
    d0 = d1;
  }
  return roots.filter((s) => s > 1e-9 && s < 1 - 1e-9).map((s) => piece.x0 + s * span(piece));
};

/**
 * The value at x. Where two pieces meet there are two values - either side of a point load - and
 * `side` picks one; past the ends the nearest end value is returned.
 */
export const valueAt = (pw: Piecewise, x: number, side: Side = 'right'): number => {
  if (pw.length === 0) return 0;
  const piece = pieceAt(pw, x, side);
  return evalPiece(piece, Math.min(piece.x1, Math.max(piece.x0, x)));
};

export const slopeAt = (pw: Piecewise, x: number, side: Side = 'right'): number => {
  if (pw.length === 0) return 0;
  return evalPieceSlope(pieceAt(pw, x, side), x);
};

const pieceAt = (pw: Piecewise, x: number, side: Side): Piece => {
  const eps = 1e-12 * Math.max(1, Math.abs(pw[pw.length - 1].x1));
  if (side === 'left') {
    for (const piece of pw) if (x <= piece.x1 + eps) return piece;
    return pw[pw.length - 1];
  }
  for (let i = pw.length - 1; i >= 0; i--) if (x >= pw[i].x0 - eps) return pw[i];
  return pw[0];
};

/** The positions where pieces meet, without the two ends. */
export const innerBreaks = (pw: Piecewise): number[] => pw.slice(1).map((piece) => piece.x0);

/** A cubic Bézier in (position, value): start, two controls, end. */
export type CubicSegment = readonly [
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
];

/**
 * The piece as cubic Béziers in (x, value). A piece of degree three or less is one segment and is
 * exact - a cubic Hermite through the end values and slopes is the cubic itself. A higher degree
 * (the deflection under a distributed load) is split into `segments` Hermite cubics.
 */
export const pieceToBeziers = (piece: Piece, segments = 4): CubicSegment[] => {
  const degree = pieceDegree(piece) ?? 0;
  const n = degree <= 3 ? 1 : segments;
  const out: CubicSegment[] = [];
  for (let i = 0; i < n; i++) {
    const a = piece.x0 + (span(piece) * i) / n;
    const b = piece.x0 + (span(piece) * (i + 1)) / n;
    const h = (b - a) / 3;
    const fa = evalPiece(piece, a);
    const fb = evalPiece(piece, b);
    out.push([
      [a, fa],
      [a + h, fa + h * evalPieceSlope(piece, a)],
      [b - h, fb - h * evalPieceSlope(piece, b)],
      [b, fb],
    ]);
  }
  return out;
};

/** Where the piecewise function is largest and smallest, with the side the value is taken from. */
export interface Extreme {
  readonly x: number;
  readonly value: number;
  readonly side: Side;
}

export const extremes = (pw: Piecewise): { max: Extreme; min: Extreme } | null => {
  if (pw.length === 0) return null;
  let max: Extreme = { x: pw[0].x0, value: -Infinity, side: 'right' };
  let min: Extreme = { x: pw[0].x0, value: Infinity, side: 'right' };
  for (const piece of pw) {
    const candidates: [number, Side][] = [
      [piece.x0, 'right'],
      [piece.x1, 'left'],
      ...pieceExtrema(piece).map((x): [number, Side] => [x, 'right']),
    ];
    for (const [x, side] of candidates) {
      const value = evalPiece(piece, x);
      if (value > max.value) max = { x, value, side };
      if (value < min.value) min = { x, value, side };
    }
  }
  return { max, min };
};
