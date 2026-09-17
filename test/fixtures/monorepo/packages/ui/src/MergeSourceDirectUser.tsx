import { useMergeSourceStyles } from "./MergeSource.styles";

export function MergeSourceDirectUser() {
  const { classes } = useMergeSourceStyles();
  // Deliberately does NOT reference classes.mergedClass — that class is
  // only reachable through MergeConsumer.styles.ts's spread-merge.
  return <div className={classes.directOnly} />;
}
