/**
 * Cuts a release: `npm run release -- <patch|minor|major|x.y.z> [--dry-run]`.
 *
 * Checks that main is clean and level with origin, runs every check, sets the version in
 * package.json and the lockfile, dates the version's heading in CHANGELOG.md, then commits
 * "release: vX.Y.Z", tags it and pushes both. The tag starts .github/workflows/release.yml, which
 * publishes to npm and creates the GitHub Release. With --dry-run it only says what it would do.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bump = args.find((a) => !a.startsWith('--'));

const fail = (message) => {
  console.error(`release: ${message}`);
  process.exit(1);
};

if (!bump) fail('usage: npm run release -- <patch|minor|major|x.y.z> [--dry-run]');

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const run = (command, ...a) => {
  console.log(`$ ${[command, ...a].join(' ')}`);
  if (!dryRun) execFileSync(command, a, { stdio: 'inherit' });
};

/** The next version: a bump of the current one, or one given outright. */
const nextVersion = (current, how) => {
  const exact = /^\d+\.\d+\.\d+$/;
  if (exact.test(how)) return how;
  if (!exact.test(current)) fail(`cannot bump the version ${current}; give the new one outright`);
  const [major, minor, patch] = current.split('.').map(Number);
  if (how === 'major') return `${major + 1}.0.0`;
  if (how === 'minor') return `${major}.${minor + 1}.0`;
  if (how === 'patch') return `${major}.${minor}.${patch + 1}`;
  return fail(`"${how}" is neither patch, minor, major nor a version x.y.z`);
};

const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

/** CHANGELOG.md with the version's heading dated: its "unreleased" heading, or a new one on top. */
const datedChangelog = (text, version, date) => {
  const unreleased = new RegExp(`^## ${version.replaceAll('.', '\\.')} \\(unreleased\\)\\s*$`, 'mi');
  if (unreleased.test(text)) return text.replace(unreleased, `## ${version} (${date})`);
  if (new RegExp(`^## ${version.replaceAll('.', '\\.')}\\b`, 'm').test(text)) {
    fail(`CHANGELOG.md already has a heading for ${version} that is not "unreleased"`);
  }
  const first = text.search(/^## /m);
  const heading = `## ${version} (${date})\n\n`;
  return first === -1 ? `${text.trimEnd()}\n\n${heading}` : text.slice(0, first) + heading + text.slice(first);
};

// 1. Where we stand: main, nothing uncommitted, level with origin.
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main') fail(`releases are cut from main, not ${branch}`);
if (git('status', '--porcelain') !== '') fail('the working tree has uncommitted changes');
const head = git('rev-parse', 'HEAD');
// ls-remote reads origin without touching any local ref, so a dry run changes nothing.
const remote = git('ls-remote', 'origin', 'refs/heads/main').split(/\s+/)[0];
if (!remote) fail('origin has no main branch');
if (remote !== head)
  fail(`main (${head.slice(0, 7)}) is not level with origin/main (${remote.slice(0, 7)}): pull or push first`);

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = nextVersion(pkg.version, bump);
if (!newer(version, pkg.version) && version !== pkg.version) fail(`${version} is older than ${pkg.version}`);
const tag = `v${version}`;
if (git('tag', '--list', tag) !== '') fail(`the tag ${tag} exists already`);
if (git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`) !== '') fail(`origin has the tag ${tag} already`);

const date = new Date().toISOString().slice(0, 10);
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const dated = datedChangelog(changelog, version, date);

console.log(`${pkg.name}: ${pkg.version} → ${version}${dryRun ? ' (dry run: nothing is changed)' : ''}\n`);

// 2. Every check CI runs, on this very tree.
run('npm', 'run', 'check');

// 3. The version, in package.json and the lockfile alike.
if (version !== pkg.version) run('npm', 'version', version, '--no-git-tag-version');
const headingBefore = changelog.split('\n').find((l) => l.startsWith(`## ${version} `)) ?? '(none)';
console.log(`CHANGELOG.md: ${headingBefore} → ## ${version} (${date})`);
if (!dryRun) writeFileSync('CHANGELOG.md', dated);

// 4. Commit, tag, push: the tag starts the release workflow.
run('git', 'add', 'package.json', 'package-lock.json', 'CHANGELOG.md');
run('git', 'commit', '--message', `release: ${tag}`);
run('git', 'tag', '--annotate', tag, '--message', tag);
run('git', 'push', '--atomic', 'origin', 'main', tag);

console.log(
  dryRun
    ? `\nDry run done. Run it without --dry-run to release ${tag}.`
    : `\nPushed ${tag}. The Release workflow now publishes it to npm and creates the GitHub Release.`
);
