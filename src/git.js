import { execFileSync } from 'node:child_process';
import { chmodSync } from 'node:fs';

export function createGit({ authenticated = false, localFixture = false } = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GH_PROMPT_DISABLED: '1',
  });
  const config = [
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'credential.helper=',
    '-c', 'protocol.allow=never',
    '-c', 'protocol.https.allow=always',
    '-c', 'http.followRedirects=false',
  ];
  if (authenticated) config.push('-c', 'credential.helper=!gh auth git-credential');
  if (localFixture) config.push('-c', 'protocol.file.allow=always');

  return (cwd, ...args) => {
    try {
      return execFileSync('git', [...config, '-C', cwd, ...args], {
        env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
      });
    } catch {
      throw new Error(`Git could not complete "${args[0]}". Check the repository, requested revision and connectivity.`);
    }
  };
}

export function initStore(git, dir) {
  git(dir, 'init', '--bare', '--template=');
  chmodSync(dir, 0o700);
}

export function pinCommits(git, dir, remote, revision) {
  const shas = [...new Set([revision.base, revision.head])];
  git(dir, 'fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', remote, ...shas);
  for (const sha of shas) {
    if (git(dir, 'cat-file', '-t', sha).trim() !== 'commit') {
      throw new Error('The requested Git object is not a commit.');
    }
  }
  return git(dir, 'merge-base', revision.base, revision.head).trim();
}
