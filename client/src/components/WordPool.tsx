import { AutoFitText } from "./AutoFitText";

export interface WordPoolProps {
  words: readonly string[];
  /** Number of columns in the spatial grid. The pool is rendered row-major. */
  cols: number;
  selected?: ReadonlySet<string>;
  onToggle?: (word: string) => void;
  highlight?: ReadonlySet<string>;
  disabled?: boolean;
}

export function WordPool({
  words,
  cols,
  selected,
  onToggle,
  highlight,
  disabled,
}: WordPoolProps) {
  return (
    <div
      className="pool"
      role="list"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {words.map((w, idx) => {
        const isSel = selected?.has(w) ?? false;
        const isHi = highlight?.has(w) ?? false;
        const interactive = Boolean(onToggle) && !disabled;
        const className = [
          "word",
          isSel ? "word-selected" : "",
          isHi ? "word-highlight" : "",
          interactive ? "word-interactive" : "",
          disabled ? "word-disabled" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={idx}
            type="button"
            role="listitem"
            className={className}
            onClick={() => interactive && onToggle?.(w)}
            disabled={!interactive}
          >
            <AutoFitText>{w}</AutoFitText>
          </button>
        );
      })}
    </div>
  );
}
