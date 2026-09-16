# dead-styles

Find CSS-in-JS classes (tss-react / MUI `makeStyles` / JSS) that are defined but never used **anywhere in the project** — including when the styles hook is defined in one file and called from several others (a very common convention: `Component.styles.ts` + `Component.tsx`, or a shared hook consumed by many components across a monorepo).

> Unofficial, third-party tool. Not affiliated with or endorsed by tss-react, MUI, or Knip.

## Why not just use an ESLint rule?

There's already a good ESLint rule for this: [`eslint-plugin-tss-unused-classes`](https://github.com/garronej/eslint-plugin-tss-unused-classes), officially recommended by the [tss-react docs](https://docs.tss-react.dev/detecting-unused-classes). Use it if it fits your setup.

Its limitation (inherent to how ESLint rules work — one file's AST at a time) is that it can only see a class as "used" if `classes.foo` appears **in the same file** as the `makeStyles`/`tss.create()` call. The moment styles are defined in their own file and the hook is called from a different file (or from several different files/packages), every class in that styles file gets reported as unused — a 100% false-positive rate for that very common layout.

`dead-styles` uses the TypeScript compiler API (via [ts-morph](https://github.com/dsherret/ts-morph)) to resolve the hook's declaration, find **every** call site across the whole project (any file, any package in a monorepo), and union up class usage across all of them before deciding anything is dead.

## What it supports

- `makeStyles((theme) => ({...}))` — classic MUI v4 / `@mui/styles` single-call form
- `makeStyles(options)((theme, params) => ({...}))` — tss-react's curried `createMakeStyles()` form
- `makeStyles()({...})` exported as a bare `export default` (the `tss-react/mui` convention), with **no local variable at all** — each importing file picks its own local name, and every one of them is resolved back to the same definition
- `tss.create({...})` / `tss.create((params) => ({...}))`
- `tss.withParams<...>().create(...)`, `tss.withName(...).create(...)`, and any other chain ending in `.create(...)`
- Both `const classes = useStyles()` (direct binding) and `const { classes } = useStyles()` (destructured, with or without renaming)
- A hook re-assigned to a plain local variable before it's called (`import styles from "./styles"; const useStyles = styles; ...; useStyles()`), followed transitively through any number of hops
- Cross-file and cross-package (monorepo `paths`-alias) resolution of every call site

## What it deliberately does NOT guess

To keep the false-positive rate near zero, `dead-styles` skips (rather than reports on) a hook whenever it can't fully verify usage:

- The styles object has a computed property key (`{ [dynamic]: {...} }`) — the class's real name isn't known statically.
- A class is accessed via a computed/dynamic key (`classes[someVariable]`) instead of `classes.foo` — could be any class.
- The whole `classes` object is forwarded somewhere we can't follow (spread with `{...classes}`, passed as a prop to a child component, assigned to another variable, returned from a function, etc.).

Skipped hooks are reported separately so you know what wasn't checked, but never show up as "dead."

## Global stylesheet classes (`--sass` / `--scss` / `--css`)

Some projects also keep a global stylesheet of plain classes (text styles, color utilities, etc.), applied via literal strings (`className="textStylesActive"`, `clsx(...)`, `classnames(...)`) rather than through a CSS-in-JS hook. Pass one or more `--sass <path>` (indented syntax), `--scss <path>` (brace syntax), and/or `--css <path>` flags — any combination, repeatable — to also check those:

```bash
npx dead-styles scan --tsconfig ./tsconfig.json \
  --sass ./src/styles/global.sass \
  --scss ./src/styles/global.scss \
  --css ./src/styles/global.css
```

This works completely differently from the CSS-in-JS strategy above — there's no hook, no call site, no `classes` object to trace. Instead:

1. Every **top-level** class selector in the file is a candidate — `.foo` or `.foo, .bar` (including split across lines). "Top-level" means different things depending on the syntax:
   - `--sass` (indented syntax): an unindented line. A pseudo-class like `&:hover`, a modifier block like `.root-blazing .foo`, or anything under a `@media` block is indented, so it's a nested reference, not a definition, and is ignored.
   - `--scss` / `--css` (brace syntax): a selector block that isn't nested inside any `{ }` at all. SCSS nesting (`&:hover { ... }`, `.foo .bar { ... }`), and anything inside an `@media`/`@supports`/`@keyframes`/`@font-face` block, is one level deeper and is ignored the same way.
2. Every JS/TS/JSX/TSX file in the project is scanned for that exact class name appearing anywhere as a literal token — as a bare string, inside `clsx()`/`classnames()`/`cx()` (string arguments or object keys), or inside a template literal.
3. Anything never found this way is reported as an unused global stylesheet class.

**Known blind spots**:

- A class name assembled dynamically at runtime (`'textStyles' + variant`) won't be seen as a literal token and will be reported as unused even if it's actually applied. This is a one-directional risk — it can under-report (miss a real usage) but never over-report a class that's genuinely referenced by a static string, so it's a safe default, just not exhaustive.
- Only simple class selectors are recognized as definitions; compound selectors (`.a.b`), descendant/tag/id selectors, and anything nested (see above) aren't picked up as definitions — they're silently skipped, never guessed at.
- For `--scss`, a `//` line comment right before a `url(...)` is deliberately *not* treated as the start of a comment when it's preceded by a `:` (covers `url(http://...)`/`url(https://...)`), but an unquoted, protocol-relative `url(//cdn.example.com/...)` has no `:` to guard it and could still be mis-treated as a comment start. Quoting the URL (`url("//cdn.example.com/...")`) avoids this entirely and is good practice regardless.

## Not (yet) supported

- Plain CSS Modules (`*.module.css`) — see [`check-unused-css`](https://github.com/malinindev/check-unused-css) for that.
- `styled-components` / `emotion`'s `styled` tagged templates.
- React Native `StyleSheet.create` / `eslint-plugin-react-native`'s `no-unused-styles` territory.
- Tailwind utility classes — Tailwind's own JIT compiler already purges genuinely unused utility classes at build time, so static "unused class" detection isn't meaningful there. Custom `@layer components` classes are a different, still-unhandled case.

These may become separate strategies/tools later; PRs welcome.

## Install

```bash
npm install --save-dev dead-styles
```

## Usage

```bash
npx dead-styles scan --tsconfig ./tsconfig.json
```

### Options

| Flag | Description | Default |
| --- | --- | --- |
| `--tsconfig <path>` | Path to `tsconfig.json` (required) | — |
| `--sass <path>` | Path to a global Sass (indented syntax) file to also scan for unused classes (repeatable) | — |
| `--scss <path>` | Path to a global SCSS (brace syntax) file to also scan for unused classes (repeatable) | — |
| `--css <path>` | Path to a global plain CSS file to also scan for unused classes (repeatable) | — |
| `--format <format>` | `text`, `markdown`, or `json` | `text` |
| `--out <path>` | Write output to a file instead of stdout | — |
| `--fail-on <mode>` | `dead-styles` (exit 1 if any found) or `never` | `dead-styles` |

### Example

```bash
npx dead-styles scan --tsconfig ./tsconfig.json --format markdown
```

```md
# dead-styles report

Analyzed 6 style hooks (2 fully verified, 3 skipped).

Found dead classes in 3 style hooks:

### `useCardStyles` — src/Card.styles.ts:3

Called from 2 sites.

- `unusedLabel` (line 7)
...
```

## How it decides a class is "used"

For each style hook (`useStyles`, or whatever you named it):

1. Collect the top-level keys of the object passed to `makeStyles(...)` / `tss.create(...)` — these are the candidate class names.
2. Find every place the hook is *called* anywhere in the project via TypeScript's own symbol resolution (works across `paths` aliases in a monorepo).
3. At each call site, figure out what the returned `classes` got bound to (`const classes = ...` or `const { classes } = ...`).
4. Trace every reference to that local `classes` binding **within its own file** (a local variable can't be referenced outside its lexical scope — cross-file usage happens through additional call sites, not through this identifier).
5. A class is "used" if it shows up as `classes.foo` or `classes['foo']` at **any** call site, anywhere in the project.
6. Anything left over is reported as dead — unless step 3 or 4 hit something unverifiable (see above), in which case the whole hook is skipped instead.

## License

MIT
