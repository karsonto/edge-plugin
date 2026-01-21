# Contributing Guide

Thanks for your interest in contributing! This document describes the expected
workflow, code style, and the definition of “done”.

## Getting Started

### Prerequisites

- Node.js **20+**
- npm (recommended: the version bundled with Node 20)

### Install & Build

```bash
npm ci
npm run build
```

### Development

```bash
npm run dev
```

### Type Checking

```bash
npm run type-check
```

## Project Structure (High-level)

- `src/background/`: MV3 background service worker logic
- `src/content/`: content scripts running on web pages
- `src/sidepanel/`: side panel UI (React)
- `src/shared/`: shared types and utilities

## Making Changes

### Branch Naming

Use a clear branch name:

- `feat/<short-description>`
- `fix/<short-description>`
- `chore/<short-description>`

### Commit Messages

Use concise, imperative commit messages:

- `feat: add xxx`
- `fix: handle yyy`
- `chore: update deps`

### Pull Requests

Before opening a PR, please ensure:

- `npm run build` passes
- `npm run type-check` passes
- The change is documented (README / DEVELOPMENT docs) if it impacts usage
- No secrets, API keys, or private endpoints are committed

PRs should include:

- What changed and why
- Screenshots / recordings for UI changes
- Any breaking changes and migration notes

## Security & Privacy

- Do **not** include credentials or API keys in code, issues, or PRs.
- For vulnerabilities, follow `SECURITY.md`.

## License

By contributing, you agree that your contributions will be licensed under the
project’s license (see `LICENSE`).

