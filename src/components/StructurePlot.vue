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
import { layoutStructure } from '../core/layout';
import { SUB_DROP, SUB_SCALE, textWidth, type Tone } from '../core/scene';
import {
  defaultResultLayer,
  diagramScales,
  diagramSide,
  isBarStructure,
  PLOT_LAYERS,
  type PlotLayer,
} from '../core/structure';
import { DEFAULT_NUMBER_FORMAT, resolveUnits } from '../core/units';
import { formatReadout, readoutAt, readoutMarks, type Readout, type ReadoutQuantity } from '../core/readout';
import { PLOT_CSS, toneVars } from './theme';
import { usePlotTexts } from './texts';
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
  reactionLabels: props.reactionLabels,
  temperatureSymbols: texts.value.temperature,
  fontSize: fontSize.value,
}));

const layout = computed(() =>
  layoutStructure(
    model.value,
    { ...options.value, resultLabelMode: props.resultLabelMode },
    {
      width: width.value,
      height: props.height,
      maxHeight: props.maxHeight ?? (props.compact ? undefined : Math.max(320, width.value * 0.75)),
      padding: props.padding,
      fontSize: fontSize.value,
    },
    shown.value,
    props.reserveLabelModes ?? [],
    props.reserveReactionLabels ?? []
  )
);

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

const texts = usePlotTexts();
const label = computed(() => props.title || texts.value.structure([...shown.value]));

/* ── Reading values: only with `hover`, so a static plot never takes the pointer ─────────── */
const readout = ref<Readout | null>(null);
const svg = ref<SVGSVGElement | null>(null);
const onMove = (e: PointerEvent) => {
  const rect = svg.value?.getBoundingClientRect();
  if (!rect || rect.width === 0) return;
  const px = ((e.clientX - rect.left) / rect.width) * layout.value.fit.width;
  const py = ((e.clientY - rect.top) / rect.height) * layout.value.fit.height;
  // Within reach of a member, or anywhere over its diagram, which stands up to `diagramSize` off it
  const reach = 18 + (readable.value.length > 0 ? options.value.diagramSize : 0);
  readout.value = readoutAt(model.value, layout.value.fit, px, py, reach);
};
const onLeave = () => (readout.value = null);

/** The results drawn as a curve the readout can point at; a truss's forces are numbers on its bars. */
const readable = computed((): ReadoutQuantity[] =>
  (['N', 'V', 'M', 'w'] as const).filter(
    (q) =>
      shown.value.has(q) &&
      !(q === 'N' && model.value.results && isBarStructure(model.value, model.value.results.members))
  )
);

/** The read values' points on the drawing: each shown diagram's ordinate tip, the deformed point. */
const marks = computed(() => {
  const r = readout.value;
  if (!r) return [];
  const k = diagramScales(model.value, options.value);
  const mot = props.momentOnTensionSide;
  const side = { N: diagramSide('N', mot), V: diagramSide('V', mot), M: diagramSide('M', mot) };
  return readoutMarks(model.value, layout.value.fit, r, readable.value, k, side);
});
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
  // Beside the point the values belong to: the first diagram's tip, else the member point
  const [ax, ay] = marks.value[0]?.to ?? [r.px, r.py];
  const right = ax + 14 + w < layout.value.fit.width;
  const x = right ? ax + 14 : ax - 14 - w;
  const y = Math.min(Math.max(4, ay - h - 10), layout.value.fit.height - h - 4);
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
          :class="{ 'ebp-draw': animate && p.draw !== undefined }"
          :pathLength="animate && p.draw !== undefined ? 1 : undefined"
          :style="animate && p.draw !== undefined ? { transitionDelay: `${p.draw * 140}ms` } : undefined"
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
        <template v-for="(t, i) in g.texts" :key="i">
          <!-- A label with a subscript gets its halo as a text of its own underneath: painted per run,
               the subscript's halo would cover the end of the letter before it -->
          <text
            v-if="t.sub"
            class="ebp-halo"
            aria-hidden="true"
            :x="t.x"
            :y="t.y"
            :text-anchor="t.anchor"
            :transform="t.transform"
            :fill="colour('paper')"
            :font-weight="t.weight"
            :font-size="t.size"
            :font-style="t.italic ? 'italic' : undefined"
          >
            {{ t.text
            }}<tspan :font-size="(t.size ?? fontSize) * SUB_SCALE" :dy="(t.size ?? fontSize) * SUB_DROP">{{
              t.sub
            }}</tspan>
          </text>
          <text
            :class="{ 'ebp-nohalo': t.sub }"
            :x="t.x"
            :y="t.y"
            :text-anchor="t.anchor"
            :transform="t.transform"
            :fill="colour(t.tone)"
            :font-weight="t.weight"
            :font-size="t.size"
            :font-style="t.italic ? 'italic' : undefined"
          >
            {{ t.text
            }}<tspan v-if="t.sub" :font-size="(t.size ?? fontSize) * SUB_SCALE" :dy="(t.size ?? fontSize) * SUB_DROP">{{
              t.sub
            }}</tspan>
          </text>
        </template>
      </g>
      <g v-if="pill && readout" class="ebp-readout" pointer-events="none">
        <circle :cx="readout.px" :cy="readout.py" r="2.5" :fill="colour('ink')" />
        <template v-for="(m, i) in marks" :key="i">
          <line :x1="m.from[0]" :y1="m.from[1]" :x2="m.to[0]" :y2="m.to[1]" :stroke="colour(m.tone)" stroke-width="2" />
          <circle
            :cx="m.to[0]"
            :cy="m.to[1]"
            r="4"
            :fill="colour(m.tone)"
            :stroke="colour('paper')"
            stroke-width="1.5"
          />
        </template>
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
