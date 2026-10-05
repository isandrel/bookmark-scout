---
name: feature-research-planning
description: Plan a new Bookmark Scout capability, redesign, or large refactor research-first - map the current code, research current libraries, docs, and comparable products online, then present options with a recommended default and a phased PR plan before writing code. Use whenever the user asks to "plan first", "search online", "see what we can adopt", optimize UI/UX from references, add support for a new kind of provider or integration, or review the codebase for improvements, even if they do not say "plan".
---

# Feature research and planning

Research changed the code in past sessions: it found an incompatible provider package and a missing browser header before implementation, and an inventory of current surfaces found two real bugs before any design work. Plan first when the request is broad; for a small, clear change, skip this skill.

## 1. Map and research in parallel

Start two background subagents at once and write nothing until both report:

- **Code map** (read-only): the files, functions, settings, tests, and docs the feature touches, with paths and line numbers, plus bugs noticed on the way.
- **Online research**, anchored to today's date: current versions and docs of the libraries in play (check the installed `node_modules` version too, because upstream docs can be ahead of it), alternatives worth adopting, and how comparable products solve it. Read GitHub repositories with `gh api repos/<owner>/<repo>/contents/<path>` (decode the base64 `content`) rather than web fetching. Return sources as links.

For a reference product, have the research return a pattern table ("Pattern | What it means for us") and map each pattern onto this repository's data model. That table produced named AI services, local-server presets, and a default-service switcher.

## 2. Present options, recommend one

Give two or three options with sizes, trade-offs, and what each leaves out, and mark one "(recommended)". Ask only what is genuinely the maintainer's call (product behavior, data leaving the device, permanent identifiers); decide conventional details yourself and say so. Record the answers in the plan.

Check every option against the root `AGENTS.md` "Engineering intent" rules: configurable values in config files, extensible data-driven tables, user-facing settings with sensible defaults, no duplicated logic, all copy localized.

## 3. Write the plan

Put it in `plans/<date>-<topic>.md` (git-ignored, local only) when it spans more than one PR. Include:

- the decisions and their reasons;
- a phased PR order (foundations first, then one surface or area per PR), with the files each phase owns so phases can run as parallel agents without conflicts (see the `parallel-agent-delivery` skill);
- for each phase: tests to add, docs and disclosures to update, and the verification commands;
- what is deliberately out of scope.

Critique the plan once against generic defaults before dispatching builders ("would a careful maintainer of this product choose this, or is it the template answer?").

## 4. Hand off

Implementation follows the area skill: `extension-ui-change`, `extension-ai-feature`, `extension-store-release`, or `website-docs-delivery`. When the maintainer adds requirements mid-flight, fold them into the plan and tell running agents, rather than letting the plan go stale.
