/**
 * Turns a solver from @edubeam/fem into the plain PlotModel: geometry, supports, loads, and - when the load
 * case is solved - the reactions and every member's results as exact piecewise polynomials.
 */
import {
  Beam2D,
  BeamConcentratedLoad,
  BeamElementTrapezoidalEdgeLoad,
  BeamElementUniformEdgeLoad,
  BeamTemperatureLoad,
  DofID,
  type LoadCase,
  type Node,
  type Solver,
} from '@edubeam/fem';
import type { MemberResults, PlotLoad, PlotModel, PlotNode, PlotReaction, ReactionDof } from './model';
import { cleanPiecewise, fitPiece, maxAbs, type Piecewise } from './polynomial';

export interface FromSolverOptions {
  /** Index into `solver.loadCases`. */
  readonly loadCase?: number;
}

/** Internal forces are at most cubic along a member, displacements at most quintic. */
const FORCE_DEGREE = 3;
const DISPLACEMENT_DEGREE = 5;

/** Coefficients below this share of the structure's largest value are round-off. */
const RELATIVE_ZERO = 1e-9;

/**
 * Floors for the same, in N, N·m and m. When a quantity is round-off everywhere - the moment in a
 * truss, every force in a beam that is free to expand - its own largest value is round-off too.
 */
const ABSOLUTE_ZERO = { force: 1e-6, moment: 1e-6, displacement: 1e-12 } as const;

const DOF_NAMES: Partial<Record<DofID, ReactionDof>> = { [DofID.Dx]: 'dx', [DofID.Dz]: 'dz', [DofID.Ry]: 'ry' };

const nodeAngle = (node: Node): number => (node.hasLcs() ? Math.atan2(node.lcs[0][2], node.lcs[0][0]) : 0);

const toPlotNode = (node: Node): PlotNode => ({
  id: node.label,
  x: node.coords[0],
  z: node.coords[2],
  fixity: { dx: node.bcs.has(DofID.Dx), dz: node.bcs.has(DofID.Dz), ry: node.bcs.has(DofID.Ry) },
  angle: nodeAngle(node),
});

/** The solver hands back a number, an array or a mathjs matrix depending on how many DOFs there are. */
const toNumbers = (values: unknown): number[] => {
  if (typeof values === 'number') return [values];
  if (Array.isArray(values)) return values.flatMap((v: unknown) => toNumbers(v));
  if (typeof values === 'object' && values !== null && 'toArray' in values && typeof values.toArray === 'function') {
    return toNumbers((values.toArray as () => unknown).call(values));
  }
  throw new Error('Unexpected reaction value from the solver');
};

/** A load given in the node's own axes, turned into global components for the drawing. */
const nodalToGlobal = (node: Node, fx: number, fz: number, inNodeAxes: boolean): { fx: number; fz: number } => {
  if (!inNodeAxes || !node.hasLcs()) return { fx, fz };
  const [lx, , lz] = node.lcs;
  return { fx: fx * lx[0] + fz * lz[0], fz: fx * lx[2] + fz * lz[2] };
};

const extractLoads = (solver: Solver, lc: LoadCase): PlotLoad[] => {
  const loads: PlotLoad[] = [];

  for (const nl of lc.nodalLoadList) {
    const node = solver.domain.getNode(nl.target);
    const fx = nl.values[DofID.Dx] ?? 0;
    const fz = nl.values[DofID.Dz] ?? 0;
    const my = nl.values[DofID.Ry] ?? 0;
    if (fx !== 0 || fz !== 0)
      loads.push({ kind: 'nodalForce', node: nl.target, ...nodalToGlobal(node, fx, fz, nl.lcs) });
    if (my !== 0) loads.push({ kind: 'nodalMoment', node: nl.target, my });
  }

  for (const el of lc.elementLoadList) {
    if (el instanceof BeamElementUniformEdgeLoad) {
      const q = { fx: el.values[0] ?? 0, fz: el.values[1] ?? 0 };
      loads.push({ kind: 'distributed', member: el.target, start: q, end: q, local: el.lcs });
    } else if (el instanceof BeamElementTrapezoidalEdgeLoad) {
      loads.push({
        kind: 'distributed',
        member: el.target,
        start: { fx: el.startValues[0], fz: el.startValues[1] },
        end: { fx: el.endValues[0], fz: el.endValues[1] },
        local: el.lcs,
      });
    } else if (el instanceof BeamConcentratedLoad) {
      const [fx = 0, fz = 0, my = 0, at = 0] = el.values;
      if (fx !== 0 || fz !== 0) loads.push({ kind: 'pointForce', member: el.target, at, fx, fz, local: el.lcs });
      if (my !== 0) loads.push({ kind: 'pointMoment', member: el.target, at, my });
    } else if (el instanceof BeamTemperatureLoad) {
      const [uniform = 0, bottom = 0, top = 0] = el.values;
      loads.push({ kind: 'temperature', member: el.target, uniform, gradient: bottom - top });
    }
  }

  for (const pd of lc.prescribedBC) {
    const v = pd.prescribedValues;
    loads.push({ kind: 'prescribed', node: pd.target, dx: v[DofID.Dx], dz: v[DofID.Dz], ry: v[DofID.Ry] });
  }

  return loads;
};

/** Where point loads break a member's results into pieces, ends included. */
const memberBreaks = (beam: Beam2D, lc: LoadCase, length: number): number[] => {
  const tolerance = 1e-9 * length;
  const breaks = [0, length];
  for (const load of lc.getElementLoadsOnElement(beam.label)) {
    if (!(load instanceof BeamConcentratedLoad)) continue;
    const at = load.values[3] ?? 0;
    if (at > tolerance && at < length - tolerance && breaks.every((b) => Math.abs(b - at) > tolerance)) breaks.push(at);
  }
  return breaks.sort((a, b) => a - b);
};

/**
 * Local displacements at xi ∈ [0, 1], as `computeLocalDefl` builds them, but at any point rather
 * than on an even grid - so a piece can end exactly under a point load, where the slope kinks.
 */
const localDisplacement = (beam: Beam2D, lc: LoadCase) => {
  const r = beam.computeEndDisplacement(lc);
  const end = [0, 1, 2, 3, 4, 5].map((i) => r.get([i]) as number);
  const loads = lc.getElementLoadsOnElement(beam.label);
  return (xi: number): { u: number; w: number } => {
    const s = beam.computeEndShapes(xi);
    let w = s[0] * end[1] + s[1] * end[2] + s[2] * end[4] + s[3] * end[5];
    let u = (1 - xi) * end[0] + xi * end[3];
    for (const load of loads) {
      const c = load.computeBeamDeflectionContrib(xi);
      u += c.u;
      w += c.w;
    }
    return { u, w };
  };
};

const memberResults = (beam: Beam2D, lc: LoadCase): MemberResults => {
  const { l } = beam.computeGeo();
  const breaks = memberBreaks(beam, lc, l);
  const displacement = localDisplacement(beam, lc);
  const pieces = (f: (x: number) => number, degree: number): Piecewise =>
    breaks.slice(1).map((x1, i) => fitPiece(f, breaks[i], x1, degree));

  return {
    N: pieces((x) => beam.computeNormalForceAt(lc, x), FORCE_DEGREE),
    V: pieces((x) => beam.computeShearForceAt(lc, x), FORCE_DEGREE),
    M: pieces((x) => beam.computeBendingMomentAt(lc, x), FORCE_DEGREE),
    u: pieces((x) => displacement(x / l).u, DISPLACEMENT_DEGREE),
    w: pieces((x) => displacement(x / l).w, DISPLACEMENT_DEGREE),
  };
};

/** Zeroes round-off against the largest value of the same quantity anywhere in the structure. */
const cleanResults = (members: Record<string, MemberResults>): Record<string, MemberResults> => {
  const keys = ['N', 'V', 'M', 'u', 'w'] as const;
  const all = Object.values(members);
  const scale = Object.fromEntries(keys.map((k) => [k, Math.max(0, ...all.map((m) => maxAbs(m[k])))]));
  // u and w share a scale: a bar that only stretches still has a w of round-off size.
  const displacementScale = Math.max(scale.u, scale.w);
  const tolerance = (k: (typeof keys)[number]): number => {
    if (k === 'u' || k === 'w') return Math.max(RELATIVE_ZERO * displacementScale, ABSOLUTE_ZERO.displacement);
    return Math.max(RELATIVE_ZERO * scale[k], k === 'M' ? ABSOLUTE_ZERO.moment : ABSOLUTE_ZERO.force);
  };
  return Object.fromEntries(
    Object.entries(members).map(([id, r]) => [
      id,
      {
        N: cleanPiecewise(r.N, tolerance('N')),
        V: cleanPiecewise(r.V, tolerance('V')),
        M: cleanPiecewise(r.M, tolerance('M')),
        u: cleanPiecewise(r.u, tolerance('u')),
        w: cleanPiecewise(r.w, tolerance('w')),
      },
    ])
  );
};

const extractReactions = (solver: Solver, lc: LoadCase, connected: ReadonlySet<string>): PlotReaction[] => {
  const reactions: PlotReaction[] = [];
  const values: number[] = [];
  for (const node of solver.domain.nodes.values()) {
    if (node.bcs.size === 0 || !connected.has(node.label)) continue;
    // In the node's own axes, so a rotated roller has one reaction across its track, not two.
    const r = node.getReactions(lc, false);
    const numbers = toNumbers(r.values);
    r.dofs.forEach((dof, i) => {
      const name = DOF_NAMES[dof as DofID];
      if (name) {
        reactions.push({ node: node.label, dof: name, value: numbers[i] });
        values.push(Math.abs(numbers[i]));
      }
    });
  }
  const zero = Math.max(RELATIVE_ZERO * Math.max(0, ...values), ABSOLUTE_ZERO.force);
  return reactions.map((r) => (Math.abs(r.value) <= zero ? { ...r, value: 0 } : r));
};

/** Reads a solver into plain data. Results are included only for a solved load case. */
export const modelFromSolver = (solver: Solver, options: FromSolverOptions = {}): PlotModel => {
  const lc = solver.loadCases[options.loadCase ?? 0];
  if (!lc) throw new Error(`The solver has no load case ${options.loadCase ?? 0}`);

  const beams = [...solver.domain.elements.values()].filter((e): e is Beam2D => e instanceof Beam2D);
  const connected = new Set(beams.flatMap((b) => b.nodes));

  const model: PlotModel = {
    nodes: [...solver.domain.nodes.values()].map(toPlotNode),
    members: beams.map((b) => ({
      id: b.label,
      start: b.nodes[0],
      end: b.nodes[1],
      hinges: [b.hinges[0], b.hinges[1]],
    })),
    loads: extractLoads(solver, lc),
  };

  if (!lc.solved) return model;

  const members = cleanResults(Object.fromEntries(beams.map((b) => [b.label, memberResults(b, lc)])));
  return { ...model, results: { members, reactions: extractReactions(solver, lc, connected) } };
};
