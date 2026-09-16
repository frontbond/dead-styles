import { makeStyles } from "./tss-shim";

// Reproduces a real production bug: several SIBLING components in the same
// file each call the hook and destructure their OWN `classes` binding.
// ts-morph's reference search for a shorthand-destructured `classes` can
// widen to the shared mapped-type property declaration and leak these
// bindings into each other if usage-tracing isn't scoped correctly.
export const useIconVariants = makeStyles()({
  active: { color: "blue" },
  completed: { color: "green" },
  error: { color: "red" },
  inactive: { color: "gray" },
});
