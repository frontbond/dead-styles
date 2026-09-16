import styles from "./ReAlias.styles";

// Real-world pattern seen in production: the import is re-assigned to a
// plain local variable, and THAT is what actually gets called.
const useStyles = styles;

export function PlanHeaderLike() {
  const { classes } = useStyles();
  return <div className={classes.targetTitle} />;
}
