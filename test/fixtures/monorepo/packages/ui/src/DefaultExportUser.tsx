import useDefaultStyles from "./DefaultExport.styles";

// Note the LOCAL NAME here ("useDefaultStyles") doesn't have to match
// anything in the defining file — it's a default import.
export function DefaultExportUser() {
  const { classes } = useDefaultStyles();
  return <div className={classes.wrapper} />;
}
