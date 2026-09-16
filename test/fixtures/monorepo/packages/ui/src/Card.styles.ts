import { tss } from "./tss-shim";

export const useCardStyles = tss.create(() => ({
  header: { fontWeight: "bold" },
  body: { padding: 8 },
  footer: { textAlign: "right" },
  unusedLabel: { color: "red" },
}));
