import { useEffect, useState } from "react";

export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function fmtCountdown(deadline: number, now: number): string {
  const remainingSec = Math.round((deadline - now) / 1000);
  const sign = remainingSec < 0 ? "-" : "";
  const abs = Math.abs(remainingSec);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${s.toString().padStart(2, "0")}`;
}
