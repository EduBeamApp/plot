import { describe, expect, it } from 'vitest';
import { modelFromSolver } from './fromSolver';
import { PRINT_COLORS, sceneSvg, structureSvg } from './svg';
import * as S from '../testing/structures';

describe('a plot as a standalone SVG file', () => {
  const svg = structureSvg(modelFromSolver(S.simplySupportedUdl()), { title: 'Beam <1> & "q"' });

  it('uses plain colours only, no custom properties or stylesheet', () => {
    expect(svg).not.toContain('var(');
    expect(svg).not.toContain('<style');
    expect(svg).toContain(PRINT_COLORS.moment);
  });

  it('is well-formed: one root, escaped text, a title', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.trim().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('<title>Beam &lt;1&gt; &amp; &quot;q&quot;</title>');
  });

  it('draws the moment diagram and its peak by default, as StructurePlot would', () => {
    expect(svg).toMatch(/>54</);
    // The reactions are results, bare numbers like the diagram's; the load keeps its unit
    expect(svg).toMatch(/>36</);
    expect(svg).toMatch(/kN\/m</);
  });

  it('writes each label twice: halo, then text', () => {
    const peak = svg.split('\n').filter((l) => l.endsWith('>54</text>'));
    expect(peak).toHaveLength(2);
    expect(peak[0]).toContain(`stroke="${PRINT_COLORS.paper}"`);
  });
});

describe('the stages of a build-up as files', () => {
  it('line up when every stage reserves the last one', () => {
    const model = modelFromSolver(S.portalFrame());
    const last = ['members', 'supports', 'loads', 'reactions', 'M'] as const;
    const box = (svg: string) => svg.match(/viewBox="([^"]+)"/)?.[1];
    const first = (svg: string) => svg.match(/<path d="M([\d.]+) ([\d.]+)/)?.slice(1);
    const a = structureSvg(model, { layers: ['members', 'supports'], reserve: last });
    const b = structureSvg(model, { layers: [...last], reserve: last });
    expect(box(a)).toBe(box(b));
    // The first member starts at the same point in both
    expect(first(a)).toEqual(
      first(
        b
          .split('\n')
          .filter((l) => !l.includes('#ff2222'))
          .join('\n')
      )
    );
    expect(a).not.toContain(PRINT_COLORS.moment);
  });
});

describe('subscripts in a file', () => {
  it('writes a reaction name as text and a smaller, lower tspan', () => {
    const svg = structureSvg(modelFromSolver(S.cantileverTipLoad()), {
      layers: ['members', 'supports', 'reactions'],
      reactionLabels: 'names',
    });
    expect(svg).toMatch(/>1<tspan font-size="11\.25" dy="4\.2">x<\/tspan><\/text>/);
    expect(svg).toMatch(/>M<tspan [^>]*>1<\/tspan>/);
  });
});

describe('a scene laid out elsewhere', () => {
  it('is written at its size, layer by layer, with the labels on top', () => {
    const svg = sceneSvg(
      {
        paths: [
          { d: 'M0 0h6v6h-6Z', group: 'nodes', layer: 0, tone: 'ink', width: 0, fill: 'tone' },
          { d: 'M0 0L100 0', group: 'members', layer: 0, tone: 'ink', width: 2 },
        ],
        circles: [],
        texts: [{ x: 50, y: -8, text: 'A & B', anchor: 'middle', group: 'nodeLabels', tone: 'ink' }],
      },
      { width: 120, height: 40 },
      { colors: { ink: '#123456' }, background: false }
    );
    expect(svg).toContain('width="120" height="40" viewBox="0 0 120 40"');
    expect(svg).not.toContain('<rect');
    // Members under the nodes, whatever order they came in
    expect(svg.indexOf('M0 0L100 0')).toBeLessThan(svg.indexOf('M0 0h6v6h-6Z'));
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain('>A &amp; B</text>');
  });
});
