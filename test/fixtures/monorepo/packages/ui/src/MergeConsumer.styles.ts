import { makeStyles } from "tss-react/mui";
import { useMergeSourceStyles } from "./MergeSource.styles";

// Spreads another hook's own export (not its call result) directly into a
// brand-new styles object, then wraps THAT in a new makeStyles() call — the
// pattern from real production code (`const styles = { ...stylesRow,
// ...stylesRowInner }; const useStyles = makeStyles()(styles);`).
export const useMergeConsumerStyles = makeStyles()({
  ...useMergeSourceStyles,
  ownClass: {},
});
