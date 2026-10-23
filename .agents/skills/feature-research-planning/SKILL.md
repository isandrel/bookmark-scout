---
name: feature-research-planning
description: Plan a new Bookmark Scout capability, redesign, or large refactor research-first - map the current code, research current libraries, docs, comparable products, and user feedback online, then present options with a recommended default and a phased PR plan before writing code. Use whenever the user asks to "plan first", "search online", "see what we can adopt", optimize UI/UX from references, find out what users say about a feature on Reddit, forums, or store reviews, add support for a new kind of provider or integration, or review the codebase for improvements, even if they do not say "plan".
---

# Feature research and planning

Research changed the code in past sessions: it found an incompatible provider package and a missing browser header before implementation, and an inventory of current surfaces found two real bugs before any design work. Plan first when the request is broad; for a small, clear change, skip this skill.

## 1. Map and research in parallel

Start two background subagents at once and write nothing until both report:

- **Code map** (read-only): the files, functions, settings, tests, and docs the feature touches, with paths and line numbers, plus bugs noticed on the way.
- **Online research**, anchored to today's date: current versions and docs of the libraries in play (check the installed `node_modules` version too, because upstream docs can be ahead of it), alternatives worth adopting, and how comparable products solve it. Read GitHub repositories with `gh api repos/<owner>/<repo>/contents/<path>` (decode the base64 `content`) rather than web fetching. Return sources as links.

For parity with a browser's own feature (the bookmark manager, shortcuts), read the browser's source as the spec, for example Chromium's `chrome/browser/resources/bookmarks/` and Firefox's `places` strings. A commit's release lives on Chromium's `refs/branch-heads/<n>` (the GitHub mirror has `main` only), matched against the release schedule. Test platform limits with a throwaway Playwright experiment before planning around them: one found that an overridden page's address bar never follows `pushState`, which reshaped the manager-address plan.

For a reference product, have the research return a pattern table ("Pattern | What it means for us") and map each pattern onto this repository's data model. That table produced named AI services, local-server presets, and a default-service switcher.

### What users say (Reddit, forums, store reviews)

When the user asks what people want, or to "search Reddit", collect real feedback: threads about the feature in Reddit and other forums, rival products' public feature-request boards, and store reviews. Quote a few short lines with links and vote counts, and say which findings change the plan; on covers, one thread asked for page images rather than whole-page screenshots and another for exporting thumbnails, and both became options.

Reddit refuses the agent's own web search and fetch, the built-in browser, and anonymous requests to its JSON endpoints. With the user's explicit permission, read it through their own Chrome over the DevTools protocol:

1. The user turns on remote debugging (`chrome://inspect/#remote-debugging` in current Chrome). Chrome then asks them to allow **each new connection**, so probing first and reading later meant a second approval that nobody saw; open one connection and do everything in it.
2. Write the addresses to a JSON file: `old.reddit.com` search (`/search.json?q=<terms>&limit=25`), then each promising thread's `.json` (`/r/<sub>/comments/<id>/.json?sort=top`).
3. Run `bun .agents/skills/feature-research-planning/scripts/read-pages-cdp.ts <urls.json> ~/.cache/bookmark-scout-<topic>/pages.json --reddit` (options in its header). It reads the port and browser path from Chrome's `DevToolsActivePort`, opens one background tab, reads each page, closes the tab, and prints search results or each thread's post and top comments; `--from <pages.json> --reddit` prints a saved run again. A JSON-viewer extension in that Chrome may add text around the JSON; the script keeps only the JSON.
4. Touch nothing else in that browser: no sign-in, no posting or voting, no other tabs.

## 2. Present options, recommend one

Give two or three options with sizes, trade-offs, and what each leaves out, and mark one "(recommended)". When the options are behaviors a user could reasonably prefer, include "a setting with these as strategies and a smart default": offered last-used versus a fixed folder for quick save, the maintainer chose a configurable ranking strategy with a ranked default instead. Ask only what is genuinely the maintainer's call (product behavior, data leaving the device, permanent identifiers); decide conventional details yourself and say so. Record the answers in the plan.

Check every option against the root `AGENTS.md` "Engineering intent" rules: configurable values in config files, extensible data-driven tables, user-facing settings with sensible defaults, no duplicated logic, all copy localized.

## 3. Write the plan

Put it in `plans/<date>-<topic>.md` (git-ignored, local only) when it spans more than one PR. Include:

- the decisions and their reasons;
- a phased PR order (foundations first, then one surface or area per PR), with the files each phase owns so phases can run as parallel agents without conflicts (see the `parallel-agent-delivery` skill);
- for each phase: tests to add, docs and disclosures to update, and the verification commands;
- what is deliberately out of scope.

Critique the plan once against generic defaults before dispatching builders ("would a careful maintainer of this product choose this, or is it the template answer?").

## 4. Hand off

Implementation follows the area skill: `extension-ui-change`, `extension-ai-feature`, `extension-bookmark-actions`, `extension-stored-data`, `extension-performance`, `mcp-bridge-change`, `extension-store-release`, or `website-docs-delivery`. When the maintainer adds requirements mid-flight, fold them into the plan and tell running agents, rather than letting the plan go stale.
