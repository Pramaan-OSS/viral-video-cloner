# Contributing to Viral Video Cloner

[简体中文](./CONTRIBUTING.zh-CN.md)

Pull requests are welcome. Documentation, examples and translations count as much as code.

Video components normally live in the video project's `packages/` directory. When sharing one across
projects, publish it under your own npm scope or private registry and install a versioned release
through the project's package manager. Proposals for the official Distribution belong in an issue
that explains the shared production need.

## Before you start

Pick up an open issue or open one describing what you
want to work on. For anything that changes a protocol type, a package boundary or a Provider
contract, describe the approach in the issue first.

## Set up

You need Node.js 22.15+ and pnpm 10.33, selected by the root `packageManager` field.

```bash
corepack enable
pnpm install --frozen-lockfile
```

Live Builds additionally need Python 3.10–3.13, uv, ffmpeg and Chromium. The
[Development Guide](./docs/guide/develop.md) lists what each one is for.

For a Profile selecting local rendering, run `hypit programs up --runtime <profile> --endpoint
<render-instance>` before the first render (or `hypit runtime up --runtime <profile>` to prepare
the Profile and start its Worker). This explicitly prepares Chrome even when pnpm skips dependency
build scripts. `hypit doctor --runtime <profile>` diagnoses missing setup without installing it.
See the [local renderer README](packages/provider-html-local/README.md) for browser overrides.

## Make the change

| Where you are working | Guide |
| --- | --- |
| A new Author Package | [Adding an Author Package](./docs/guide/author-packages.md) |
| A new Provider | [Adding a Provider](./docs/guide/providers.md) |
| Component internals | [Component Anatomy](./docs/guide/component-anatomy.md) |
| Studio interface translations | [Localizing Studio](packages/studio/LOCALIZATION.md) |
| Compilation, Runs and Builds | [Runtime](./docs/guide/runtime.md) |
| Naming, module boundaries, wire data | [Conventions](./docs/guide/conventions.md) |
| Tests and environment-gated suites | [Testing](./docs/guide/testing.md) |

English and Chinese documentation live side by side under `docs/` and `docs/zh/`. A change to one
page belongs with the change to its counterpart.

## Check your work

CI runs these commands on code pull requests. Run them locally first:

```bash
pnpm check         # TypeScript type-check
pnpm test          # package and service-adapter tests
```

## Package the Distribution

### SDK imports in 0.3.1

For an existing video project, follow the [Agent migration guide](migrations/0.3.1.md)
for the exact import mapping, dependency update and verification steps. Projects from 0.2.x or an
older checkout should first use the [0.3 project migration](migrations/0.3.md).

Video-domain SDKs are independently installed packages. Component code using a former root subpath,
such as `@hypit/hypit/composition`, must import from `@hypit/composition` and declare that package
in its own `dependencies`. The same applies to Timeline, Temporal, Spatial, Media, Narrative,
Caption, Generation, HTML Program, evidence and projection packages. Import the subpath exported by
the owning package when using an API such as `@hypit/temporal/markup` or `@hypit/temporal/studio`.
Generic host APIs remain under `@hypit/hypit/*`. Logical SVML module references retain their `@1`
identities; this change concerns npm ownership and TypeScript imports.

The root release is `0.3.1`, but this SDK import migration is not source-compatible with `0.3.0`.
Update the root and affected component dependencies together, then regenerate the project's ordinary
package-manager lockfile. New-architecture versions of existing domain packages use the `0.2.x`
line so that old `^0.1.1` dependencies do not silently select them. Previously embedded domain
packages start at `0.1.0`; packages that did not change keep their existing versions.

### Build and check the distribution

Run `pnpm run pack:distribution` to build public types and write the release tarball to
`dist/release/`. This stages the npm-selected files in a temporary directory and adapts the English
README for the package page. The repository READMEs remain unchanged. `dist/release/README.md`
shows the packaged text.

With FFmpeg and FFprobe available, run
`pnpm run check:distribution -- dist/release/<name>-<version>.tgz` to install that tarball outside
the checkout, build its chat example component, prepare its font and local renderer, render and export
the video, and decode the result. It disables implicit Puppeteer downloads, checks missing-browser
diagnostics, and prepares the browser in an isolated cache. It uses a separate state directory, stops
its Runtime Worker, and retains the temporary project on failure. Set `npm_config_cache` to reuse
downloaded package bytes; the consumer project, node_modules, Runtime state and browser installation
remain isolated. CI runs the same candidate execution alongside the repository checks.

Releases are cut by the repository owner; nothing in this checkout publishes to npm.

Workspace release dependencies use explicit compatibility ranges, such as `workspace:^0.3.0`;
packing removes the workspace prefix without raising the minimum to the current checkout version.

## Open the pull request

Branch names and commit subjects share the same prefix: `feat/`, `fix/`, `docs/` for branches and
`feat:`, `fix:`, `docs:` for commits.

## Issue and PR analysis

Maintainers can request a preliminary AI analysis of an issue or PR from the **Repository analysis**
Actions workflow. Its advice appears only in that run's summary; issue/PR management stays with
maintainers. See the [operator guide](.github/ISSUE_AUTOMATION_DESIGN.md) for inputs and limits.

## Getting help

Ask in [Discord](https://discord.gg/85hnyQnxpn) or [Telegram](https://t.me/hypitai).
