/**
 * The six teaching models the EduBeam app ships with, copied from the app's
 * src/utils/examples.ts (`examples`, `buildExampleSolver`) without its viewer flags, so the
 * playground and the tests draw exactly what the app's gallery tiles draw.
 */
import { DofID, LinearStaticSolver } from '@edubeam/fem';

export interface AppExample {
  id: string;
  build: (solver: LinearStaticSolver) => void;
}

/** Cross section stiff in shear, so the examples show pure bending behaviour. */
const EXAMPLE_CROSS_SECTION = { a: 1, iy: 8.356e-5, iz: 1.0, dyz: 999991.0, h: 1, k: 1e32, j: 99999.0 };

const EXAMPLE_MATERIAL = { e: 210000e6, g: 210000e6 / (2 * (1 + 0.2)), alpha: 12.0e-6, d: 4000 };

export const appExamples: AppExample[] = [
  {
    id: 'welcome',
    build: (solver) => {
      const domain = solver.domain;
      domain.createNode('A', [0, 0, 0], [DofID.Dx, DofID.Dz, DofID.Ry]);
      domain.createNode('B', [3, 0, 0], [DofID.Dz]);
      domain.createBeam2D('E1', ['A', 'B'], 1, 1);
      solver.loadCases[0].createBeamElementUniformEdgeLoad('E1', [0, 10000], true);
    },
  },
  {
    id: 'cantilever',
    build: (solver) => {
      const domain = solver.domain;
      domain.createNode('A', [0, 0, 0], [DofID.Dx, DofID.Dz, DofID.Ry]);
      domain.createNode('B', [4, 0, 0], []);
      domain.createBeam2D('E1', ['A', 'B'], 1, 1);
      // Positive z points down: the 18 kN acts downward, as the blurb says.
      solver.loadCases[0].createNodalLoad('B', { [DofID.Dx]: 0, [DofID.Dz]: 18000, [DofID.Ry]: 0 });
    },
  },
  {
    id: 'pratt',
    build: (solver) => {
      const domain = solver.domain;
      const nodes: [string, number[], DofID[]][] = [
        ['A', [0, 0, 0], [DofID.Dx, DofID.Dz]],
        ['B', [3, 0, 0], []],
        ['C', [6, 0, 0], []],
        ['D', [9, 0, 0], [DofID.Dz]],
        ['E', [1.5, 0, -1.8], []],
        ['F', [4.5, 0, -1.8], []],
        ['G', [7.5, 0, -1.8], []],
      ];

      nodes.forEach(([label, coords, dofs]) => domain.createNode(label, coords, dofs));

      const elements: [string, string, string][] = [
        ['E1', 'A', 'B'],
        ['E2', 'B', 'C'],
        ['E3', 'C', 'D'],
        ['E4', 'E', 'F'],
        ['E5', 'F', 'G'],
        ['E6', 'A', 'E'],
        ['E7', 'E', 'B'],
        ['E8', 'B', 'F'],
        ['E9', 'F', 'C'],
        ['E10', 'C', 'G'],
        ['E11', 'G', 'D'],
      ];

      elements.forEach(([label, start, end]) => domain.createBeam2D(label, [start, end], 1, 1));

      ['E', 'F', 'G'].forEach((label) => {
        solver.loadCases[0].createNodalLoad(label, { [DofID.Dx]: 0, [DofID.Dz]: 8000, [DofID.Ry]: 0 });
      });
    },
  },
  {
    id: 'continuous',
    build: (solver) => {
      const domain = solver.domain;
      domain.createNode('A', [0, 0, 0], [DofID.Dx, DofID.Dz]);
      domain.createNode('B', [5, 0, 0], []);
      domain.createNode('C', [11, 0, 0], []);
      domain.createNode('D', [16, 0, 0], [DofID.Dz]);

      domain.createBeam2D('E1', ['A', 'B'], 1, 1);
      domain.createBeam2D('E2', ['B', 'C'], 1, 1);
      domain.createBeam2D('E3', ['C', 'D'], 1, 1);

      solver.loadCases[0].createBeamElementUniformEdgeLoad('E1', [0, 8000], true);
      solver.loadCases[0].createNodalLoad('C', { [DofID.Dx]: 0, [DofID.Dz]: 20000, [DofID.Ry]: 0 });
      solver.loadCases[0].createBeamElementUniformEdgeLoad('E3', [0, 6000], true);
    },
  },
  {
    id: 'portal',
    build: (solver) => {
      const domain = solver.domain;
      domain.createNode('A', [0, 0, 0], [DofID.Dx, DofID.Dz, DofID.Ry]);
      domain.createNode('B', [0, 0, -6], []);
      domain.createNode('C', [8, 0, -6], []);
      domain.createNode('D', [8, 0, 0], [DofID.Dz]);

      domain.createBeam2D('E1', ['A', 'B'], 1, 1);
      domain.createBeam2D('E2', ['B', 'C'], 1, 1);
      domain.createBeam2D('E3', ['C', 'D'], 1, 1);

      solver.loadCases[0].createBeamElementUniformEdgeLoad('E2', [0, 10000], true);
      solver.loadCases[0].createNodalLoad('C', { [DofID.Dx]: -8000, [DofID.Dz]: 10000, [DofID.Ry]: 0 });
    },
  },
  {
    id: 'temperature',
    build: (solver) => {
      const domain = solver.domain;
      domain.createNode('A', [0, 0, 0], [DofID.Dx, DofID.Dz]);
      domain.createNode('B', [8, 0, 0], [DofID.Dz]);

      domain.createBeam2D('E1', ['A', 'B'], 1, 1);

      solver.loadCases[0].createBeamTemperatureLoad('E1', [20, -10, 0]);
    },
  },
];

/** Builds and solves one example into a fresh solver, as the app's gallery does. */
export const buildAppExample = (example: AppExample): LinearStaticSolver => {
  const solver = exampleLibrarySolver();
  example.build(solver);
  solver.solve();
  return solver;
};

/** An empty solver with the examples' material and section as label 1, as the website uses too. */
export const exampleLibrarySolver = (): LinearStaticSolver => {
  const solver = new LinearStaticSolver();
  solver.domain.createCrossSection(1, EXAMPLE_CROSS_SECTION);
  solver.domain.createMaterial(1, EXAMPLE_MATERIAL);
  return solver;
};

/**
 * The website's "four steps" portal frame (BuildSteps.vue): 6 × 4 m, pinned feet A and D,
 * 10 kN/m on the beam and 15 kN to the right at B.
 */
export const buildStepsFrame = (): LinearStaticSolver => {
  const s = exampleLibrarySolver();
  const nodes: [string, number, number][] = [
    ['A', 0, 0],
    ['B', 0, -4],
    ['C', 6, -4],
    ['D', 6, 0],
  ];
  for (const [id, x, z] of nodes)
    s.domain.createNode(id, [x, 0, z], id === 'A' || id === 'D' ? [DofID.Dx, DofID.Dz] : []);
  s.domain.createBeam2D('1', ['A', 'B'], 1, 1);
  s.domain.createBeam2D('2', ['B', 'C'], 1, 1);
  s.domain.createBeam2D('3', ['C', 'D'], 1, 1);
  s.loadCases[0].createBeamElementUniformEdgeLoad('2', [0, 10e3], true);
  s.loadCases[0].createNodalLoad('B', { [DofID.Dx]: 15e3 });
  s.solve();
  return s;
};
