#!/usr/bin/env node
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { updateReview } from './workspace.js';

const usage = `Usage: pr-review-workspace <open|refresh> <github-pr-url> [--root DIR] [--auth]
  open       Create a pinned review checkout and Markdown brief
  refresh    Compare the latest PR revision with your previous review
  --auth     Use your existing GitHub CLI login
  --root     Private workspace directory (default: ~/.pr-review-workspace)`;

try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { root: { type: 'string' }, auth: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
  });
  const [command, input] = positionals;
  if (values.help || positionals.length === 0) {
    console.log(usage);
  } else {
    if (!['open', 'refresh'].includes(command) || positionals.length !== 2) throw new Error(usage);
    const result = await updateReview({
      input, root: values.root ?? join(homedir(), '.pr-review-workspace'),
      authenticated: values.auth, refreshOnly: command === 'refresh',
    });
    console.log(result.changed ? `Pinned ${result.head}` : `Already pinned ${result.head}`);
    if (result.previousHead && result.previousHead !== result.head) {
      console.log(`Since ${result.previousHead}: ${result.updateSummary || 'no file changes'}`);
    }
    if (result.baseChanged) console.log('The PR base also changed.');
    console.log(`Checkout: ${result.worktree}\nBrief: ${result.brief}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
