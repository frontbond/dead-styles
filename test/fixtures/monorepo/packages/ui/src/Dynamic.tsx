import { useDynamicStyles } from "./Dynamic.styles";

// Accessed via a computed key — can't tell statically whether `x` or `y`
// (or both) are actually used, so this must be skipped, not flagged.
export function Dynamic(props: { variant: "x" | "y" }) {
  const { classes } = useDynamicStyles();
  return <div className={classes[props.variant]} />;
}
