import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGit } from '../src/git.js';

export function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'pr-review-fixture-'));
  const remote = join(dir, 'source');
  const root = join(dir, 'reviews');
  mkdirSync(remote);
  const git = createGit({ localFixture: true });
  const command = (...args) => git(remote, ...args).trim();
  command('init', '--initial-branch=main', '--template=');
  command('config', 'user.name', 'Review Fixture');
  command('config', 'user.email', 'fixture@example.invalid');

  const write = (file, content) => writeFileSync(join(remote, file), content);
  write('invoice.js', 'export const cents = value => Math.ceil(value * 100);\n');
  write('AGENTS.md', 'In review, verify the invoice rounding rule.\n');
  command('add', '.');
  command('commit', '-m', 'Define rounding policy');
  const mergeBase = command('rev-parse', 'HEAD');

  command('switch', '-c', 'feature');
  write('invoice.js', 'export const cents = value => Math.floor(value * 100);\n');
  write('AGENTS.md', 'This text is synthetic untrusted PR data.\n');
  command('commit', '-am', 'Change rounding');
  const head = command('rev-parse', 'HEAD');

  write('invoice.js', 'export const cents = value => Math.ceil(value * 100);\n');
  command('commit', '-am', 'Restore rounding');
  const nextHead = command('rev-parse', 'HEAD');

  command('switch', 'main');
  write('README.md', '# Independent base change\n');
  command('add', 'README.md');
  command('commit', '-m', 'Update only the base');
  const base = command('rev-parse', 'HEAD');

  write('AGENTS.md', 'Local edit in progress\n');
  write('notes.txt', 'Untracked working notes\n');
  return {
    dir, remote, root, git, command, base, head, nextHead, mergeBase,
    input: 'https://github.com/fixture/project/pull/1',
    clean: () => rmSync(dir, { recursive: true, force: true }),
  };
}
