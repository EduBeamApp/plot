<script setup lang="ts">
/**
 * A structure and its results, fitted to the width of its box and drawn at real pixel size: text,
 * symbols and line weights stay the same however large the model is.
 *
 * Every layer the caller may show is laid out up front (`reserve`), so switching layers on fades
 * them in without moving anything already drawn.
 */
import { computed, onBeforeUnmount, onMounted, ref, toRaw, useId, watch } from 'vue';
import { modelFromSolver } from '../core/fromSolver';
import type { PlotModel } from '../core/model';
import { fitScene, placeLabels, resolveScene, textWidth, type SceneItem, type Tone } from '../core/scene';
import {
  buildStructureScene,
  defaultResultLayer,
  PLOT_LAYERS,
  type PlotLayer,
  type ResultLabelMode,
} from '../core/structure';
import { DEFAULT_NUMBER_FORMAT, resolveUnits } from '../core/units';
import { formatReadout, readoutAt, type Readout } from '../core/readout';
import { PLOT_CSS, toneVars } from './theme';
import type { StructurePlotEmits, StructurePlotProps } from './types';

const props = withDefaults(defineProps<StructurePlotProps>(), {
  loadCase: 0,
  revision: 0,
  compact: false,
  padding: 6,
  momentOnTensionSide: true,
  resultLabelMode: 'horizontal',
  animate: true,
  hover: false,
});

const emit = defineEmits<StructurePlotEmits>();

const titleId = useId();

const model = computed((): PlotModel => {
  void props.revision;
  if (props.model) return props.model;
  if (props.solver) return modelFromSolver(toRaw(props.solver), { loadCase: props.loadCase });
  return { nodes: [], members: [], loads: [] };
});

const autoResult = computed(() => defaultResultLayer(model.value));

const shown = computed((): ReadonlySet<PlotLayer> => {
  if (props.layers) return new Set(props.layers);
  const base: PlotLayer[] = ['members', 'supports', 'loads', 'reactions'];
  return new Set(autoResult.value ? [...base, autoResult.value] : base);
});

const reserved = computed((): ReadonlySet<PlotLayer> => new Set([...(props.reserve ?? []), ...shown.value]));

/* ── Size: measured on the client, a fallback for the server ─────────────────────────────── */
const root = ref<HTMLElement | null>(null);
const measured = ref(0);
let observer: ResizeObserver | undefined;
onMounted(() => {
  if (!root.value || typeof ResizeObserver === 'undefined') return;
  observer = new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width);
    if (w > 0) measured.value = w;
  });
  observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());

const width = computed(() => measured.value || props.width || (props.compact ? 400 : 640));
const fontSize = computed(() => props.fontSize ?? (props.compact ? 11.5 : 13));

const options = computed(() => ({
  layers: reserved.value,
  compact: props.compact,
  units: resolveUnits(props.units),
  numberFormat: props.numberFormat ?? DEFAULT_NUMBER_FORMAT,
  diagramSize: props.diagramSize ?? (props.compact ? 26 : 48),
  deformedSize: props.deformedSize ?? (props.compact ? 18 : 30),
  diagramScale: props.diagramScale,
  momentOnTensionSide: props.momentOnTensionSide,
  resultLabelMode: props.resultLabelMode,
  fontSize: fontSize.value,
}));

/**
 * Fit with every label, see which survive, then fit again on those: a label that is dropped for
 * crowding does not shrink the structure. The last pass may bring back any label that now fits.
 */
const layout = computed(() => {
  const box = {
    width: width.value,
    height: props.height,
    maxHeight: props.maxHeight ?? (props.compact ? undefined : Math.max(320, width.value * 0.75)),
    padding: props.padding,
    fontSize: fontSize.value,
  };
  const scene = (s: number, mode: ResultLabelMode = props.resultLabelMode): SceneItem[] =>
    buildStructureScene(model.value, { ...options.value, resultLabelMode: mode, scale: s });
  /** The items a style's fit rests on: everything, with only the labels that survive crowding. */
  const fitItems = (mode: ResultLabelMode): SceneItem[] => {
    const first = scene(1, mode);
    const kept = placeLabels(first, fitScene(first, box), { fontSize: fontSize.value });
    return first.flatMap((item): SceneItem[] => {
      if (item.kind !== 'text') return [item];
      const placed = kept.get(item);
      return placed ? [placed] : [];
    });
  };
  // One fit for every reserved label style, so switching between them leaves the drawing in place
  const modes = [...new Set([props.resultLabelMode, ...(props.reserveLabelModes ?? [])])];
  const fit = fitScene(modes.flatMap(fitItems), box);
  const items = scene(fit.s);
  return { fit, items, resolved: resolveScene(items, fit, { fontSize: fontSize.value, viewport: fit }) };
});

const groups = computed(() =>
  PLOT_LAYERS.filter((layer) => reserved.value.has(layer)).map((layer) => ({
    layer,
    on: shown.value.has(layer),
    paths: layout.value.resolved.paths.filter((p) => p.group === layer),
    circles: layout.value.resolved.circles.filter((c) => c.group === layer),
    texts: layout.value.resolved.texts.filter((t) => t.group === layer),
  }))
);

const colour = (tone: Tone | 'paper') => `var(--ebp-${tone})`;
const rootStyle = computed(() => toneVars(props.colors));

const label = computed(() => {
  if (props.title) return props.title;
  const names: Partial<Record<PlotLayer, string>> = {
    N: 'normal force',
    V: 'shear force',
    M: 'bending moment',
    w: 'deformed shape',
    reactions: 'reactions',
    loads: 'loads',
  };
  const parts = [...shown.value].flatMap((l) => (names[l] ? [names[l]] : []));
  return parts.length > 0 ? `Structure with its ${parts.join(', ')}` : 'Structure';
});

/* ── Reading values: only with `hover`, so a static plot never takes the pointer ─────────── */
const readout = ref<Readout | null>(null);
const svg = ref<SVGSVGElement | null>(null);
const onMove = (e: PointerEvent) => {
  const rect = svg.value?.getBoundingClientRect();
  if (!rect || rect.width === 0) return;
  const px = ((e.clientX - rect.left) / rect.width) * layout.value.fit.width;
  const py = ((e.clientY - rect.top) / rect.height) * layout.value.fit.height;
  readout.value = readoutAt(model.value, layout.value.fit, px, py, 18);
};
const onLeave = () => (readout.value = null);
watch(readout, (value) => emit('readout', value));

const pill = computed(() => {
  const r = readout.value;
  if (!r) return null;
  const units = options.value.units;
  const lines: { tone: Tone; text: string }[] = (['N', 'V', 'M'] as const)
    .filter((q) => shown.value.has(q))
    .map((q) => ({
      tone: ({ N: 'normal', V: 'shear', M: 'moment' } as const)[q],
      text: formatReadout(r, q, units, options.value.numberFormat),
    }));
  if (shown.value.has('w'))
    lines.push({ tone: 'deformed', text: formatReadout(r, 'w', units, options.value.numberFormat) });
  if (lines.length === 0) return null;
  // Bold text runs about 8 % wider than the regular widths `textWidth` estimates.
  const w = Math.max(...lines.map((l) => textWidth(l.text, fontSize.value))) * 1.08 + 16;
  const h = lines.length * (fontSize.value + 5) + 8;
  const right = r.px + 14 + w < layout.value.fit.width;
  const x = right ? r.px + 14 : r.px - 14 - w;
  const y = Math.min(Math.max(4, r.py - h - 10), layout.value.fit.height - h - 4);
  return { x, y, w, h, lines };
});
</script>

<template>
  <div ref="root" class="ebp" :style="rootStyle">
    <svg
      ref="svg"
      class="ebp-svg"
      :class="{ 'ebp-animate': animate, 'ebp-compact': compact }"
      :width="layout.fit.width"
      :height="layout.fit.height"
      :viewBox="`0 0 ${layout.fit.width} ${layout.fit.height}`"
      :font-size="fontSize"
      role="img"
      :aria-labelledby="titleId"
      :style="hover ? { touchAction: 'pan-y pinch-zoom' } : undefined"
      v-on="hover ? { pointermove: onMove, pointerdown: onMove, pointerleave: onLeave } : {}"
    >
      <title :id="titleId">{{ label }}</title>
      <component :is="'style'">{{ PLOT_CSS }}</component>
      <g
        v-for="g in groups"
        :key="g.layer"
        class="ebp-layer"
        :class="[`ebp-layer-${g.layer}`, { 'ebp-on': g.on }]"
        :aria-hidden="g.on ? undefined : 'true'"
      >
        <path
          v-for="(p, i) in g.paths"
          :key="i"
          :d="p.d"
          :class="{ 'ebp-draw': p.draw !== undefined }"
          :pathLength="p.draw !== undefined ? 1 : undefined"
          :style="p.draw !== undefined ? { transitionDelay: `${p.draw * 140}ms` } : undefined"
          :stroke="p.width > 0 ? colour(p.tone) : 'none'"
          :stroke-width="p.width > 0 ? p.width : undefined"
          :stroke-opacity="p.opacity"
          :stroke-dasharray="p.dash"
          :stroke-linecap="p.cap ?? 'round'"
          stroke-linejoin="round"
          :fill="p.fill === 'tone' ? colour(p.tone) : p.fill === 'paper' ? colour('paper') : 'none'"
          :fill-opacity="p.fillOpacity"
        />
        <circle
          v-for="(c, i) in g.circles"
          :key="`c${i}`"
          :cx="c.cx"
          :cy="c.cy"
          :r="c.r"
          :stroke="colour(c.tone)"
          :stroke-width="c.width"
          :fill="c.fill === 'paper' ? colour('paper') : colour(c.tone)"
        />
      </g>
      <g
        v-for="g in groups"
        :key="`t-${g.layer}`"
        class="ebp-layer ebp-labels"
        :class="[`ebp-layer-${g.layer}`, { 'ebp-on': g.on }]"
        :aria-hidden="g.on ? undefined : 'true'"
      >
        <text
          v-for="(t, i) in g.texts"
          :key="i"
          :x="t.x"
          :y="t.y"
          :text-anchor="t.anchor"
          :transform="t.transform"
          :fill="colour(t.tone)"
          :font-weight="t.weight"
          :font-size="t.size"
          v-text="t.text"
        />
      </g>
      <g v-if="pill && readout" class="ebp-readout" pointer-events="none">
        <circle
          :cx="readout.px"
          :cy="readout.py"
          r="4"
          :fill="colour('ink')"
          :stroke="colour('paper')"
          stroke-width="1.5"
        />
        <rect
          :x="pill.x"
          :y="pill.y"
          :width="pill.w"
          :height="pill.h"
          rx="5"
          :fill="colour('paper')"
          :stroke="colour('muted')"
          stroke-opacity="0.5"
        />
        <text
          v-for="(l, i) in pill.lines"
          :key="i"
          :x="pill.x + 8"
          :y="pill.y + 4 + (i + 1) * (fontSize + 5) - 4"
          :fill="colour(l.tone)"
          font-weight="600"
          v-text="l.text"
        />
      </g>
    </svg>
  </div>
</template>
