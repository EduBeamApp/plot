import { describe, expect, it } from 'vitest';
import { createApp } from 'vue';
import { DiagramStack, EduBeamPlot, StructurePlot } from './index';

describe('EduBeamPlot', () => {
  it('registers both components globally', () => {
    const app = createApp({ render: () => null }).use(EduBeamPlot);
    expect(app.component('StructurePlot')).toBe(StructurePlot);
    expect(app.component('DiagramStack')).toBe(DiagramStack);
  });
});
