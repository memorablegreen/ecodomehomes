# Locale parity check

The site is a fully duplicated 5-locale mirror (root/en, `es/`, `fr/`, `pt/`,
`us/`) with no shared templating layer. Every page is a hand-copied HTML file
per locale, so a fix or a new section landed in one locale can silently never
reach the others.

`scripts/check-locale-parity.mjs` is a report/lint tool that flags two cheap,
high-signal drift indicators without trying to enforce word-for-word content
equality (translations are naturally different lengths):

1. **Presence drift**: a page that exists in some locales but not others.
2. **Structural drift**: for a page that exists in 2+ locales, the counts of
   structural tags (`section`, `h1`/`h2`/`h3`, `form`, `img`, `script`,
   `a`) differ enough that a locale likely missed a markup change that landed
   elsewhere.

Run it with:

```
npm run check:locales
```

By default it only reports and exits `0`. Pass `--strict` to exit `1` when
drift is found, for wiring into CI once the current known gaps (for example
`press.html` only existing in `root` and `pt`) are either synced or accepted
as intentional.

This tool does not fix content drift; it makes it visible. Closing a flagged
gap still means copying/translating the missing page or section by hand into
the other locale mirrors.
