import clsx from "clsx";

// Exercises all three usage syntaxes the global.sass fixture's dead classes
// are checked against: a bare string, a clsx() string argument, and a
// clsx() object key.
export function SassConsumer(props: { flag: boolean }) {
  return (
    <div className="usedDirect">
      <span className={clsx("usedViaClsx", { usedInObjectKey: props.flag })} />
    </div>
  );
}
