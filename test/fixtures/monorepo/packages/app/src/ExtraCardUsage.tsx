import { useCardStyles } from "@fixture/ui";

// Different package AND different file than where `useCardStyles` is
// defined and than where it's also called (packages/ui/src/Card.tsx).
// Uses `footer`, which packages/ui/src/Card.tsx never touches.
export function ExtraCardUsage() {
  const { classes } = useCardStyles();
  return <div className={classes.footer} />;
}
