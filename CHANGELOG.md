# [2.5.0](https://github.com/Doist/twist-cli/compare/v2.4.0...v2.5.0) (2026-02-21)


### Features

* add --accessible flag for screen-reader-friendly output ([#47](https://github.com/Doist/twist-cli/issues/47)) ([5317cdf](https://github.com/Doist/twist-cli/commit/5317cdf729e6faa43f339cbb4ef4ab1a0e7ad02a))
* add Gemini CLI skill ([#48](https://github.com/Doist/twist-cli/issues/48)) ([7992c26](https://github.com/Doist/twist-cli/commit/7992c26f11eb9d5b23d00270a3779a05b4ed9e6c))

# [2.4.0](https://github.com/Doist/twist-cli/compare/v2.3.0...v2.4.0) (2026-02-21)


### Features

* add `tw update` self-update command ([#46](https://github.com/Doist/twist-cli/issues/46)) ([b6a019b](https://github.com/Doist/twist-cli/commit/b6a019bf3f8a0178754125165591ae8fe71f7a67))

# [2.3.0](https://github.com/Doist/twist-cli/compare/v2.2.0...v2.3.0) (2026-02-20)


### Features

* add shell completions for tw CLI ([#40](https://github.com/Doist/twist-cli/issues/40)) ([3ad6797](https://github.com/Doist/twist-cli/commit/3ad6797075013f9b0c7ee7947025f0cba9d800af))

# [2.2.0](https://github.com/Doist/twist-cli/compare/v2.1.0...v2.2.0) (2026-02-20)


### Features

* Improve lenient reference handling across CLI commands ([#38](https://github.com/Doist/twist-cli/issues/38)) ([bbf3a9b](https://github.com/Doist/twist-cli/commit/bbf3a9b550a3cf2f03299d2c81ab2d440d016291))

# [2.1.0](https://github.com/Doist/twist-cli/compare/v2.0.0...v2.1.0) (2026-02-19)


### Features

* add `tw view <url>` router command ([#42](https://github.com/Doist/twist-cli/issues/42)) ([b5263fa](https://github.com/Doist/twist-cli/commit/b5263faaded723964b7c65f50a2efac78d491288))

# [2.0.0](https://github.com/Doist/twist-cli/compare/v1.11.0...v2.0.0) (2026-02-19)


* feat!: rename `tw msg` to `tw conversation`, repurpose `tw msg` for message operations ([#41](https://github.com/Doist/twist-cli/issues/41)) ([786e97a](https://github.com/Doist/twist-cli/commit/786e97a6d20572a8edb5beccb233c93f9091c38b))


### BREAKING CHANGES

* `tw msg` no longer operates on conversations. Use `tw conversation`
(alias: `convo`) for conversation-level operations (unread, view, reply, done).
`tw msg` (alias: `message`) now operates on individual conversation messages
(view, update, delete).

Also adds alias support to the lazy-loading system and a missing spinner entry
for `conversationMessages.getMessage`.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>

* fix: apply field filtering to ndjson output in msg view

Ensures --ndjson applies the same essential field filtering as --json,
as flagged in PR review.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>

# [1.11.0](https://github.com/Doist/twist-cli/compare/v1.10.1...v1.11.0) (2026-02-17)


### Features

* add `tw skill update` command and postinstall auto-update ([#37](https://github.com/Doist/twist-cli/issues/37)) ([6b977f0](https://github.com/Doist/twist-cli/commit/6b977f0b232889656ee9e4903a844e1d2af60b52))

## [1.10.1](https://github.com/Doist/twist-cli/compare/v1.10.0...v1.10.1) (2026-02-13)


### Performance Improvements

* lazy-load commands and show early spinner for instant feedback ([#35](https://github.com/Doist/twist-cli/issues/35)) ([1f3629f](https://github.com/Doist/twist-cli/commit/1f3629fddb06bf8524faea5680b4918d3a363dfa))

# [1.10.0](https://github.com/Doist/twist-cli/compare/v1.9.1...v1.10.0) (2026-02-12)


### Features

* lenient CLI ergonomics — implicit view, workspace flag aliases, conflict detection ([#34](https://github.com/Doist/twist-cli/issues/34)) ([d5c8339](https://github.com/Doist/twist-cli/commit/d5c83391a6bf37edca365bd47d66a1e44a0373bd))

## [1.9.1](https://github.com/Doist/twist-cli/compare/v1.9.0...v1.9.1) (2026-02-10)


### Bug Fixes

* **deps:** Update to 2.0.2 of `@doist/twist-sdk` ([#32](https://github.com/Doist/twist-cli/issues/32)) ([bd33220](https://github.com/Doist/twist-cli/commit/bd332208901b1d45396e9227d6117b7b4a226e0c))

# [1.9.0](https://github.com/Doist/twist-cli/compare/v1.8.0...v1.9.0) (2026-02-09)


### Features

* upgrade twist-sdk to v2.0.1 and use entity.url instead of getFullTwistURL() ([#31](https://github.com/Doist/twist-cli/issues/31)) ([ce8742b](https://github.com/Doist/twist-cli/commit/ce8742b5e134ab6ee119720f5688ed651c581ed0))

# [1.8.0](https://github.com/Doist/twist-cli/compare/v1.7.0...v1.8.0) (2026-02-09)


### Features

* Default to public channels only, add --include-private-channels option ([#27](https://github.com/Doist/twist-cli/issues/27)) ([77c0a18](https://github.com/Doist/twist-cli/commit/77c0a181ab9b2b21db828687cdfd71f25a33800a))

# [1.7.0](https://github.com/Doist/twist-cli/compare/v1.6.1...v1.7.0) (2026-02-09)


### Features

* add --comment flag to thread view ([#28](https://github.com/Doist/twist-cli/issues/28)) ([60fd075](https://github.com/Doist/twist-cli/commit/60fd075a8562b0bd18ad6f10f8805dd87fef2574))

## [1.6.1](https://github.com/Doist/twist-cli/compare/v1.6.0...v1.6.1) (2026-02-08)


### Bug Fixes

* add missing flags and commands to skill content ([#30](https://github.com/Doist/twist-cli/issues/30)) ([479485a](https://github.com/Doist/twist-cli/commit/479485a387acd1e99894f15bda0078b30efda891))

# [1.6.0](https://github.com/Doist/twist-cli/compare/v1.5.0...v1.6.0) (2026-02-07)


### Bug Fixes

* strictly validate user IDs in --notify to reject non-numeric input ([d8e9ee5](https://github.com/Doist/twist-cli/commit/d8e9ee598e970dca1e5d1d98b9f74d8985b9b0f8))


### Features

* add recipients option ([91fdc05](https://github.com/Doist/twist-cli/commit/91fdc0592e567fb4832bdb59473de746f3034f5f))

# [1.5.0](https://github.com/Doist/twist-cli/compare/v1.4.0...v1.5.0) (2026-01-29)


### Features

* add --progress-jsonl flag for machine-readable progress reporting ([#24](https://github.com/Doist/twist-cli/issues/24)) ([3d7a266](https://github.com/Doist/twist-cli/commit/3d7a266574f97bcc480f5023d5251f1839309318))

# [1.4.0](https://github.com/Doist/twist-cli/compare/v1.3.1...v1.4.0) (2026-01-29)


### Bug Fixes

* **deps:** update to latest `@doist/twist-sdk` package ([8a8cd6d](https://github.com/Doist/twist-cli/commit/8a8cd6de86bcce56bb01f2f64edd9835fe89407d))


### Features

* add GitHub Action workflow for automated @doist/twist-sdk updates ([7cbdeb1](https://github.com/Doist/twist-cli/commit/7cbdeb184876b244ef26d948fc751c8b6a98b94a))

## [1.3.1](https://github.com/Doist/twist-cli/compare/v1.3.0...v1.3.1) (2026-01-27)


### Bug Fixes

* Ensure that client registration provides a logo ([#21](https://github.com/Doist/twist-cli/issues/21)) ([ad5333c](https://github.com/Doist/twist-cli/commit/ad5333cb451c5766555d4b0fa88671ec48475b17))

# [1.3.0](https://github.com/Doist/twist-cli/compare/v1.2.0...v1.3.0) (2026-01-24)


### Features

* add hidden interactive prompt for auth token input ([#20](https://github.com/Doist/twist-cli/issues/20)) ([1a5b7be](https://github.com/Doist/twist-cli/commit/1a5b7bef835fa5b752285e1954d7857e07c6c28c))

# [1.2.0](https://github.com/Doist/twist-cli/compare/v1.1.0...v1.2.0) (2026-01-23)


### Features

* add codex and cursor agent skill support ([#18](https://github.com/Doist/twist-cli/issues/18)) ([1a3b182](https://github.com/Doist/twist-cli/commit/1a3b182ae6f4cd5d439e26bfba6df65ab66c7684))

# [1.1.0](https://github.com/Doist/twist-cli/compare/v1.0.1...v1.1.0) (2026-01-23)


### Bug Fixes

* Format error message on single line ([89f3ef8](https://github.com/Doist/twist-cli/commit/89f3ef8b410565e3e0186447d7cf57ab50a12011))


### Features

* Add tw skill command for agent skill integrations ([1228ce6](https://github.com/Doist/twist-cli/commit/1228ce63f2dc0b7ac2ed17b3121660ff7c760514))

## [1.0.1](https://github.com/Doist/twist-cli/compare/v1.0.0...v1.0.1) (2026-01-22)


### Bug Fixes

* remove registry-url from setup-node for provenance publishing ([#14](https://github.com/Doist/twist-cli/issues/14)) ([1fe3f49](https://github.com/Doist/twist-cli/commit/1fe3f49e9c504c9c17b29b4e36494bc76e7829fe))
* upgrade semantic-release to v25 and fix trusted publishing ([#16](https://github.com/Doist/twist-cli/issues/16)) ([7d45c08](https://github.com/Doist/twist-cli/commit/7d45c0841343d35ef1eb4ba4cee99497d90937e6))
* use Node 22 for release job to satisfy semantic-release v25 requirements ([#17](https://github.com/Doist/twist-cli/issues/17)) ([96b0d9d](https://github.com/Doist/twist-cli/commit/96b0d9de8b95dd0b39eac78f56f492ff01671ca9))

# 1.0.0 (2026-01-22)


### Bug Fixes

* add UTF-8 charset to OAuth callback HTML responses ([#8](https://github.com/Doist/twist-cli/issues/8)) ([fcb2d49](https://github.com/Doist/twist-cli/commit/fcb2d49664720292d066993dacab5c0cb7ee5f53))


### Features

* Add Biome linting, upgrade to Node 20, and add CI workflows ([#3](https://github.com/Doist/twist-cli/issues/3)) ([57f802e](https://github.com/Doist/twist-cli/commit/57f802e60f7133b7cc4fedfe7a9fd0058faa4e61))
* add loading animations with global API proxy integration ([#7](https://github.com/Doist/twist-cli/issues/7)) ([bf53bfb](https://github.com/Doist/twist-cli/commit/bf53bfbcc99daa086b9883b33848c7226ee33499))
* Add OAuth authentication with dynamic client registration ([#6](https://github.com/Doist/twist-cli/issues/6)) ([2845ebd](https://github.com/Doist/twist-cli/commit/2845ebd916b3d7a5e390135d8ebe52c668641a71)), closes [#5](https://github.com/Doist/twist-cli/issues/5)
* add semantic release automation for NPM publishing ([#10](https://github.com/Doist/twist-cli/issues/10)) ([c756324](https://github.com/Doist/twist-cli/commit/c7563244f20f769c6573b89562e9f9c3b2728444))
* Refactor login command to auth with status/logout subcommands ([#4](https://github.com/Doist/twist-cli/issues/4)) ([59e6493](https://github.com/Doist/twist-cli/commit/59e6493455f3f6034a3a7183b423fdf1ceddee91))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
