/**
 * vue-tsc writes relative imports in the declarations without a file extension. Bundlers resolve
 * them, but TypeScript under `moduleResolution: node16/nodenext` does not, so a consumer there sees
 * no types. This adds `.js` - which TypeScript maps back to the `.d.ts` beside it - to every
 * relative specifier: `./core/model` becomes `./core/model.js`, `./StructurePlot.vue` becomes
 * `./StructurePlot.vue.js` (declared by `StructurePlot.vue.d.ts`).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.d.ts') ? [path] : [];
  });

const specifier = /(\bfrom\s+|\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"]+?)\2/g;
let changed = 0;
for (const file of files('dist')) {
  const source = readFileSync(file, 'utf8');
  const fixed = source.replace(specifier, (all, lead, quote, path) =>
    path.endsWith('.js') ? all : `${lead}${quote}${path}.js${quote}`
  );
  if (fixed !== source) {
    writeFileSync(file, fixed);
    changed++;
  }
}
console.log(`fix-dts: explicit extensions in ${changed} declaration files`);
