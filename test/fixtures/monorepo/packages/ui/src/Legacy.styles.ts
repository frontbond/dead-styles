import { makeStyles } from "./tss-shim";

// Exported but never called anywhere in the project.
export const useLegacyStyles = makeStyles(() => ({
  wrapper: { border: "1px solid" },
  label: { fontSize: 12 },
}));
