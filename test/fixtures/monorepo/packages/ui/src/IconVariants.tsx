import { useIconVariants } from "./IconVariants.styles";

// Four separate components, same file, each with its OWN local `classes`.
// Every one of the four defined classes is genuinely used — just each in a
// different function scope.
export function ActiveIcon() {
  const { classes } = useIconVariants();
  return <div className={classes.active} />;
}

export function CompletedIcon() {
  const { classes } = useIconVariants();
  return <div className={classes.completed} />;
}

export function ErrorIcon() {
  const { classes } = useIconVariants();
  return <div className={classes.error} />;
}

export function InactiveIcon() {
  const { classes } = useIconVariants();
  return <div className={classes.inactive} />;
}
