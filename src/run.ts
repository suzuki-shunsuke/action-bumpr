import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import {
  type BumpLevel,
  initialVersion,
  isBumpLevel,
  latestTag,
  nextTag,
} from "./version";

type Octokit = ReturnType<typeof github.getOctokit>;

type PullRequest = {
  number: number;
  title: string;
  labels: string[];
};

const bumprLink = "[[bumpr]](https://github.com/suzuki-shunsuke/action-bumpr)";

export const main = async () => {
  const token = core.getInput("github_token", { required: true });
  core.setSecret(token);
  const dryRun = core.getBooleanInput("dry_run");
  const defaultBumpLevel = core.getInput("default_bump_level");
  if (defaultBumpLevel && !isBumpLevel(defaultBumpLevel)) {
    throw new Error(
      `default_bump_level must be one of major, minor, and patch: ${defaultBumpLevel}`,
    );
  }

  const octokit = github.getOctokit(token);
  const { context } = github;
  const isLabeled = context.payload.action === "labeled";

  const pr = isLabeled
    ? getPullRequestFromLabeledEvent()
    : await getPullRequestFromPushEvent(octokit);
  if (pr === undefined) {
    core.setOutput("skip", "true");
    return;
  }

  const bumpLevel = getBumpLevel(pr.labels) || defaultBumpLevel;
  if (!isBumpLevel(bumpLevel)) {
    core.info("PR with labels for bump not found. Do nothing.");
    core.setOutput("skip", "true");
    return;
  }
  core.info(`Bump ${bumpLevel} version`);

  const cwd = process.env.GITHUB_WORKSPACE || undefined;
  const git = async (args: string[]): Promise<string> => {
    const out = await exec.getExecOutput("git", args, { cwd });
    return out.stdout.trim();
  };
  if (cwd) {
    await git(["config", "--global", "--add", "safe.directory", cwd]);
  }

  if ((await git(["rev-parse", "--is-shallow-repository"])) === "true") {
    // Fetch existing tags and history because tags merged into HEAD are needed.
    await git(["fetch", "--tags", "-f"]);
    await git(["fetch", "--prune", "--unshallow"]);
  }

  const { currentVersion, nextVersion } = await getVersions(git, bumpLevel);
  core.setOutput("current_version", currentVersion);
  core.setOutput("next_version", nextVersion);

  const message = `${nextVersion}: PR #${pr.number} - ${pr.title}`;
  core.setOutput("message", message);

  if (dryRun) {
    core.info("dry_run is true. Do not tag next version.");
    core.info(`PR_NUMBER=${pr.number}`);
    core.info(`PR_TITLE=${pr.title}`);
    core.info(`TAG_MESSAGE=${message}`);
    return;
  }

  if (isLabeled) {
    await postPreStatus(octokit, pr.number, currentVersion, nextVersion);
    return;
  }

  const user = core.getInput("tag_as_user") || context.actor;
  const email =
    core.getInput("tag_as_email") ||
    `${context.actor}@users.noreply.github.com`;
  await git([
    "-c",
    `user.name=${user}`,
    "-c",
    `user.email=${email}`,
    "tag",
    "-a",
    nextVersion,
    "-m",
    message,
  ]);

  // Push with the token instead of the credential persisted by actions/checkout.
  const serverUrl = new URL(context.serverUrl);
  const remote = `${serverUrl.protocol}//x-access-token:${token}@${serverUrl.host}/${context.repo.owner}/${context.repo.repo}.git`;
  await git([
    "-c",
    `http.${context.serverUrl}/.extraheader=`,
    "push",
    remote,
    `refs/tags/${nextVersion}`,
  ]);

  await postPostStatus(octokit, pr.number, currentVersion, nextVersion);
};

const getBumpLevel = (labels: string[]): BumpLevel | undefined => {
  for (const level of ["major", "minor", "patch"] as const) {
    if (labels.includes(`bump:${level}`)) {
      return level;
    }
  }
  return undefined;
};

const getPullRequestFromLabeledEvent = (): PullRequest | undefined => {
  const { payload } = github.context;
  const label: string = payload.label?.name ?? "";
  if (!label.startsWith("bump:")) {
    core.info(
      `Attached label name does not match with 'bump:'. label=${label}`,
    );
    return undefined;
  }
  core.info(`Found label=${label}`);
  const pr = payload.pull_request;
  if (!pr) {
    throw new Error("pull_request is not found in the event payload");
  }
  return { number: pr.number, title: pr.title ?? "", labels: [label] };
};

const getPullRequestFromPushEvent = async (
  octokit: Octokit,
): Promise<PullRequest> => {
  const { context } = github;
  const { data } =
    await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
      ...context.repo,
      commit_sha: context.sha,
    });
  const pr = data.find((p) => p.merge_commit_sha === context.sha);
  if (!pr) {
    core.info(`No pull request merged as ${context.sha}`);
    return { number: 0, title: "", labels: [] };
  }
  return {
    number: pr.number,
    title: pr.title,
    labels: pr.labels.map((l) => l.name),
  };
};

const getVersions = async (
  git: (args: string[]) => Promise<string>,
  level: BumpLevel,
): Promise<{ currentVersion: string; nextVersion: string }> => {
  const current = latestTag((await git(["tag", "--merged"])).split("\n"));
  if (current !== undefined) {
    return { currentVersion: current, nextVersion: nextTag(current, level) };
  }
  const tags = await git(["tag"]);
  if (tags === "") {
    return { currentVersion: "", nextVersion: initialVersion[level] };
  }
  // Tags may not be merged into HEAD if release commits are created outside the default branch.
  // e.g. JavaScript Actions whose release commits include built files.
  const latest = latestTag(tags.split("\n"));
  if (latest !== undefined) {
    return { currentVersion: latest, nextVersion: nextTag(latest, level) };
  }
  throw new Error("Cannot find next version.");
};

const compareLink = (base: string, head: string): string => {
  const { context } = github;
  return `**Changes**:[${base}...${head}](${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/compare/${base}...${head})`;
};

const postPreStatus = async (
  octokit: Octokit,
  prNumber: number,
  currentVersion: string,
  nextVersion: string,
) => {
  const pr = github.context.payload.pull_request;
  const lines = [`🏷️ ${bumprLink}`, `**Next version**:${nextVersion}`];
  if (currentVersion) {
    lines.push(compareLink(currentVersion, pr?.head?.label));
  }
  const body = lines.join("\n");
  // GITHUB_TOKEN can't post comments to pull requests from forks.
  if (pr?.head?.repo?.fork) {
    core.warning(body);
    return;
  }
  await postComment(octokit, prNumber, body);
};

const postPostStatus = async (
  octokit: Octokit,
  prNumber: number,
  currentVersion: string,
  nextVersion: string,
) => {
  if (!prNumber) {
    return;
  }
  const { context } = github;
  const repoUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}`;
  const lines = [
    `🚀 ${bumprLink} [Bumped!](${repoUrl}/actions/runs/${context.runId})`,
    `**New version**:[${nextVersion}](${repoUrl}/releases/tag/${nextVersion})`,
  ];
  if (currentVersion) {
    lines.push(compareLink(currentVersion, nextVersion));
  }
  await postComment(octokit, prNumber, lines.join("\n"));
};

const postComment = async (
  octokit: Octokit,
  prNumber: number,
  body: string,
) => {
  await octokit.rest.issues.createComment({
    ...github.context.repo,
    issue_number: prNumber,
    body,
  });
};
