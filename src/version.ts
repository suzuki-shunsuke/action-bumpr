import { SemVer } from "semver";

export type BumpLevel = "major" | "minor" | "patch";

export const isBumpLevel = (s: string): s is BumpLevel =>
  s === "major" || s === "minor" || s === "patch";

// The version used when the repository has no tag at all.
export const initialVersion: Record<BumpLevel, string> = {
  major: "v1.0.0",
  minor: "v0.1.0",
  patch: "v0.0.1",
};

const parse = (tag: string): SemVer | undefined => {
  try {
    return new SemVer(tag);
  } catch {
    return undefined;
  }
};

/**
 * Returns the highest semantic version tag.
 * Tags which aren't semantic versions are ignored.
 */
export const latestTag = (tags: string[]): string | undefined => {
  let latest: { tag: string; version: SemVer } | undefined;
  for (const tag of tags) {
    const version = parse(tag.trim());
    if (version && (!latest || version.compare(latest.version) > 0)) {
      latest = { tag: tag.trim(), version };
    }
  }
  return latest?.tag;
};

/**
 * Returns the next version of the tag.
 * The prefix "v" is kept if the tag has it.
 * It follows haya14busa/bump (Masterminds/semver):
 * a pre-release version is released by a patch bump (v1.2.3-rc.1 -> v1.2.3),
 * while minor and major bumps always increment the version.
 */
export const nextTag = (tag: string, level: BumpLevel): string => {
  const v = parse(tag);
  if (!v) {
    throw new Error(`invalid semantic version: ${tag}`);
  }
  let { major, minor, patch } = v;
  switch (level) {
    case "major":
      major++;
      minor = 0;
      patch = 0;
      break;
    case "minor":
      minor++;
      patch = 0;
      break;
    case "patch":
      if (v.prerelease.length === 0) {
        patch++;
      }
      break;
  }
  const prefix = tag.startsWith("v") ? "v" : "";
  return `${prefix}${major}.${minor}.${patch}`;
};
