import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

const component = /^[A-Za-z0-9_.-]+$/;
export const isCommit = (value) => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);

export function parsePullUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Use a GitHub pull request URL.');
  }
  const match = /^\/([^/]+)\/([^/]+)\/pull\/([1-9][0-9]*)\/?$/.exec(url.pathname);
  if (url.protocol !== 'https:' || url.host !== 'github.com' || url.username || url.password
      || url.search || url.hash || !match || !component.test(match[1]) || !component.test(match[2])
      || !Number.isSafeInteger(Number(match[3]))) {
    throw new Error('Use a GitHub pull request URL such as https://github.com/owner/repo/pull/42.');
  }
  const [, owner, repo, number] = match;
  return {
    slug: `${owner}/${repo}`,
    key: `${owner.toLowerCase()}/${repo.toLowerCase()}/${number}`,
    number: Number(number),
    url: `https://github.com/${owner}/${repo}/pull/${number}`,
    remote: `https://github.com/${owner}/${repo}.git`,
  };
}

export async function githubPull(pr, { authenticated = false } = {}) {
  const endpoint = `repos/${pr.slug}/pulls/${pr.number}`;
  let data;
  if (authenticated) {
    try {
      const result = await execute('gh', ['api', '--hostname', 'github.com', '--method', 'GET', endpoint], {
        encoding: 'utf8',
        env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_HOST: 'github.com' },
        timeout: 30_000,
      });
      data = JSON.parse(result.stdout);
    } catch {
      throw new Error('GitHub CLI could not read this PR. Check gh auth status, permissions and connectivity.');
    }
  } else {
    let output;
    try {
      const result = await execute('curl', [
        '--disable', '--silent', '--show-error', '--proto', '=https', '--max-time', '25',
        '--header', 'Accept: application/vnd.github+json', '--user-agent', 'pr-review-workspace',
        '--write-out', '\n%{http_code}', `https://api.github.com/${endpoint}`,
      ], { encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
      output = result.stdout;
    } catch {
      throw new Error('Could not read the GitHub API. Check that curl is installed and retry.');
    }
    const statusLine = output.lastIndexOf('\n');
    const status = output.slice(statusLine + 1);
    if (status !== '200') {
      const advice = status === '404' ? ' Check the URL or use --auth for a private PR.' : '';
      throw new Error(`GitHub returned HTTP ${status}.${advice}`);
    }
    data = JSON.parse(output.slice(0, statusLine));
  }
  if (data.number !== pr.number || data.base?.repo?.full_name?.toLowerCase() !== pr.slug.toLowerCase()
      || !isCommit(data.base?.sha) || !isCommit(data.head?.sha)) {
    throw new Error('GitHub did not return matching base and head commits for this PR.');
  }
  return { base: data.base.sha, head: data.head.sha };
}
