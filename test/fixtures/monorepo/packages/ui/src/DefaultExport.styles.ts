import { makeStyles } from "./tss-shim";

// tss-react/mui's real-world convention: `makeStyles()({...})` exported
// directly as `export default`, with NO local variable at all. Each
// importing file picks its own local name for it, so there's no single
// shared identifier to search from — has to be resolved via every file's
// own default-import binding instead.
export default makeStyles()({
  wrapper: { display: "block" },
  title: { fontWeight: "bold" },
  hint: { fontSize: 11 },
});
