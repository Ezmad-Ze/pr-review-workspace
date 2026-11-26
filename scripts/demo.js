import assert from 'node:assert/strict';
import { fixture } from './fixture.js';
import { updateReview } from '../src/workspace.js';

const f = fixture();
try {
  let head = f.head;
  const options = { input: f.input, root: f.root };
  const dependencies = { ...f, getPull: async () => ({ base: f.base, head }) };
  const initial = await updateReview(options, dependencies);
  console.log('Initial review flags rounding down where the invoice policy calls for rounding up.');
  console.log(f.git(initial.worktree, 'diff', f.mergeBase, head, '--', 'invoice.js').trim());
  head = f.nextHead;
  const refresh = await updateReview({ ...options, refreshOnly: true }, dependencies);
  assert.notEqual(initial.worktree, refresh.worktree);
  console.log('The author restores the rounding rule. The new review compares the two pinned heads.');
  console.log(f.git(refresh.worktree, 'diff', f.head, head, '--', 'invoice.js').trim());
  assert.match(f.command('status', '--porcelain'), /\?\? notes.txt/);
  console.log('Demo passed. Both revisions and the source checkout stayed separate.');
} finally {
  f.clean();
}
