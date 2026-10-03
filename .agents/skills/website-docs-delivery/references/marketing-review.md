# Marketing, SEO, and store-copy review

Use this when reviewing or rewriting the website, docs, or store listings against marketing and search best practice. Research current guidance online first (anchored to today's date), cite each source as a link in the review, and mark every finding as confirmed (seen in the built `out/` HTML or the live site) or inferred (read from source).

## Landing page

- The headline names a benefit, not the product name.
- Use real screenshots, a problem-then-solution story, and an FAQ that answers objections.
- One primary install action, labelled honestly (for example "beta, manual install") until a store listing exists.
- Lead with what makes the product different (here: privacy, local-first). Move the tech stack to the docs.
- Three headline benefits beat ten equal cards.

## Claims

- Check every feature claim, including structured data, against the per-browser surface table in `store/README.md`. Firefox cannot replace its bookmarks page; the manager opens from a popup button there, and its tools are not covered by Firefox tests, so check manager and maintenance claims against that table.
- Values such as URLs, store links, contact addresses, versions, and dates come from `config/project.toml` and `config/web.toml`, never literals in copy.

## Structured data and previews

- Never ship a self-assigned `aggregateRating`: Google's review-snippet rules forbid it and it risks a manual penalty. Add ratings only when real store reviews are shown on the page.
- No hard-coded `softwareVersion`; `screenshot` and `downloadUrl` must point at real files.
- Open Graph images are 1200×630 with `summary_large_image`, never the small app icon. Translate the title and description per locale, and make sure no title repeats the site name through a title template.
- `sitemap.ts` `lastModified` should be a real content date, not `new Date()` at build time, which changes on every build.

## Store listings

- Put the main keyword and benefit in the first 150 characters of the description.
- Chrome and Edge show the locale `extDescription` (at most 132 characters); the Firefox summary allows 250. Count Unicode characters with a script for `ja` and `ko`.
- Up to five 1280×800 screenshots, the first showing the product in use.
- No superlatives, keyword stuffing, or claims about other products; stores suspend listings for them.
- Re-sync listing and privacy copy after merging `main` mid-PR: a feature that landed meanwhile may need disclosing.

## Docs

- Organize by reader need (tutorials, how-to guides, reference, explanation), and get a new user to a first success quickly.
- Keep user install steps apart from contributor setup.
