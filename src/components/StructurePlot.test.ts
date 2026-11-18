import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import StructurePlot from './StructurePlot.vue';
import { appExamples, buildAppExample } from '../testing/appExamples';

const render = (children: () => ReturnType<typeof h>[]) =>
  renderToString(createSSRApp({ render: () => h('div', children()) }));

describe('StructurePlot on the server', () => {
  it('renders without a DOM, at the fallback width, with real pixel sizes', async () => {
    const solver = buildAppExample(appExamples[0]);
    const html = await render(() => [h(StructurePlot, { solver, compact: true, width: 400, height: 200 })]);
    expect(html).toContain('width="400"');
    expect(html).toContain('height="200"');
    expect(html).toContain('viewBox="0 0 400 200"');
    expect(html).toContain('font-size="11.5"');
    expect(html).toContain('kNm');
  });

  it('gives every plot on a page its own ids', async () => {
    const a = buildAppExample(appExamples[0]);
    const b = buildAppExample(appExamples[1]);
    const html = await render(() => [h(StructurePlot, { solver: a }), h(StructurePlot, { solver: b })]);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('takes no pointer input unless asked to read values', async () => {
    const html = await render(() => [h(StructurePlot, { solver: buildAppExample(appExamples[0]) })]);
    expect(html).not.toContain('touch-action');
  });
});
