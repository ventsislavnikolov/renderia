## [1.7.2](https://github.com/ventsislavnikolov/renderia/compare/v1.7.1...v1.7.2) (2026-06-08)


### Bug Fixes

* **e2e:** restore guided-workspace server-fn mocking and photo locator ([ebb11f4](https://github.com/ventsislavnikolov/renderia/commit/ebb11f410f9505974649a9f03f478a3898790f69))

## [1.7.1](https://github.com/ventsislavnikolov/renderia/compare/v1.7.0...v1.7.1) (2026-06-08)


### Bug Fixes

* **ci:** restore packageManager field for pnpm setup ([205f289](https://github.com/ventsislavnikolov/renderia/commit/205f2897ea755dfde156b03845f2745e68d04f97))
* **test:** exclude .claude worktrees from vitest discovery ([ea0326a](https://github.com/ventsislavnikolov/renderia/commit/ea0326abc1923b775055c029009fe5a4a0c8979f))

# [1.7.0](https://github.com/ventsislavnikolov/renderia/compare/v1.6.2...v1.7.0) (2026-06-07)


### Performance Improvements

* **workspace:** eliminate task-list re-fetch on project navigation ([de2229b](https://github.com/ventsislavnikolov/renderia/commit/de2229bdc9c5bf64d3263b668740cda421262483))

## [1.6.2](https://github.com/ventsislavnikolov/renderia/compare/v1.6.1...v1.6.2) (2026-06-07)


### Performance Improvements

* **sidebar:** preload all projects and tasks on mount ([5d03810](https://github.com/ventsislavnikolov/renderia/commit/5d03810340a01f7a00a0d77e45a41d0b80e1b72f))

## [1.6.1](https://github.com/ventsislavnikolov/renderia/compare/v1.6.0...v1.6.1) (2026-06-07)


### Bug Fixes

* **sidebar:** prevent remount on project navigation ([6115871](https://github.com/ventsislavnikolov/renderia/commit/611587107173b993fdbed0381cbe12cdffcc12c4))

# [1.6.0](https://github.com/ventsislavnikolov/renderia/compare/v1.5.1...v1.6.0) (2026-06-07)


### Features

* **sidebar:** add ChatGPT-style user profile menu ([#20](https://github.com/ventsislavnikolov/renderia/issues/20)) ([42c67b3](https://github.com/ventsislavnikolov/renderia/commit/42c67b316df0c3d27124302379502d0504a2e373))

## [1.5.1](https://github.com/ventsislavnikolov/renderia/compare/v1.5.0...v1.5.1) (2026-06-07)


### Bug Fixes

* sync pnpm lockfile ([ad137e7](https://github.com/ventsislavnikolov/renderia/commit/ad137e7100380a776a61fb33cb2ecd9f9fee702e))

# [1.5.0](https://github.com/ventsislavnikolov/renderia/compare/v1.4.0...v1.5.0) (2026-06-01)

# [1.4.0](https://github.com/ventsislavnikolov/renderia/compare/v1.3.0...v1.4.0) (2026-05-30)

# [1.3.0](https://github.com/ventsislavnikolov/renderia/compare/v1.2.2...v1.3.0) (2026-05-30)

## [1.2.2](https://github.com/ventsislavnikolov/renderia/compare/v1.2.1...v1.2.2) (2026-05-30)

## [1.2.1](https://github.com/ventsislavnikolov/renderia/compare/v1.2.0...v1.2.1) (2026-05-30)

# [1.2.0](https://github.com/ventsislavnikolov/renderia/compare/v1.1.0...v1.2.0) (2026-05-30)

# [1.1.0](https://github.com/ventsislavnikolov/renderia/compare/v1.0.1...v1.1.0) (2026-05-27)

## [1.0.1](https://github.com/ventsislavnikolov/renderia/compare/v1.0.0...v1.0.1) (2026-05-27)

# 1.0.0 (2026-05-27)


### Bug Fixes

* **ai:** address Task 4 code-review blockers ([f808cba](https://github.com/ventsislavnikolov/renderia/commit/f808cba1440194bdbca35ad304931871aa173059))
* **ai:** address Task 5 code-review blockers ([84e64f6](https://github.com/ventsislavnikolov/renderia/commit/84e64f6c6a1b654cb96954f83330bb823f86f015))
* **ai:** rewrite detection prompt for tight, specific bounding boxes ([2425c92](https://github.com/ventsislavnikolov/renderia/commit/2425c920b5bd6fa949166cf53eedca9e2d3a8d66))
* **ai:** use .nullable() instead of .optional() for OpenAI strict mode ([c5f145d](https://github.com/ventsislavnikolov/renderia/commit/c5f145d69988b7cc82091223ba989b42726c8e4e))
* **ai:** use vision + structured outputs for OpenAI provider ([7f96370](https://github.com/ventsislavnikolov/renderia/commit/7f96370ebab00f1733063dfa7b2f47a9caadb272))
* **auth:** add /auth/callback route to handle PKCE code exchange ([baf2d62](https://github.com/ventsislavnikolov/renderia/commit/baf2d62a15133ae3c598be75f467a1633278f3d3))
* **auth:** address Task 3 code-review blockers ([74a3494](https://github.com/ventsislavnikolov/renderia/commit/74a34946c2047fd043d0ff3814baa71f3ab8ee0c))
* **auth:** make /auth/callback a flat route, not nested under /auth ([a10dba4](https://github.com/ventsislavnikolov/renderia/commit/a10dba409f2fbd7dc0b5358335c72eff72338fe3))
* enforce renovation schema invariants ([b967018](https://github.com/ventsislavnikolov/renderia/commit/b9670183e287498da1ac8457119dc2a1f9f62c54))
* remove duplicate schema relationships ([e9580c4](https://github.com/ventsislavnikolov/renderia/commit/e9580c4c7c1b5e5e7b414feebf173247af08302b))
* **server:** enforce RLS, add parent-ownership checks, sanitize errors ([7c9942b](https://github.com/ventsislavnikolov/renderia/commit/7c9942ba609f519d643b29e15f54549b24e8a60c))
* **workspace:** address Task 7 code-review findings (HIGH-1, MED-1..7) ([8319add](https://github.com/ventsislavnikolov/renderia/commit/8319add807f9529de30796f4b0e4662a3c71c94d)), closes [HI#1](https://github.com/HI/issues/1) [HI#1](https://github.com/HI/issues/1)
* **workspace:** address Task 8 code-review findings (HIGH-1..2, MED-3..6, LOW-2) ([491de4e](https://github.com/ventsislavnikolov/renderia/commit/491de4eeb72fe1ed0072c0de2668437c9f42f0d2)), closes [HI#1](https://github.com/HI/issues/1) [HI#2](https://github.com/HI/issues/2)
* **workspace:** keep overlay layout stable when debug panel opens ([741acfa](https://github.com/ventsislavnikolov/renderia/commit/741acfa0ffb698d40f8b270564fa10d4607774bf))


### Features

* add magic link auth entry ([fd80156](https://github.com/ventsislavnikolov/renderia/commit/fd80156aea87b8e1685ac9423af428ae6dc540c3))
* add renovation workspace schema ([6c9b1d8](https://github.com/ventsislavnikolov/renderia/commit/6c9b1d8abba1acc569f02a78f0dd66514ea9443c))
* **ai:** add openai renovation provider (Task 5) ([3ce3887](https://github.com/ventsislavnikolov/renderia/commit/3ce388751e76f7c3bfe750169604af70faab2ed1))
* **ai:** downgrade text model from gpt-5.5 to gpt-5.4-mini ([a1dd6c0](https://github.com/ventsislavnikolov/renderia/commit/a1dd6c06b2021a90aded4e0558fc3698ecff7a94))
* **ai:** upgrade image model from gpt-image-1.5 to gpt-image-2 ([a884e55](https://github.com/ventsislavnikolov/renderia/commit/a884e55b48b5c1dbd280a0aaaae43071238d2342))
* **ai:** upgrade text model to gpt-5.5 + tighten detection prompt ([e815980](https://github.com/ventsislavnikolov/renderia/commit/e815980b58d95d68a3b9e2ae63655989b96c320c))
* **ai:** upgrade text/vision model from gpt-5-mini to gpt-5 ([2818ee8](https://github.com/ventsislavnikolov/renderia/commit/2818ee8f97001fc857840df2d908c1ed95756342))
* define renovation ai provider boundary ([c9c38a8](https://github.com/ventsislavnikolov/renderia/commit/c9c38a8a4590d617cc8d21574f77a20cfb65f4f4))
* **design:** clean Codex-style theme with Inter sans ([6835413](https://github.com/ventsislavnikolov/renderia/commit/6835413cb8a581a6c7ee33d9740f685b75f47618))
* **design:** editorial system — fonts, tokens, type, base components ([df70625](https://github.com/ventsislavnikolov/renderia/commit/df706255b956f37c73ef928c3d98bbaf6f875cff))
* **generation:** wire real image generation end-to-end ([68267ad](https://github.com/ventsislavnikolov/renderia/commit/68267ad25ae311173d4dde785fc1980fef83c290))
* guided renovation workspace (10 tasks) ([ff0a242](https://github.com/ventsislavnikolov/renderia/commit/ff0a24232a4399b78bb4fe7a2230ab9353586e69))
* **server:** add renovation server functions (Task 6) ([da8e152](https://github.com/ventsislavnikolov/renderia/commit/da8e1523f1dc6bcd7ece55ed07353cd266b16c28))
* **server:** persist protected elements ([383e50d](https://github.com/ventsislavnikolov/renderia/commit/383e50deb6db0845140efbc8ddc8bb332a4347a9))
* **ui:** dev-only debug panel for AI requests in the guided flow ([0a4dd30](https://github.com/ventsislavnikolov/renderia/commit/0a4dd309b3c48d2937c657316eb7f69dd00aff9c))
* **workspace:** add project + task workspace UI (Task 7) ([27856ad](https://github.com/ventsislavnikolov/renderia/commit/27856ad35eba13aaef759d16be2313c62ea24da4))
* **workspace:** build guided renovation flow UI (Task 8) ([ada1e76](https://github.com/ventsislavnikolov/renderia/commit/ada1e76ce3f81a3f8184e8f9c290b9ae31024fc2))
* **workspace:** image-edit generation, readable bbox labels, AI error unwrap ([19b85fd](https://github.com/ventsislavnikolov/renderia/commit/19b85fdfc8dbcbb749a5adea7be022e7f0bd19e9))
* **workspace:** load saved protected elements on mount ([ae88125](https://github.com/ventsislavnikolov/renderia/commit/ae88125dddd097154304c0ef01645563bae5f747))
* **workspace:** photo thumbnails + bigger generation grid ([f2a65b4](https://github.com/ventsislavnikolov/renderia/commit/f2a65b4a59544690448ef294211fc75444fd0145))

# Changelog

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://www.conventionalcommits.org) for commit guidelines
and [semantic-release](https://github.com/semantic-release/semantic-release) for
how this file is maintained.
