/**
 * The event listeners Vue keeps on an element, by prop name ("onPointermove"). Read from Vue's own
 * record because happy-dom's SVG elements bypass a spy on EventTarget.prototype.
 */
export const listenersOf = (el: Element): string[] => {
  const key = Object.getOwnPropertySymbols(el).find((s) => s.description === '_vei');
  const record = key ? (el as unknown as Record<symbol, Record<string, unknown> | undefined>)[key] : undefined;
  return Object.entries(record ?? {})
    .filter(([, invoker]) => invoker !== undefined)
    .map(([name]) => name);
};
