/**
 * The textbook structures the tests check by hand and the playground draws. Not part of the
 * package: nothing in src/index.ts imports this.
 *
 * Units are SI. Sections follow docs/en/guide/verification.md of the EduBeam app.
 */
import { DofID, LinearStaticSolver } from '@edubeam/fem';

const { Dx, Dz, Ry } = DofID;
const PIN = [Dx, Dz];
const ROLLER = [Dz];
const FIXED = [Dx, Dz, Ry];

/** IPE 200 in steel: EI = 4.080·10⁶ N·m². */
export const IPE200 = { a: 28.5e-4, iy: 1943e-8, h: 0.2, k: 1 } as const;
export const IPE300 = { a: 53.8e-4, iy: 8356e-8, h: 0.3, k: 1 } as const;
export const STEEL = { e: 210e9, g: 81e9, alpha: 12e-6, d: 7850 } as const;
export const EI_IPE200 = STEEL.e * IPE200.iy;
/**
 * IPE 200 that does not deform in shear: the Euler-Bernoulli beam of the closed-form tables. With
 * the real k = 1 an indeterminate beam's reactions move by a few tenths of a percent.
 */
export const IPE200_NO_SHEAR = { ...IPE200, k: 1e9 } as const;

type Section = { a: number; iy: number; h: number; k: number };

const create = (section: Section = IPE200): LinearStaticSolver => {
  const solver = new LinearStaticSolver();
  solver.domain.createMaterial(1, { ...STEEL });
  solver.domain.createCrossSection(1, { ...section });
  return solver;
};

const lc = (solver: LinearStaticSolver) => solver.loadCases[0];

const done = (solver: LinearStaticSolver): LinearStaticSolver => {
  solver.solve();
  return solver;
};

/** L = 6 m, q = 12 kN/m: R = 36 kN, M = 54 kNm, w = 49.86 mm (Timoshenko). */
export const simplySupportedUdl = (L = 6, q = 12e3, section: Section = IPE200): LinearStaticSolver => {
  const s = create(section);
  s.domain.createNode(1, [0, 0, 0], PIN);
  s.domain.createNode(2, [L, 0, 0], ROLLER);
  s.domain.createBeam2D(1, [1, 2], 1, 1);
  lc(s).createBeamElementUniformEdgeLoad(1, [0, q], true);
  return done(s);
};

/** Three spans in line, 4 m each: 10 kN/m on the first two, then 10 rising to 30 on the last */
export const continuedLoads = (): LinearStaticSolver => {
  const s = create();
  s.domain.createNode(1, [0, 0, 0], PIN);
  s.domain.createNode(2, [4, 0, 0], ROLLER);
  s.domain.createNode(3, [8, 0, 0], ROLLER);
  s.domain.createNode(4, [12, 0, 0], ROLLER);
  s.domain.createBeam2D('a', [1, 2], 1, 1);
  s.domain.createBeam2D('b', [2, 3], 1, 1);
  s.domain.createBeam2D('c', [3, 4], 1, 1);
  lc(s).createBeamElementUniformEdgeLoad('a', [0, 10e3], true);
  lc(s).createBeamElementUniformEdgeLoad('b', [0, 10e3], true);
  lc(s).createBeamElementTrapezoidalEdgeLoad('c', [0, 10e3], [0, 30e3], true);
  return done(s);
};

/** A fixed-base portal, columns `height` tall and `width` apart, pushed sideways at its top */
export const tallPortal = (height = 12, width = 1, push = 15e3): LinearStaticSolver => {
  const s = create();
  s.domain.createNode(1, [0, 0, 0], FIXED);
  s.domain.createNode(2, [0, 0, -height], []);
  s.domain.createNode(3, [width, 0, -height], []);
  s.domain.createNode(4, [width, 0, 0], FIXED);
  s.domain.createBeam2D(1, [1, 2], 1, 1);
  s.domain.createBeam2D(2, [2, 3], 1, 1);
  s.domain.createBeam2D(3, [4, 3], 1, 1);
  lc(s).createNodalLoad(2, { [Dx]: push });
  return done(s);
};

/**
 * A simple beam split at mid-span, as an editor splits one to put a node there: a linearly varying
 * load from 0 to 2q over the whole span, in two parts meeting at q.
 */
export const splitSimpleBeam = (L = 6, q = 12e3): LinearStaticSolver => {
  const s = create();
  s.domain.createNode(1, [0, 0, 0], PIN);
  s.domain.createNode(2, [L / 2, 0, 0], []);
  s.domain.createNode(3, [L, 0, 0], ROLLER);
  s.domain.createBeam2D('1a', [1, 2], 1, 1);
  s.domain.createBeam2D('1b', [2, 3], 1, 1);
  lc(s).createBeamElementTrapezoidalEdgeLoad('1a', [0, 0], [0, q], true);
  lc(s).createBeamElementTrapezoidalEdgeLoad('1b', [0, q], [0, 2 * q], true);
  return done(s);
};

/** L = 4 m, F = 18 kN down at the tip: R = 18 kN, M = 72 kNm, w = 94.42 mm. */
export const cantileverTipLoad = (L = 4, F = 18e3): LinearStaticSolver => {
  const s = create();
  s.domain.createNode(1, [0, 0, 0], FIXED);
  s.domain.createNode(2, [L, 0, 0], []);
  s.domain.createBeam2D(1, [1, 2], 1, 1);
  lc(s).createNodalLoad(2, { [Dz]: F });
  return done(s);
};

export const fixedFixedUdl = (L = 6, q = 12e3): LinearStaticSolver => {
  const s = create();
  s.domain.createNode(1, [0, 0, 0], FIXED);
  s.domain.createNode(2, [L, 0, 0], FIXED);
  s.domain.createBeam2D(1, [1, 2], 1, 1);
  lc(s).createBeamElementUniformEdgeLoad(1, [0, q], true);
  return done(s);
};

export const proppedCantileverUdl = (L = 6, q = 12e3, section: Section = IPE200): LinearStaticSolver => {
  const s = create(section);
  s.domain.createNode(1, [0, 0, 0], FIXED);
  s.domain.createNode(2, [L, 0, 0], ROLLER);
  s.domain.createBeam2D(1, [1, 2], 1, 1);
  if (q !== 0) lc(s).createBeamElementUniformEdgeLoad(1, [0, q], true);
  return done(s);
};

/** Settlement of the roller of an unloaded propped cantilever: R = 3EIw/L³. */
export const proppedCantileverSettlement = (L = 6, w = 0.01): LinearStaticSolver => {
  const s = create();
  s.domain.createNode(1, [0, 0, 0], FIXED);
  s.domain.createNode(2, [L, 0, 0], ROLLER);
  s.domain.createBeam2D(1, [1, 2], 1, 1);
  lc(s).createPrescribedDisplacement(2, { [Dz]: w });
  return done(s);
};

/** Simply supported beam with a point load P at `a` from the left support. */
export const simplySupportedPointLoad = (L = 6, P = 20e3, a = 2): LinearStaticSolver => {
  const s = create();
  s.domain.createNode(1, [0, 0, 0], PIN);
  s.domain.createNode(2, [L, 0, 0], ROLLER);
  s.domain.createBeam2D(1, [1, 2], 1, 1);
  lc(s).createBeamConcentratedLoad(1, [0, P, 0, a], true);
  return done(s);
};

/** Two equal spans under a uniform load: R = 3qL/8, 10qL/8, 3qL/8 and M = −qL²/8 over the middle. */
export const continuousBeam = (L = 6, q = 10e3, section: Section = IPE200): LinearStaticSolver => {
  const s = create(section);
  s.domain.createNode(1, [0, 0, 0], PIN);
  s.domain.createNode(2, [L, 0, 0], ROLLER);
  s.domain.createNode(3, [2 * L, 0, 0], ROLLER);
  s.domain.createBeam2D(1, [1, 2], 1, 1);
  s.domain.createBeam2D(2, [2, 3], 1, 1);
  lc(s).createBeamElementUniformEdgeLoad(1, [0, q], true);
  lc(s).createBeamElementUniformEdgeLoad(2, [0, q], true);
  return done(s);
};

/** The website's hero beam: a 6 m span with a 2 m overhang, 4 kN/m everywhere and 20 kN at `at`. */
export const overhangingBeam = (at = 3.2): LinearStaticSolver => {
  const s = create();
  s.domain.createNode('A', [0, 0, 0], PIN);
  s.domain.createNode('B', [6, 0, 0], ROLLER);
  s.domain.createNode('C', [8, 0, 0], []);
  s.domain.createBeam2D(1, ['A', 'B'], 1, 1);
  s.domain.createBeam2D(2, ['B', 'C'], 1, 1);
  lc(s).createBeamElementUniformEdgeLoad(1, [0, 4e3], true);
  lc(s).createBeamElementUniformEdgeLoad(2, [0, 4e3], true);
  const onFirst = at <= 6;
  lc(s).createBeamConcentratedLoad(onFirst ? 1 : 2, [0, 20e3, 0, onFirst ? at : at - 6], true);
  return done(s);
};

/** Fixed-base portal frame, 6 m by 4 m, with a gravity load on the beam and a wind load at the top. */
export const portalFrame = (): LinearStaticSolver => {
  const s = create(IPE300);
  s.domain.createNode(1, [0, 0, 0], FIXED);
  s.domain.createNode(2, [0, 0, -4], []);
  s.domain.createNode(3, [6, 0, -4], []);
  s.domain.createNode(4, [6, 0, 0], FIXED);
  s.domain.createBeam2D(1, [1, 2], 1, 1);
  s.domain.createBeam2D(2, [2, 3], 1, 1);
  s.domain.createBeam2D(3, [3, 4], 1, 1);
  lc(s).createBeamElementUniformEdgeLoad(2, [0, 10e3], true);
  lc(s).createNodalLoad(2, { [Dx]: 15e3 });
  return done(s);
};

/** The app's tutorial: pins A, E, hinge at C, q = 10 kN/m: V = 40 kN, H = 20 kN, M_B = −80 kNm. */
export const threeHingedFrame = (): LinearStaticSolver => {
  const s = create(IPE300);
  s.domain.createNode('A', [0, 0, 0], PIN);
  s.domain.createNode('B', [0, 0, -4], []);
  s.domain.createNode('C', [4, 0, -4], []);
  s.domain.createNode('D', [8, 0, -4], []);
  s.domain.createNode('E', [8, 0, 0], PIN);
  s.domain.createBeam2D(1, ['A', 'B'], 1, 1);
  s.domain.createBeam2D(2, ['B', 'C'], 1, 1, [false, true]);
  s.domain.createBeam2D(3, ['C', 'D'], 1, 1);
  s.domain.createBeam2D(4, ['D', 'E'], 1, 1);
  lc(s).createBeamElementUniformEdgeLoad(2, [0, 10e3], true);
  lc(s).createBeamElementUniformEdgeLoad(3, [0, 10e3], true);
  return done(s);
};

const TRUSS_BAR = { a: 0.002, iy: 1e-6, h: 0.1, k: 1 };

/** The app's truss tutorial: N15 = −50, N12 = 40, N25 = 30, N56 = −40, N53 = 0 kN. */
export const tutorialTruss = (): LinearStaticSolver => {
  const s = create(TRUSS_BAR);
  const nodes: [number, number, number, DofID[]][] = [
    [1, 0, 0, PIN],
    [2, 4, 0, []],
    [3, 8, 0, []],
    [4, 12, 0, ROLLER],
    [5, 4, -3, []],
    [6, 8, -3, []],
  ];
  for (const [id, x, z, bcs] of nodes) s.domain.createNode(id, [x, 0, z], bcs);
  const bars = [
    [1, 2],
    [2, 3],
    [3, 4],
    [5, 6],
    [1, 5],
    [2, 5],
    [5, 3],
    [3, 6],
    [6, 4],
  ];
  bars.forEach(([a, b], i) => s.domain.createBeam2D(i + 1, [a, b], 1, 1, [true, true]));
  lc(s).createNodalLoad(2, { [Dz]: 30e3 });
  lc(s).createNodalLoad(3, { [Dz]: 30e3 });
  return done(s);
};

/**
 * A Pratt truss: `panels` panels of 3 m, 3 m deep, verticals and diagonals falling toward
 * mid-span so the diagonals are in tension. 20 kN at every inner bottom node.
 */
export const prattTruss = (panels = 6, P = 20e3): LinearStaticSolver => {
  const s = create(TRUSS_BAR);
  const w = 3;
  const h = 3;
  for (let i = 0; i <= panels; i++) {
    s.domain.createNode(`b${i}`, [i * w, 0, 0], i === 0 ? PIN : i === panels ? ROLLER : []);
    if (i > 0 && i < panels) s.domain.createNode(`t${i}`, [i * w, 0, -h], []);
  }
  let bar = 0;
  const add = (a: string, b: string) => s.domain.createBeam2D(++bar, [a, b], 1, 1, [true, true]);
  const top = (i: number) => (i === 0 ? 'b0' : i === panels ? `b${panels}` : `t${i}`);
  for (let i = 0; i < panels; i++) add(`b${i}`, `b${i + 1}`);
  for (let i = 1; i < panels - 1; i++) add(`t${i}`, `t${i + 1}`);
  add('b0', 't1');
  add(`t${panels - 1}`, `b${panels}`);
  for (let i = 1; i < panels; i++) add(`b${i}`, `t${i}`);
  // Diagonals from the top of each vertical down toward the middle.
  const mid = panels / 2;
  for (let i = 1; i < panels - 1; i++) {
    if (i < mid) add(top(i), `b${i + 1}`);
    else add(`b${i}`, top(i + 1));
  }
  for (let i = 1; i < panels; i++) lc(s).createNodalLoad(`b${i}`, { [Dz]: P });
  return done(s);
};

/** Two bars at 45° to an apex 2 m up, 20 kN down at the apex: N = −14.14 kN. */
export const twoBarTruss = (): LinearStaticSolver => {
  const s = create();
  s.domain.createNode(1, [0, 0, 0], PIN);
  s.domain.createNode(2, [4, 0, 0], PIN);
  s.domain.createNode(3, [2, 0, -2], []);
  s.domain.createBeam2D(1, [1, 3], 1, 1, [true, true]);
  s.domain.createBeam2D(2, [3, 2], 1, 1, [true, true]);
  lc(s).createNodalLoad(3, { [Dz]: 20e3 });
  return done(s);
};

/**
 * L = 8 m, ΔTb − ΔTt = −10 K (top warmer). Free to curve: no forces and w = κL²/8 = −4.8 mm.
 * With `restrained`, both ends also hold Ry, and M = EIκ is constant.
 */
export const temperatureBeam = (restrained = false, uniform = 0): LinearStaticSolver => {
  const s = create();
  s.domain.createNode(1, [0, 0, 0], restrained ? FIXED : PIN);
  s.domain.createNode(2, [8, 0, 0], restrained ? [Dz, Ry] : ROLLER);
  s.domain.createBeam2D(1, [1, 2], 1, 1);
  // [ΔTc, ΔTb, ΔTt]
  lc(s).createBeamTemperatureLoad(1, [uniform, 0, 10]);
  return done(s);
};

/** A beam on a pin and a roller whose track is turned by `degrees`. */
export const rotatedRollerBeam = (degrees = 30, L = 6, q = 10e3): LinearStaticSolver => {
  const s = create();
  s.domain.createNode(1, [0, 0, 0], PIN);
  const n2 = s.domain.createNode(2, [L, 0, 0], ROLLER);
  const a = (degrees * Math.PI) / 180;
  n2.updateLcs({ locx: [Math.cos(a), 0, Math.sin(a)], locy: [0, 1, 0] });
  s.domain.createBeam2D(1, [1, 2], 1, 1);
  lc(s).createBeamElementUniformEdgeLoad(1, [0, q], true);
  return done(s);
};

/** One node of each support kind, on short cantilevers off a fixed column, to see every symbol. */
export const supportGallery = (): LinearStaticSolver => {
  const s = create();
  const kinds: DofID[][] = [FIXED, PIN, ROLLER, [Dx], [Dz, Ry], [Dx, Ry], [Ry]];
  kinds.forEach((bcs, i) => {
    s.domain.createNode(`s${i}`, [i * 3, 0, 0], bcs);
    s.domain.createNode(`f${i}`, [i * 3 + 1.5, 0, -1.5], []);
    s.domain.createBeam2D(`m${i}`, [`s${i}`, `f${i}`], 1, 1);
  });
  return s;
};
