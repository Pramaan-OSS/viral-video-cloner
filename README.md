[![CI](https://github.com/Pramaan-OSS/viral-video-cloner/actions/workflows/ci.yml/badge.svg)](https://github.com/Pramaan-OSS/viral-video-cloner/actions/workflows/ci.yml)

<p align="center"><strong>Viral Video Cloner</strong></p>
<h3 align="center">Clone any viral video with AI agents</h3>
<p align="center">1 command, 100 variants, 100M views.</p>

## Viral Video Cloner

Viral Video Cloner gives AI agents (Claude Code, Codex, ...) a language and system to create
video. Drop in a video, and your agent clones it as a complete workflow: footage, captions,
B-roll and effects, all anchored to words instead of seconds.

**To be clear:** cloning a video is the fastest way in, not the only one. You can start from the
templates, or just describe the video you want and your agent writes the workflow from scratch.
Generation is optional too: a workflow can compile captions, motion graphics and code-rendered
visuals into a finished video without calling a generation capability.

![SVML source and live video preview](https://github.com/user-attachments/assets/981c28e8-ddab-4164-85bc-03b5d71275dc)

<p align="center"><em>SVML source on the left, with the corresponding video rendered live on the right.</em></p>

## Quick start

```bash
cp .env.example .env        # then paste PRAMAAN_API_KEY=... into .env
pnpm install && pnpm run hypit --version
```

That key is the only value you ever type. Every outside call — video, image, voice, alignment,
matting, source-video analysis — goes through Pramaan, which routes each call to the best
available provider. Rendering, media processing and the Studio run entirely on your machine.

Install the Skill so your coding agent can drive the tool:

```bash
npx skills add <this-repo> -g
```

## How it works

- **Families, not vendors.** Workflows are written against six families — video, image, speech,
  voice, alignment and matting. One capability per intent (`video generate`, `image generate`,
  `speech speak`, `voice design`, `alignment`, `matte`). Pramaan picks the route; no model names
  appear anywhere in the interface.
- **Word-anchored editing.** Captions, cuts and effects are anchored to spoken words through the
  alignment family, hosted by default. A local loopback alignment service stays available as an
  opt-in for offline work.
- **Local render.** The composition renders locally in headless Chromium (up to 64 concurrent
  processes) with FFmpeg and your GPU. Your media never leaves your machine except through the
  Pramaan calls you asked for.
- **Old workflows keep loading.** Workflow files written against earlier packages load through a
  compatibility alias table and compile to the family capabilities.

## What it can build

- **Paid social ads** — clone a winning ad, swap in your product, ship 50 hook variants the same
  day. When it fatigues, re-run with fresh openings; the body never changes.
- **Viral clones** — any TikTok, Reel, or Short becomes a template. Swap the host, the hook, the
  product, the language, the aspect ratio.
- **TikTok Shop and affiliate videos** — one format that converts, a new SKU every day.
- **AI UGC and talking heads** — narration, word-level captions, B-roll, comment stickers,
  beat-synced cuts, all wired automatically.
- **Podcast and interview clips** — split-screen layouts, speaker-aware captions, reaction
  overlays.
- **Code-rendered videos** — visuals driven entirely by front-end code, rendered locally without
  generation calls.
- **Localized versions** — the same video in ten languages. Rewrite a line and the timing
  re-flows itself.

## Source videos

Drop a local file on your agent: that always works. A pasted URL works through Pramaan's media
download once platform file storage is live; until then the tool says so plainly and asks for the
file. Source details and spoken words for a pasted short-video link (caption, counts, duration,
transcript) already work through Pramaan.

## Development

```bash
pnpm install
pnpm run check        # typecheck
pnpm test             # test suite (Pramaan calls use the offline fake client)
pnpm run studio       # open the Studio
```

Pull requests are welcome; `CONTRIBUTING.md` has the setup and the checks.

## Built on Hypit by Hypit.AI

This project is built on [Hypit](https://github.com/hypit-ai/hypit) by
[Hypit.AI](https://hypit.ai) and keeps Hypit's name, logo and copyright in its command-line
interface, generated run reports and manifests, as its licence requires. Everything else here —
the name you see above, the Pramaan wiring, the removal of the hosted model service — is this
fork's work, shared under the same licence as Hypit. See [LICENSE](./LICENSE).

## License

Viral Video Cloner is released under the [Hypit Open Source License](./LICENSE). The videos and
other outputs you create belong to you; third-party models and services reached through Pramaan
may have their own terms.
