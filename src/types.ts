export interface DefinedClass {
  name: string;
  line: number;
  column: number;
}

export interface StyleHookCandidate {
  /** Name of the hook variable, e.g. `useStyles`. */
  hookName: string;
  /** File where the hook is *defined* (where makeStyles/tss.create is called). */
  filePath: string;
  line: number;
  /** The factory that produced this hook: which library convention matched. */
  factory: "makeStyles" | "tss.create";
  definedClasses: DefinedClass[];
  /** true if the styles object had at least one computed property key (`[x]: {...}`). */
  hasComputedDefinitionKeys: boolean;
}

export type HookStatus =
  | "analyzed"
  | "no-call-sites"
  | "skipped-dynamic"
  | "skipped-spread";

export interface CallSite {
  filePath: string;
  line: number;
}

export interface HookResult {
  hook: StyleHookCandidate;
  status: HookStatus;
  callSites: CallSite[];
  /** Union of class keys observed as used across every call site. */
  usedClassNames: string[];
  deadClasses: DefinedClass[];
}

export interface SassClassDefinition {
  className: string;
  filePath: string;
  line: number;
}

export interface SassClassResult extends SassClassDefinition {
  used: boolean;
}

export interface ScanResult {
  results: HookResult[];
  /** Present only when one or more --sass files were scanned. */
  sassResults?: SassClassResult[];
}
