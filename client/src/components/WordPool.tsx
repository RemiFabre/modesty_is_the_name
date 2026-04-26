export interface WordPoolProps {
  words: readonly string[];
  selected?: ReadonlySet<string>;
  onToggle?: (word: string) => void;
  highlight?: ReadonlySet<string>;
  disabled?: boolean;
}

export function WordPool({
  words,
  selected,
  onToggle,
  highlight,
  disabled,
}: WordPoolProps) {
  return (
    <div className="pool" role="list">
      {words.map((w) => {
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
            key={w}
            type="button"
            role="listitem"
            className={className}
            onClick={() => interactive && onToggle?.(w)}
            disabled={!interactive}
          >
            {w}
          </button>
        );
      })}
    </div>
  );
}
