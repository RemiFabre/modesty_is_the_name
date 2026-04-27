import { PROFILE_PRESETS } from "./shared/types.ts";

// Optional first arg: id of preset to AVOID (e.g. the previous game's preset).
const exclude = process.argv[2];

const candidates = PROFILE_PRESETS.filter((p) => p.id !== exclude);
const pick =
  candidates[Math.floor(Math.random() * candidates.length)] ?? PROFILE_PRESETS[0];

console.log(
  JSON.stringify({
    id: pick.id,
    label: pick.label,
    axes: pick.axes,
  }),
);
