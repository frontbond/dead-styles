import { useSpreadyStyles } from "./Spready.styles";

function Child(props: { classes: Record<string, string> }) {
  return <div className={props.classes.a} />;
}

// The whole `classes` object is forwarded as a prop instead of being
// accessed as `classes.x` here. We can't verify which keys `Child` actually
// uses, so this hook must be reported as skipped, not as having dead classes.
export function Spready() {
  const { classes } = useSpreadyStyles();
  return <Child classes={classes} />;
}
