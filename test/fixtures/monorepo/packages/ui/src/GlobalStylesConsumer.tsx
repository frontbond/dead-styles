import clsx from "clsx";

// Exercises the same three usage syntaxes as SassConsumer.tsx, but for the
// SCSS and plain-CSS global stylesheet fixtures.
export function GlobalStylesConsumer(props: { flag: boolean }) {
  return (
    <div className={clsx("scssUsedDirect", "cssUsedDirect")}>
      <span
        className={clsx("scssUsedViaClsx", "cssUsedViaClsx", {
          scssUsedInObjectKey: props.flag,
          cssUsedInObjectKey: props.flag,
        })}
      />
    </div>
  );
}
