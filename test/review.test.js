import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fixture } from '../scripts/fixture.js';
import { parsePullUrl } from '../src/github.js';
import { updateReview } from '../src/workspace.js';

function setup(t) {
  const f = fixture();
  t.after(f.clean);
  const options = { input: f.input, root: f.root };
  const apply = (revision, overrides) =>
    updateReview({ ...options, ...overrides }, { ...f, getPull: async () => revision });
  const session = join(f.root, 'fixture/project/1');
  return { ...f, options, apply, session, first: { base: f.base, head: f.head } };
}

test('accepts only GitHub PR URLs and normalizes the workspace identity', () => {
  assert.equal(parsePullUrl('https://github.com/Example/Repo/pull/12/').key, 'example/repo/12');
  for (const bad of [
    'https://example.test/a/b/pull/1', 'http://github.com/a/b/pull/1',
    'https://github.com/a/b/pull/1?token=mock', 'https://user@github.com/a/b/pull/1',
    'https://github.com/a/b/pull/1/files', 'https://github.com/a/b/pull/1#example',
    'https://github.com/a/%2e%2e/pull/1', 'https://github.com/a/b/pull/9007199254740992',
  ]) assert.throws(() => parsePullUrl(bad), /GitHub pull request URL/);
});

test('opens the pinned head without touching existing tracked or untracked edits', async (t) => {
  const f = setup(t);
  const status = f.command('status', '--porcelain');
  const result = await f.apply(f.first);
  assert.equal(f.git(result.worktree, 'rev-parse', 'HEAD').trim(), f.head);
  assert.equal(f.git(result.worktree, 'status', '--porcelain').trim(), '');
  const diff = f.git(result.worktree, 'diff', f.mergeBase, f.head);
  assert.match(diff, /Math\.floor/);
  assert.doesNotMatch(diff, /Independent base change|Local edit in progress|Untracked working notes/);
  const brief = readFileSync(result.brief, 'utf8');
  assert.ok(brief.includes(`git show ${f.base}:AGENTS.md`));
  assert.ok(brief.includes(`${f.mergeBase} ${f.head}`));
  assert.doesNotMatch(brief, /synthetic untrusted PR data|verify the invoice rounding rule/);
  assert.equal(lstatSync(f.root).mode & 0o777, 0o700);
  assert.equal(lstatSync(result.brief).mode & 0o777, 0o600);
  assert.equal(f.command('status', '--porcelain'), status);
  assert.equal(f.command('rev-parse', '--abbrev-ref', 'HEAD'), 'main');
  assert.equal(readFileSync(join(f.remote, 'notes.txt'), 'utf8'), 'Untracked working notes\n');
});

test('refresh opens another checkout, compares heads, and reuses an identical revision', async (t) => {
  const f = setup(t);
  const original = await f.apply(f.first);
  const next = { base: f.base, head: f.nextHead };
  const updated = await f.apply(next, { refreshOnly: true });
  assert.notEqual(updated.worktree, original.worktree);
  assert.equal(f.git(original.worktree, 'rev-parse', 'HEAD').trim(), f.head);
  assert.equal(f.git(updated.worktree, 'rev-parse', 'HEAD').trim(), f.nextHead);
  assert.match(updated.updateSummary, /1 file changed/);
  assert.ok(readFileSync(updated.brief, 'utf8').includes(`${f.head} ${f.nextHead}`));
  const unchanged = await f.apply(next, { refreshOnly: true });
  assert.equal(unchanged.worktree, updated.worktree);
  assert.equal(unchanged.changed, false);
  writeFileSync(join(updated.worktree, 'notes.txt'), 'My private notes\n');
  await assert.rejects(f.apply(next), /checkout has changed/);
  assert.equal(readFileSync(join(updated.worktree, 'notes.txt'), 'utf8'), 'My private notes\n');
});

test('refresh detects a base branch update even when the head stays the same', async (t) => {
  const f = setup(t);
  const first = await f.apply({ base: f.mergeBase, head: f.head });
  const updated = await f.apply(f.first, { refreshOnly: true });
  assert.notEqual(updated.worktree, first.worktree);
  assert.equal(updated.baseChanged, true);
  assert.match(readFileSync(updated.brief, 'utf8'), /base commit also changed/);
});

test('failed fetch preserves the last complete revision and permits a retry', async (t) => {
  const f = setup(t);
  const first = await f.apply(f.first);
  const state = join(f.session, 'latest.json');
  const before = readFileSync(state, 'utf8');
  await assert.rejects(f.apply({ base: f.base, head: 'f'.repeat(40) }), /fetch/);
  assert.equal(readFileSync(state, 'utf8'), before);
  assert.equal(readdirSync(f.session).filter(name => name.startsWith('revision-')).length, 1);
  assert.equal((await f.apply(f.first)).worktree, first.worktree);
});

test('rejects concurrent writers, symlink roots, and refresh before open', async (t) => {
  const f = setup(t);
  await assert.rejects(f.apply(f.first, { refreshOnly: true }), /Open this PR first|before refreshing/);
  const lock = join(f.session, '.lock');
  mkdirSync(lock);
  await assert.rejects(f.apply(f.first), /locked/);
  const link = join(f.dir, 'alias');
  symlinkSync(f.root, link);
  await assert.rejects(f.apply(f.first, { root: link }), /real, private/);
});

test('CLI has a working help entry point', () => {
  const output = execFileSync(process.execPath, ['src/cli.js', '--help'], { encoding: 'utf8' });
  assert.match(output, /pr-review-workspace <open\|refresh>/);
});
