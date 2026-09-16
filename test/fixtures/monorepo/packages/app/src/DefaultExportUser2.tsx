import useTitleStyles from "../../ui/src/DefaultExport.styles";

// A DIFFERENT local name, from a DIFFERENT package, using `title`.
// `hint` is never used anywhere — genuinely dead.
export function DefaultExportUser2() {
  const { classes } = useTitleStyles();
  return <span className={classes.title} />;
}
