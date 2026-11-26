import {
  chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync,
  renameSync, rmdirSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createGit, initStore, pinCommits } from './git.js';
import { githubPull, isCommit, parsePullUrl } from './github.js';
import { makeBrief, reviewFiles } from './brief.js';

function directory(path) {
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const info = lstatSync(path);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0) {
    throw new Error(`Use a real, private workspace directory (mode 700): ${path}`);
  }
  return path;
}

function currentRevision(session) {
  const path = join(session, 'latest.json');
  let previous;
  try {
    if (!lstatSync(path).isFile()) throw new Error('Review state must be a regular file.');
    previous = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!isCommit(previous?.base) || !isCommit(previous?.head) || !isCommit(previous?.mergeBase)
      || !/^revision-[a-zA-Z0-9]+$/.test(previous?.folder ?? '')) {
    throw new Error('The saved review state is invalid.');
  }
  return previous;
}

function acquire(session) {
  const lock = join(session, '.lock');
  try {
    mkdirSync(lock, { mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`This review is locked: ${lock}`);
    throw error;
  }
  return () => rmdirSync(lock);
}

function existingCheckout(session, previous, git) {
  const folder = join(session, previous.folder);
  const files = reviewFiles(folder);
  if (!lstatSync(folder).isDirectory() || !lstatSync(files.worktree).isDirectory()
      || !lstatSync(files.brief).isFile()
      || git(files.worktree, 'rev-parse', 'HEAD').trim() !== previous.head
      || git(files.worktree, 'status', '--porcelain', '--untracked-files=all', '--ignored=matching').trim()) {
    throw new Error('The current review checkout has changed. Preserve your edits outside the review checkout before reusing it.');
  }
  return files;
}

async function updateReview(options, dependencies = {}) {
  const { input, root, authenticated, refreshOnly } = options;
  const pr = parsePullUrl(input);
  const git = dependencies.git ?? createGit({ authenticated });
  const getPull = dependencies.getPull ?? githubPull;
  const remote = dependencies.remote ?? pr.remote;
  const rootPath = realpathSync(directory(resolve(root)));
  let session = rootPath;
  for (const part of pr.key.split('/')) session = directory(join(session, part));
  const unlock = acquire(session);
  try {
    const previous = currentRevision(session);
    if (refreshOnly && !previous) throw new Error('Open this PR before refreshing it.');
    const next = await getPull(pr, { authenticated });
    if (!isCommit(next?.base) || !isCommit(next?.head)) throw new Error('Invalid Git revision.');
    if (previous && previous.base === next.base && previous.head === next.head) {
      return { changed: false, head: next.head, ...existingCheckout(session, previous, git) };
    }

    const objects = directory(join(session, 'git'));
    initStore(git, objects);
    const mergeBase = pinCommits(git, objects, remote, next);
    const previousHead = previous?.head;
    const updateSummary = previousHead && previousHead !== next.head
      ? git(objects, 'diff', '--no-ext-diff', '--no-textconv', '--shortstat', previousHead, next.head, '--').trim()
      : undefined;
    const baseChanged = Boolean(previous && previous.base !== next.base);
    const baseInstructions = git(objects, 'ls-tree', next.base, '--', 'AGENTS.md').startsWith('100');
    const folder = mkdtempSync(join(session, 'revision-'));
    const revision = { ...next, mergeBase, folder: basename(folder) };
    const files = reviewFiles(folder);
    const state = join(folder, 'latest.json');
    const refs = `refs/review/${revision.folder}`;
    const pinned = [];
    let published = false;
    try {
      for (const label of ['base', 'head']) {
        const ref = `${refs}/${label}`;
        git(objects, 'update-ref', ref, revision[label]);
        pinned.push(ref);
      }
      git(objects, 'worktree', 'add', '--detach', files.worktree, revision.head);
      chmodSync(files.worktree, 0o700);
      writeFileSync(files.brief, makeBrief({ pr, revision, previous, worktree: files.worktree, baseInstructions }),
        { mode: 0o600, flag: 'wx' });
      writeFileSync(state, JSON.stringify(revision, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      renameSync(state, join(session, 'latest.json'));
      published = true;
    } finally {
      if (!published) {
        for (const path of [state, files.brief]) {
          try { unlinkSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        try { git(objects, 'worktree', 'remove', files.worktree); } catch { /* Retain any checkout that Git cannot safely remove. */ }
        try { rmdirSync(folder); } catch { /* Keep incomplete files available for inspection. */ }
        for (const ref of pinned) git(objects, 'update-ref', '-d', ref);
      }
    }
    return { changed: true, head: revision.head, previousHead, updateSummary, baseChanged, ...files };
  } finally {
    unlock();
  }
}

export { updateReview };
