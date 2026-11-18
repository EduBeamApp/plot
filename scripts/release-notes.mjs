/**
 * Prints one version's section of CHANGELOG.md, without its heading: the GitHub Release's notes.
 * `node scripts/release-notes.mjs 1.2.3`. Fails when the version has no section.
 */
import { readFileSync } from 'node:fs';

const version = process.argv[2]?.replace(/^v/, '');
if (!version) {
  console.error('usage: node scripts/release-notes.mjs <version>');
  process.exit(1);
}

const lines = readFileSync('CHANGELOG.md', 'utf8').split('\n');
const start = lines.findIndex((l) => new RegExp(`^## ${version.replaceAll('.', '\\.')}( |$)`).test(l));
if (start === -1) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
const notes = lines
  .slice(start + 1, end === -1 ? undefined : end)
  .join('\n')
  .trim();
console.log(notes || `Release ${version}.`);
