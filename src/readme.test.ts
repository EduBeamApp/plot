/**
 * The README's quick start, run as written: if this fails, the documentation is wrong.
 */
import { expect, test } from 'vitest';
import { createSSRApp, h, markRaw } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { DofID, LinearStaticSolver } from 'ts-fem';
import { StructurePlot, DiagramStack, modelFromSolver, valueAt, extremes } from './index';

test('README quick start', async () => {
  // A 6 m simply supported beam under 12 kN/m, in SI units (m, N, Pa)
  const solver = new LinearStaticSolver();
  solver.domain.createMaterial(1, { e: 210e9, g: 81e9, alpha: 12e-6, d: 7850 });
  solver.domain.createCrossSection(1, { a: 28.5e-4, iy: 1943e-8, h: 0.2, k: 1 });
  solver.domain.createNode(1, [0, 0, 0], [DofID.Dx, DofID.Dz]); // pin
  solver.domain.createNode(2, [6, 0, 0], [DofID.Dz]); // roller
  solver.domain.createBeam2D(1, [1, 2], 1, 1);
  solver.loadCases[0].createBeamElementUniformEdgeLoad(1, [0, 12e3], true); // 12 kN/m, down
  solver.solve();

  const html = await renderToString(
    createSSRApp({
      render: () => [
        h(StructurePlot, { solver: markRaw(solver), layers: ['members', 'supports', 'loads', 'reactions', 'M'] }),
        h(DiagramStack, { solver: markRaw(solver) }),
      ],
    })
  );
  expect(html).toContain('>54<');
  expect(html).toContain('36 kN'.replace(' ', ' '));

  const model = modelFromSolver(solver);
  const M = model.results!.members['1'].M;
  expect(valueAt(M, 3)).toBeCloseTo(54e3, 6);
  expect(extremes(M)!.max.x).toBeCloseTo(3, 9);
  expect(JSON.parse(JSON.stringify(model))).toEqual(model);
});
