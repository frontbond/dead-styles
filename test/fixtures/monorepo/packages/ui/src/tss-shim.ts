// Minimal stand-in for the real `tss-react` / `@mui/styles` APIs, just
// enough shape for the fixtures to type-check without pulling in the real
// (heavy) libraries. dead-styles only looks at the *syntax* of the call —
// `tss.create(...)` / `makeStyles(...)` — not at real runtime behavior.
export const tss = {
  create<T extends Record<string, unknown>>(
    styles: T | (() => T),
  ): () => { classes: { [K in keyof T]: string }; cx: (...args: unknown[]) => string } {
    return () => ({ classes: {} as never, cx: () => "" });
  },
};

export function makeStyles<T extends Record<string, unknown>>(
  styles: T | ((theme: unknown) => T),
): () => { [K in keyof T]: string } {
  return () => ({} as never);
}
