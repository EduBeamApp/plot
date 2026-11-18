/**
 * Registers both components globally: `app.use(EduBeamPlot)`. Optional - importing the components
 * by name is lighter, and a bundler drops this plugin from any build that does not use it.
 */
import type { App, Plugin } from 'vue';
import DiagramStack from './components/DiagramStack.vue';
import StructurePlot from './components/StructurePlot.vue';

export const EduBeamPlot: Plugin = {
  install(app: App) {
    app.component('StructurePlot', StructurePlot);
    app.component('DiagramStack', DiagramStack);
  },
};
