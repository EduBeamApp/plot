/**
 * Display units. Values stay SI everywhere else; a unit only says how to show one.
 */

export interface Unit {
  readonly symbol: string;
  /** Display value = SI value × scale (N → kN is 1e-3). */
  readonly scale: number;
}

export interface Units {
  readonly force: Unit;
  readonly moment: Unit;
  readonly distributed: Unit;
  readonly length: Unit;
  readonly displacement: Unit;
  readonly rotation: Unit;
  readonly temperature: Unit;
}

export type UnitKind = keyof Units;

export const SI_UNITS: Units = {
  force: { symbol: 'N', scale: 1 },
  moment: { symbol: 'N·m', scale: 1 },
  distributed: { symbol: 'N/m', scale: 1 },
  length: { symbol: 'm', scale: 1 },
  displacement: { symbol: 'm', scale: 1 },
  rotation: { symbol: 'rad', scale: 1 },
  temperature: { symbol: 'K', scale: 1 },
};

/** kN, kNm and mm: what structural engineering courses read. The default. */
export const KN_UNITS: Units = {
  force: { symbol: 'kN', scale: 1e-3 },
  moment: { symbol: 'kNm', scale: 1e-3 },
  distributed: { symbol: 'kN/m', scale: 1e-3 },
  length: { symbol: 'm', scale: 1 },
  displacement: { symbol: 'mm', scale: 1e3 },
  rotation: { symbol: 'mrad', scale: 1e3 },
  temperature: { symbol: 'K', scale: 1 },
};

export const resolveUnits = (units?: Partial<Units>): Units => ({ ...KN_UNITS, ...units });

/** One decimal, as the website's figures write their values. */
export const DEFAULT_NUMBER_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

/**
 * The number alone, with a true minus sign, and no "-0" for a value that rounds to zero.
 */
export const formatNumber = (value: number, format: Intl.NumberFormat = DEFAULT_NUMBER_FORMAT): string => {
  const parts = format.formatToParts(value);
  const rounded = parts
    .filter((p) => p.type === 'integer' || p.type === 'fraction')
    .map((p) => p.value)
    .join('');
  const isZero = /^[0\D]*$/.test(rounded);
  return parts
    .filter((p) => !(isZero && p.type === 'minusSign'))
    .map((p) => (p.type === 'minusSign' ? '−' : p.value))
    .join('');
};

/** "36 kN": the SI value in the given unit. A narrow no-break space keeps the two together. */
export const formatQuantity = (si: number, unit: Unit, format?: Intl.NumberFormat): string => {
  const number = formatNumber(si * unit.scale, format);
  return unit.symbol ? `${number}\u202f${unit.symbol}` : number;
};
