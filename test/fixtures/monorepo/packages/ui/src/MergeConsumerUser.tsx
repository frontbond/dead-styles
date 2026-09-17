import { useMergeConsumerStyles } from "./MergeConsumer.styles";

export function MergeConsumerUser() {
  const { classes } = useMergeConsumerStyles();
  return <div className={classes.ownClass} />;
}
