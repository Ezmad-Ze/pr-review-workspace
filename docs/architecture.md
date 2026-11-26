# Architecture

`open` and `refresh` parse a GitHub PR URL and fetch metadata from GitHub's REST API. The owner, repository and PR number identify a private directory under the selected workspace. A directory lock permits one writer per PR.

The metadata provides the base and head SHA. Git fetches those commits from the base repository into a dedicated bare Git store. The store has its own refs for both commits, which retain the Git objects for earlier reviews. The CLI calculates the merge base locally and adds a detached worktree at the pinned head. The owner's active checkout and index are outside this flow.

Each successful revision has a checkout and one Markdown brief. A rename publishes the latest state only after the checkout and brief exist. A fetch failure leaves the last published revision in place. Refresh calculates the head-to-head change separately from the full PR diff. This distinction matters when the base branch advances or the author rewrites their history.

Generated files record links, hashes and commands. Repository content stays in the managed Git store and checkouts. The CLI does not copy PR descriptions, patches or repository instructions into the brief. Agent setup and publishing review feedback are manual.

The CLI limits Git transport to HTTPS in normal operation, uses an empty Git template and disables hooks, submodule fetches and redirected requests. Private PRs use the existing GitHub CLI credential helper. The user must decide whether to open an agent in a checkout that contains untrusted files.
