// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { markRaw } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import DiagramStack from './DiagramStack.vue';
import type { StackReadout } from './types';
import { listenersOf } from '../testing/dom';
import { overhangingBeam } from '../testing/structures';

const solver = markRaw(overhangingBeam(3.2));
const mounted: VueWrapper[] = [];
const stack = (props: Record<string, unknown> = {}) => {
  const w = mount(DiagramStack, { props: { solver, width: 720, ...props }, attachTo: document.body });
  mounted.push(w);
  return w;
};
afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount();
  vi.restoreAllMocks();
});

/** Line metres to figure px at the 720 px fallback width: 60 px gutter left, 20 right, 8 m line. */
const sx = (x: number) => 60 + (x / 8) * 640;

/** Gives the SVG a box on screen the size of its viewBox, as a browser would. */
const onScreen = (w: VueWrapper) => {
  const svg = w.get('svg');
  const [, , width, height] = (svg.attributes('viewBox') ?? '').split(' ').map(Number);
  vi.spyOn(svg.element, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width, height }));
  return { svg, height };
};

const lastLoadAt = (w: VueWrapper) => {
  const events = w.emitted('update:loadAt') as [number][] | undefined;
  return events?.[events.length - 1][0];
};

describe('DiagramStack', () => {
  it('names its rows and is a labelled group', () => {
    const w = stack();
    expect(w.get('svg').attributes('role')).toBe('group');
    expect(w.get('title').text()).toMatch(/shear force, bending moment, deflection/);
    expect(w.findAll('.ebp-math text').map((t) => t.text())).toEqual(['V(x)', 'M(x)', 'w(x)']);
  });

  it('makes the draggable load a keyboard slider', async () => {
    const w = stack({ loadAt: 3.2 });
    const handle = w.get('.ebp-handle');
    expect(handle.attributes()).toMatchObject({
      role: 'slider',
      tabindex: '0',
      'aria-valuemin': '0',
      'aria-valuemax': '8',
      'aria-valuenow': '3.2',
    });
    const keys: [string, number][] = [
      ['ArrowRight', 3.25],
      ['ArrowUp', 3.25],
      ['ArrowLeft', 3.15],
      ['ArrowDown', 3.15],
      ['PageUp', 4.2],
      ['PageDown', 2.2],
      ['Home', 0],
      ['End', 8],
    ];
    for (const [key, expected] of keys) {
      await handle.trigger('keydown', { key });
      expect(lastLoadAt(w)).toBeCloseTo(expected, 9);
    }
    // Keyboard focus shows a ring; the stylesheet keeps it hidden otherwise.
    expect(handle.find('.ebp-focus-ring').exists()).toBe(true);
    expect(w.get('style').text()).toContain('.ebp-handle:focus-visible .ebp-focus-ring{opacity:1}');
    const count = (w.emitted('update:loadAt') ?? []).length;
    await handle.trigger('keydown', { key: 'a' });
    expect((w.emitted('update:loadAt') ?? []).length).toBe(count);
  });

  it('drags the load with the pointer along the load row, rounded to the step', async () => {
    const w = stack({ loadAt: 3.2 });
    const { svg } = onScreen(w);
    await svg.trigger('pointerdown', { clientX: sx(5.01), clientY: 40, pointerId: 1 });
    expect(lastLoadAt(w)).toBeCloseTo(5, 9);
    await svg.trigger('pointermove', { clientX: sx(6.52), clientY: 40, pointerId: 1 });
    expect(lastLoadAt(w)).toBeCloseTo(6.5, 9);
    await svg.trigger('pointerup', { pointerId: 1 });
    const count = (w.emitted('update:loadAt') ?? []).length;
    await svg.trigger('pointermove', { clientX: sx(2), clientY: 40 });
    expect((w.emitted('update:loadAt') ?? []).length).toBe(count);
  });

  it('does not move a load it was not given', async () => {
    const w = stack();
    const { svg } = onScreen(w);
    expect(w.find('.ebp-handle').exists()).toBe(false);
    await svg.trigger('pointerdown', { clientX: sx(5), clientY: 40 });
    expect(w.emitted('update:loadAt')).toBeUndefined();
  });

  it('snaps the cursor to the step under the point load and reads both shear values', async () => {
    const w = stack();
    const { svg, height } = onScreen(w);
    await svg.trigger('pointermove', { clientX: sx(3.23), clientY: height * 0.6 });
    const events = w.emitted('readout') as [StackReadout | null][];
    const r = events[events.length - 1][0];
    expect(r?.x).toBe(3.2);
    expect((r?.values.V?.left ?? 0) - (r?.values.V?.right ?? 0)).toBeCloseTo(20e3, 6);
    expect(w.text()).toContain('→');
    await svg.trigger('pointerleave');
    const after = w.emitted('readout') as [StackReadout | null][];
    expect(after[after.length - 1][0]).toBeNull();
  });

  it('takes no pointer input when neither reading nor dragging, and never the wheel or touch', () => {
    expect(listenersOf(stack({ hover: false }).get('svg').element)).toEqual([]);
    const live = listenersOf(stack({ loadAt: 3.2 }).get('svg').element);
    expect(live).toEqual(expect.arrayContaining(['onPointerdown', 'onPointermove', 'onPointerup']));
    expect(live.filter((name) => /wheel|touch|scroll/i.test(name))).toEqual([]);
    expect(stack({ loadAt: 3.2 }).get('svg').attributes('style')).toContain('touch-action: pan-y pinch-zoom');
  });

  it('refuses a line that is not one horizontal beam', async () => {
    const { buildStepsFrame } = await import('../testing/appExamples');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => mount(DiagramStack, { props: { solver: markRaw(buildStepsFrame()) } })).toThrow(/horizontal/);
    warn.mockRestore();
  });

  it('shrinks its rows to fit maxHeight, down to 60 %', () => {
    const tall = Number(stack().get('svg').attributes('height'));
    const short = Number(stack({ maxHeight: 420 }).get('svg').attributes('height'));
    expect(short).toBeLessThan(tall);
    const floor = Number(stack({ maxHeight: 50 }).get('svg').attributes('height'));
    expect(floor).toBeGreaterThan(tall * 0.5);
  });
});
