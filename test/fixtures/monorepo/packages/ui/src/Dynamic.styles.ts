import { tss } from "./tss-shim";

export const useDynamicStyles = tss.create({
  x: { color: "black" },
  y: { color: "white" },
});
