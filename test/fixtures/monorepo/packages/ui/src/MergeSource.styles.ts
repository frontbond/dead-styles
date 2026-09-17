import { makeStyles } from "tss-react/mui";

// Real production pattern: `directOnly` is genuinely reached through this
// hook's own direct call site (MergeSourceDirectUser.tsx), while
// `mergedClass` is only ever reachable through MergeConsumer.styles.ts's
// `{ ...useMergeSourceStyles }` merge into a brand-new makeStyles() call —
// something no direct-call-site trace of *this* hook can see, since that
// merge never actually calls useMergeSourceStyles() at all.
export const useMergeSourceStyles = makeStyles()({
  directOnly: {},
  mergedClass: {},
});
