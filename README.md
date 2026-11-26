# PR Review Workspace

Keep reviewing a pull request even when the branch you are working on has local changes. Give the workspace a GitHub PR URL and it opens the exact head commit in a separate Git worktree. A Markdown brief records the three commits needed to reproduce the review and gives Codex or Claude Code the same starting point.

## Setup

You need Node.js 22 or later, Git and curl on macOS or Linux. Public PRs work without a GitHub login. For a private PR, use `--auth` with an existing GitHub CLI login that can read both the PR and the repository.

Run from the extracted project directory:

```sh
npm ci --ignore-scripts
node src/cli.js --help
```

There are no npm runtime dependencies. You can also run the CLI without the npm install.

## Open a review

```sh
node src/cli.js open https://github.com/Ezmad-Ze/webhook-replay-cli/pull/1
```

Open the printed checkout path in a separate terminal or tmux window. Start Codex or Claude Code there and give the agent the contents of the printed `REVIEW.md`. Use the same brief in both sessions if you want two perspectives. Each brief includes the PR link, base, head, merge base, the commands for comparing commits, and a pointer to the pinned base's top-level `AGENTS.md` when present. The brief lives outside the checkout.

For a repository you do not trust, inspect the Git diff yourself first. Launching an agent from a checkout can cause it to load repository instructions or configuration. The CLI itself never launches agents, runs repository code, or posts review comments.

## Review a new push

```sh
node src/cli.js refresh https://github.com/owner/repo/pull/42
```

Replace the URL with the PR you opened. A changed head gets a fresh checkout and a change summary. The new brief includes the old-to-new diff command so you can recheck prior findings. A changed base also gets its own brief and checkout. An identical, clean revision reuses the existing checkout. Earlier checkouts remain available. Keep review notes outside checkouts so new sessions start at the pinned source.

The workspace defaults to `~/.pr-review-workspace`. Use `--root DIR` on both commands for a custom location. The parent directory must exist, and an existing root must be a real directory with mode 700. This directory contains Git history and may include private source. Each PR has an independent Git store and revision history, so disk use grows with the repositories and revisions you open.

If a terminated process leaves a `.lock` directory, check that no review command for that PR is running before removing the empty lock directory printed in the error. To retire a review, quit sessions using its checkouts and remove its private PR directory after saving anything you want to keep.

## Verify and try the demo

```sh
npm test
npm run demo
```

The demo creates a disposable invoice example, opens the first revision, refreshes after a simulated fix and cleans up. See [architecture](docs/architecture.md) and [changelog](CHANGELOG.md).

This portfolio project was prepared with AI assistance.
