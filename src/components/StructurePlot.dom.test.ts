// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, markRaw } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import StructurePlot from './StructurePlot.vue';
import type { Readout } from '../core/readout';
import type { PlotLayer } from '../core/structure';
import { appExamples, buildAppExample, buildStepsFrame } from '../testing/appExamples';
import { simplySupportedUdl } from '../testing/structures';
import { listenersOf } from '../testing/dom';

const beam = markRaw(simplySupportedUdl());
const frame = markRaw(buildStepsFrame());
const mounted: VueWrapper[] = [];
const plot = (props: Record<string, unknown>) => {
  const w = mount(StructurePlot, { props: { animate: false, ...props }, attachTo: document.body });
  mounted.push(w);
  return w;
};
afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount();
  vi.restoreAllMocks();
});

/** The drawn members' path data: what moves if the layout moves. */
const memberPaths = (w: VueWrapper) => w.findAll('.ebp-layer-members path').map((p) => p.attributes('d'));

describe('StructurePlot', () => {
  it('is an image named by its title', () => {
    const w = plot({ solver: beam });
    const svg = w.get('svg');
    expect(svg.attributes('role')).toBe('img');
    const title = w.get(`[id="${svg.attributes('aria-labelledby')}"]`);
    expect(title.element.tagName.toLowerCase()).toBe('title');
    expect(title.text()).toMatch(/bending moment/);
    expect(w.props('title')).toBeUndefined();
    expect(plot({ solver: beam, title: 'A beam' }).get('title').text()).toBe('A beam');
  });

  it('shows the layers asked for and lays out hidden reserved ones without showing them', () => {
    const w = plot({ solver: frame, layers: ['members', 'supports'], reserve: ['members', 'supports', 'loads', 'M'] });
    const shown = (layer: PlotLayer) => w.find(`g.ebp-layer-${layer}`);
    expect(shown('members').classes()).toContain('ebp-on');
    expect(shown('M').exists()).toBe(true);
    expect(shown('M').classes()).not.toContain('ebp-on');
    expect(shown('M').attributes('aria-hidden')).toBe('true');
    expect(shown('reactions').exists()).toBe(false);
  });

  it('keeps the layout when a reserved layer is switched on', async () => {
    const reserve: PlotLayer[] = ['members', 'supports', 'loads', 'reactions', 'M'];
    const w = plot({ solver: frame, layers: ['members'], reserve });
    const before = memberPaths(w);
    await w.setProps({ layers: reserve });
    expect(w.get('g.ebp-layer-M').classes()).toContain('ebp-on');
    expect(memberPaths(w)).toEqual(before);
  });

  it('draws thumbnails smaller, with the result chosen for the structure', () => {
    const w = plot({ solver: beam, compact: true, width: 400, height: 200 });
    expect(w.get('svg').attributes('font-size')).toBe('11.5');
    expect(w.get('svg').attributes('viewBox')).toBe('0 0 400 200');
    expect(w.get('g.ebp-layer-M').classes()).toContain('ebp-on');
    const truss = plot({ solver: markRaw(buildAppExample(appExamples.find((e) => e.id === 'pratt')!)), compact: true });
    expect(truss.get('g.ebp-layer-N').classes()).toContain('ebp-on');
  });

  it('keeps the drawing still when the label mode switches within reserveLabelModes', async () => {
    const w = plot({
      solver: frame,
      layers: ['members', 'supports', 'loads', 'M'],
      resultLabelMode: 'horizontal',
      reserveLabelModes: ['horizontal', 'axis'],
    });
    const before = memberPaths(w);
    const labelsBefore = w.findAll('.ebp-layer-M text').map((t) => t.attributes('transform') ?? '');
    await w.setProps({ resultLabelMode: 'axis' });
    expect(memberPaths(w)).toEqual(before);
    // The labels themselves did turn.
    const labelsAfter = w.findAll('.ebp-layer-M text').map((t) => t.attributes('transform') ?? '');
    expect(labelsAfter.some((t) => t.includes('rotate(-90'))).toBe(true);
    expect(labelsAfter).not.toEqual(labelsBefore);
  });

  it('reads the member under the pointer with hover, and stops on leave', async () => {
    const w = plot({ solver: beam, layers: ['members', 'M'], hover: true, width: 640 });
    const svg = w.get('svg');
    const width = Number(svg.attributes('width'));
    const height = Number(svg.attributes('height'));
    vi.spyOn(svg.element, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width, height }));
    // The beam's path runs from its start to its end node: read it at mid-span.
    const [x0, y0, x1, y1] = ((memberPaths(w)[0] ?? '').match(/-?[\d.]+/g) ?? []).map(Number);
    await svg.trigger('pointermove', { clientX: (x0 + x1) / 2, clientY: (y0 + y1) / 2 });
    const events = w.emitted('readout') as [Readout | null][];
    const last = events[events.length - 1][0];
    expect(last?.member).toBe('1');
    expect(last?.x).toBeCloseTo(3, 1);
    expect(last?.values.M.right).toBeCloseTo(54e3, -2);
    expect(w.find('.ebp-readout').exists()).toBe(true);
    await svg.trigger('pointerleave');
    const after = w.emitted('readout') as [Readout | null][];
    expect(after[after.length - 1][0]).toBeNull();
  });

  it('gives two plots on a page different ids', () => {
    const page = mount(
      defineComponent({
        render: () => h('div', [h(StructurePlot, { solver: beam }), h(StructurePlot, { solver: frame })]),
      }),
      { attachTo: document.body }
    );
    const ids = page.findAll('[id]').map((e) => e.attributes('id'));
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    page.unmount();
  });

  it('listens to nothing when static, and never to the wheel or touch', () => {
    const quiet = listenersOf(plot({ solver: beam }).get('svg').element);
    expect(quiet).toEqual([]);
    expect(plot({ solver: beam }).get('svg').attributes('style') ?? '').not.toContain('touch-action');

    const reading = listenersOf(plot({ solver: beam, hover: true }).get('svg').element);
    expect(reading).toEqual(expect.arrayContaining(['onPointermove', 'onPointerleave']));
    expect(reading.filter((name) => /wheel|touch|scroll/i.test(name))).toEqual([]);
  });

  it('attaches no listeners of its own outside Vue', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['StructurePlot.vue', 'DiagramStack.vue']) {
      const source = readFileSync(`${process.cwd()}/src/components/${file}`, 'utf8');
      expect(source).not.toMatch(/addEventListener|onwheel|ontouch/);
    }
  });

  it('honours prefers-reduced-motion and can be told not to animate', () => {
    const css = plot({ solver: beam }).get('style').text();
    expect(css).toMatch(
      /@media \(prefers-reduced-motion:reduce\)\{\.ebp-animate \.ebp-layer,\.ebp-animate \.ebp-draw\{transition:none\}\}/
    );
    expect(plot({ solver: beam, animate: true }).get('svg').classes()).toContain('ebp-animate');
    expect(plot({ solver: beam, animate: false }).get('svg').classes()).not.toContain('ebp-animate');
  });

  it('takes plain data as well as a solver', async () => {
    const { modelFromSolver } = await import('../core/fromSolver');
    const model = JSON.parse(JSON.stringify(modelFromSolver(beam)));
    expect(memberPaths(plot({ model, layers: ['members'] }))).toEqual(
      memberPaths(plot({ solver: beam, layers: ['members'] }))
    );
  });
});
