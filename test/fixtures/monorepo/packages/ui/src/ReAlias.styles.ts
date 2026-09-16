import { makeStyles } from "./tss-shim";

// Reproduces a real production bug: the default import gets re-assigned to
// a plain local variable BEFORE it's ever called — `const useStyles =
// styles;` — and the call happens on that alias, not on the import binding
// itself.
export default makeStyles()({
  targetTitle: { minWidth: 0 },
  unusedAlias: { color: "red" },
});
