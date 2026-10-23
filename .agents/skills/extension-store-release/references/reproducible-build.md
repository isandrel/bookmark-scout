# Checking the reviewer rebuild

AMO reviewers rebuild the Firefox package from the sources ZIP. Clean rebuilds match each other byte for byte, even at different paths, but differ from a developer-checkout build in minified names, so compare the reviewer rebuild with the CI release asset, never a local build. Before a release exists, a release-style build from a clean export stands in for it:

```bash
mkdir -p ~/.cache/bookmark-scout-repro/{export,review,release}
git archive HEAD | tar -x -C ~/.cache/bookmark-scout-repro/export
(cd ~/.cache/bookmark-scout-repro/export && bun install --frozen-lockfile && cd apps/extension && bun run zip)
unzip -q ~/.cache/bookmark-scout-repro/export/apps/extension/dist/*-sources.zip -d ~/.cache/bookmark-scout-repro/review
unzip -q ~/.cache/bookmark-scout-repro/export/apps/extension/dist/*-firefox.zip -d ~/.cache/bookmark-scout-repro/release
(cd ~/.cache/bookmark-scout-repro/review && bun install --frozen-lockfile && cd apps/extension && bun run build:firefox)
diff <(cd ~/.cache/bookmark-scout-repro/release && find . -type f | sort | xargs shasum -a 256) \
     <(cd ~/.cache/bookmark-scout-repro/review/apps/extension/dist/firefox-mv2 && find . -type f | sort | xargs shasum -a 256)
```

A CSS change also renames every chunk that imports it, so one extra rule shows up as a dozen differing files; diff the CSS first.
