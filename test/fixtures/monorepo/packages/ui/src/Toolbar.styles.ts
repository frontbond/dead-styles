import { makeStyles } from "./tss-shim";

export const useToolbarStyles = makeStyles((theme) => ({
  root: { display: "flex" },
  icon: { marginRight: 4 },
}));
