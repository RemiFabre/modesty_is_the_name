import { useEffect, useRef } from "react";

/** Renders text that shrinks its font size to fit on a single line within
 *  its parent. Useful for pool-cell labels where the cell width is fixed
 *  by the grid but the word length varies. */
export function AutoFitText({
  children,
  maxPx = 16,
  minPx = 9,
}: {
  children: string;
  maxPx?: number;
  minPx?: number;
}) {
  const elRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;

    function fit() {
      // Bail if not yet laid out — the ResizeObserver will fire again.
      if (parent!.clientWidth === 0) return;
      const cs = getComputedStyle(parent!);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const available = parent!.clientWidth - padX;
      let size = maxPx;
      el!.style.fontSize = size + "px";
      // 0.5px steps to keep iterations bounded; ~14 steps from 16 → 9.
      while (size > minPx && el!.scrollWidth > available) {
        size -= 0.5;
        el!.style.fontSize = size + "px";
      }
    }

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [children, maxPx, minPx]);

  return (
    <span
      ref={elRef}
      style={{ whiteSpace: "nowrap", display: "inline-block" }}
    >
      {children}
    </span>
  );
}
