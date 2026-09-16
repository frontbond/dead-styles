import { useCardStyles } from "./Card.styles";

// Only `header` and `body` are used HERE. `footer` is used from a totally
// different package (packages/app/src/ExtraCardUsage.tsx) — a same-file
// tool would wrongly flag `footer` as dead. `unusedLabel` really is dead.
export function Card() {
  const { classes } = useCardStyles();
  return (
    <div className={classes.header}>
      <span className={classes.body}>hello</span>
    </div>
  );
}
