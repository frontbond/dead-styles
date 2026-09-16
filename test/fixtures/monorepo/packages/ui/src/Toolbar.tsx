import { useToolbarStyles } from "./Toolbar.styles";

// MUI-legacy style: makeStyles' result is bound directly (no destructuring).
// `icon` is never referenced anywhere in the project — genuinely dead.
export function Toolbar() {
  const classes = useToolbarStyles();
  return <div className={classes.root} />;
}
