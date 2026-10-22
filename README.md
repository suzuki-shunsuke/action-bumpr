# action-bumpr

**action-bumpr** bumps semantic version tag on merging Pull Requests with
specific labels (`bump:major`,`bump:minor`,`bump:patch`).

This is a JavaScript Action ported from [haya14busa/action-bumpr](https://github.com/haya14busa/action-bumpr), which is a composite action written in shell script.

## Why

haya14busa/action-bumpr downloads [haya14busa/bump](https://github.com/haya14busa/bump) v1.1.0 at runtime, which causes the following problems:

- It doesn't work on ARM64 runners such as `ubuntu-24.04-arm`, because bump v1.1.0 provides only `x86_64` and `i386` binaries for Linux and macOS
- bump v1.1.0 was released in May 2020 and built with an old Go (`go 1.13` in `go.mod`), so it doesn't include any security updates of Go since then

This action computes the next version by itself, so it works on any runner supported by JavaScript Actions.

## Differences from haya14busa/action-bumpr

- It runs on Node.js, so `bash`, `curl`, and `jq` aren't required
- It doesn't download [haya14busa/bump](https://github.com/haya14busa/bump) at runtime. The next version is computed by the action itself
- It finds the pull request merged as the pushed commit by the API [List pull requests associated with a commit](https://docs.github.com/en/rest/commits/commits#list-pull-requests-associated-with-a-commit), instead of the latest page of closed pull requests
- The labels must be exactly `bump:major`, `bump:minor`, or `bump:patch`
- `skip` is set to `true` also when the label attached by `labeled` event doesn't start with `bump:`
- It doesn't change the local git config (`user.name` and `user.email`)
- If no tag is merged into `HEAD`, it uses the latest tag in the repository instead of failing

## Inputs

See [action.yaml](action.yaml).

| name                 | default                                   | description                                                                                 |
| -------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `default_bump_level` |                                           | Default bump level if labels are not attached [major,minor,patch]. Do nothing if it's empty |
| `dry_run`            | `false`                                   | Do not actually tag next version if it's true                                               |
| `github_token`       | `${{ github.token }}`                     | GitHub Access Token to get pull requests, post comments, and push tags                      |
| `tag_as_user`        | `github.actor`                            | Name to use when creating tags                                                              |
| `tag_as_email`       | `<github.actor>@users.noreply.github.com` | Email address to use when creating tags                                                     |

## Outputs

| name              | description                                                 |
| ----------------- | ----------------------------------------------------------- |
| `current_version` | current version                                             |
| `next_version`    | next version                                                |
| `skip`            | `true` if release is skipped. e.g. No labels attached to PR |
| `message`         | Tag message                                                 |

## Usage

```yaml
name: release
on:
  push:
    branches:
      - main
  pull_request:
    types:
      - labeled

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write # Push tags
      pull-requests: write # Post comments
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      # Bump version on merging Pull Requests with specific labels.
      # (bump:major,bump:minor,bump:patch)
      - uses: suzuki-shunsuke/action-bumpr@afd816c0ed625394a2ea02799e0de9cbd7ec8b64 # v0.0.1
```

On `pull_request` `labeled` event, the action posts a comment of the next version to the pull request.
On `push` event, the action creates and pushes the next version tag, and posts a comment to the merged pull request.

The action fetches all tags and history if the repository is shallow, because it computes the current version from tags merged into `HEAD`.
If no tag is merged into `HEAD`, the action uses the latest tag in the repository instead.
This is useful when release commits are created outside the default branch, e.g. JavaScript Actions whose release commits include built files.
If the repository has no tag, the next version is `v1.0.0`, `v0.1.0`, or `v0.0.1`.

### Note

action-bumpr uses push event to run workflow instead of pull_request closed (merged) event because github token doesn't have write permission
for pull_request from fork repository.

## Development

```sh
npm ci
npm test
npm run build
```

`dist` isn't committed to the default branch.

## LICENSE

[MIT](LICENSE)
