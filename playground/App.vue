<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  DiagramStack,
  StructurePlot,
  modelFromSolver,
  lineDiagram,
  beamLine,
  rowRange,
  type PlotLayer,
  type StackRow,
} from '../src';
import { appExamples, buildAppExample, buildStepsFrame } from '../src/testing/appExamples';
import {
  overhangingBeam,
  prattTruss,
  simplySupportedPointLoad,
  continuousBeam,
  supportGallery,
  rotatedRollerBeam,
} from '../src/testing/structures';

const tiles = appExamples.map((example) => ({ id: example.id, solver: buildAppExample(example) }));
const appPratt = tiles.find((t) => t.id === 'pratt')!.solver;
const pinnedPratt = prattTruss();

/* The website's "four steps" figure: each stage adds layers; the layout is the last stage's. */
const frame = buildStepsFrame();
const STAGES: PlotLayer[][] = [
  ['nodes', 'nodeLabels', 'dimensions'],
  ['nodes', 'nodeLabels', 'members'],
  ['nodes', 'nodeLabels', 'members', 'supports', 'loads'],
  ['nodes', 'nodeLabels', 'members', 'supports', 'loads', 'reactions', 'M'],
];
const RESERVE: PlotLayer[] = [...new Set(STAGES.flat())];
const stage = ref(3);

const readout = ref('');

/* The website's hero: the reader drags P; each position is solved afresh. The rows keep the scale
   of the envelope over every position, so they grow and shrink as P moves. */
const at = ref(3.2);
const heroSolver = computed(() => overhangingBeam(at.value));
const ranges = (() => {
  const r: Partial<Record<StackRow, [number, number]>> = {};
  for (let x = 0; x <= 8 + 1e-9; x += 0.25) {
    const m = modelFromSolver(overhangingBeam(x));
    const line = beamLine(m);
    for (const row of ['V', 'M', 'w'] as const) {
      const [lo, hi] = rowRange(lineDiagram(m, line, row));
      const prev = r[row] ?? [0, 0];
      r[row] = [Math.min(prev[0], lo), Math.max(prev[1], hi)];
    }
  }
  return r;
})();
const pointLoad = simplySupportedPointLoad(6, 20e3, 2);
const twoSpans = continuousBeam(6, 10e3);
const stackReadout = ref('');
const gallery = supportGallery();
const tilted = rotatedRollerBeam(30);

if (new URLSearchParams(location.search).has('dark')) document.documentElement.classList.add('dark');
</script>

<template>
  <h1>@edubeam/plot</h1>

  <h2>The app's six examples, compact, 400 × 200</h2>
  <section id="tiles" class="tiles">
    <figure v-for="t in tiles" :key="t.id" class="tile" :data-case="t.id" style="margin: 0">
      <StructurePlot :solver="t.solver" compact :width="400" :height="200" :animate="false" />
      <figcaption>{{ t.id }}</figcaption>
    </figure>
  </section>

  <h2>The same tiles with resultLabelMode="axis" (values along their ordinates, as the app)</h2>
  <section id="tiles-axis" class="tiles">
    <figure v-for="t in tiles" :key="t.id" class="tile" :data-case-axis="t.id" style="margin: 0">
      <StructurePlot :solver="t.solver" compact result-label-mode="axis" :width="400" :height="200" :animate="false" />
      <figcaption>{{ t.id }} · axis</figcaption>
    </figure>
  </section>

  <h2>Portal frame, both label modes</h2>
  <section id="portal-modes" class="steps">
    <figure v-for="mode in ['horizontal', 'axis'] as const" :key="mode" class="step" style="margin: 0">
      <StructurePlot
        :solver="frame"
        :layers="['members', 'supports', 'loads', 'reactions', 'M']"
        :result-label-mode="mode"
        :width="520"
        :animate="false"
      />
      <figcaption>resultLabelMode = {{ mode }}</figcaption>
    </figure>
  </section>

  <h2>The app's Pratt truss on the website's lecture slide, 520 × 230: every bar force shown</h2>
  <section id="pratt-lecture" class="step" style="width: 520px">
    <StructurePlot
      :solver="appPratt"
      :layers="['members', 'supports', 'loads', 'reactions', 'N']"
      :reserve="['members', 'supports', 'loads', 'reactions', 'N']"
      :width="520"
      :height="230"
      :animate="false"
    />
  </section>

  <h2>
    Support symbols: fixed, pin, roller (Dz), roller (Dx), slider (Dz+Ry), slider (Dx+Ry), rotation; a roller on a 30°
    track
  </h2>
  <section id="supports" class="steps" style="grid-template-columns: 760px 400px">
    <div class="step"><StructurePlot :model="undefined" :solver="gallery" :width="760" :animate="false" /></div>
    <div class="step"><StructurePlot :solver="tilted" :width="400" :animate="false" /></div>
  </section>

  <h2>Pratt truss at slide size, 960 × 540</h2>
  <section id="slide-pratt" class="slide">
    <StructurePlot :solver="appPratt" :width="960" :height="540" :padding="24" :animate="false" />
  </section>

  <h2>Pinned Pratt truss (every bar hinged), slide size</h2>
  <section id="slide-pratt-pinned" class="slide">
    <StructurePlot :solver="pinnedPratt" :width="960" :height="540" :padding="24" :animate="false" />
  </section>

  <h2>Four steps (BuildSteps): the same layout at every stage</h2>
  <section id="steps" class="steps">
    <figure v-for="(layers, i) in STAGES" :key="i" class="step" :data-step="i + 1" style="margin: 0">
      <StructurePlot :solver="frame" :layers="layers" :reserve="RESERVE" :width="520" :height="400" :animate="false" />
      <figcaption>{{ i + 1 }}. {{ layers.join(', ') }}</figcaption>
    </figure>
  </section>

  <h2>Four steps, live: layers fade in, members draw themselves</h2>
  <section id="steps-live" class="step" style="width: 560px">
    <div class="buttons">
      <button v-for="(_, i) in STAGES" :key="i" :data-goto="i" :class="{ on: stage === i }" @click="stage = i">
        {{ i + 1 }}
      </button>
    </div>
    <StructurePlot :solver="frame" :layers="STAGES[stage]" :reserve="RESERVE" :width="560" :height="420" />
  </section>

  <h2>Reading values: hover over a member</h2>
  <section id="hover" class="step" style="width: 560px">
    <StructurePlot
      :solver="frame"
      :layers="['members', 'supports', 'loads', 'M', 'V']"
      :width="560"
      hover
      @readout="(r) => (readout = r ? `${r.member} at ${r.x.toFixed(2)} m` : '')"
    />
    <p class="note">readout event: {{ readout || '—' }}</p>
  </section>

  <h2>DiagramStack: the website's hero, P draggable (pointer or arrow keys)</h2>
  <section id="hero" class="step" style="width: 760px">
    <DiagramStack
      v-model:load-at="at"
      :solver="heroSolver"
      :ranges="ranges"
      :width="760"
      @readout="(r) => (stackReadout = r ? `x = ${r.x.toFixed(2)} m` : '')"
    />
    <p class="note"><i>P</i> at {{ at.toFixed(2) }} m · readout: {{ stackReadout || '—' }}</p>
  </section>

  <h2>DiagramStack, fixed: point load and a continuous beam (N, V, M, w rows)</h2>
  <section id="stack-static" class="steps" style="grid-template-columns: repeat(2, 560px)">
    <div class="step"><DiagramStack :solver="pointLoad" :width="560" :hover="false" /></div>
    <div class="step">
      <DiagramStack :solver="twoSpans" :rows="['V', 'M', 'w']" :width="560" :max-height="460" :hover="false" />
    </div>
  </section>

  <h2>DiagramStack at phone width (360 px)</h2>
  <section id="stack-phone" class="step" style="width: 360px">
    <DiagramStack v-model:load-at="at" :solver="heroSolver" :ranges="ranges" :width="360" />
  </section>
</template>
