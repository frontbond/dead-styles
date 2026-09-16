import { tss } from "./tss-shim";

const dynamicKey = "extra" as string;

// A computed key in the *definition* itself — we can't know its real name
// statically, so the whole hook must be treated as unverifiable.
export const useComputedDefStyles = tss.create({
  [dynamicKey]: { color: "purple" },
  plain: { color: "orange" },
});
