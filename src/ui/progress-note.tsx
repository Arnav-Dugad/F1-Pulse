import { Info } from "lucide-react";
import type { SeasonProgress } from "../progress.mjs";
import { pts } from "../lib/format";

const describe = (r?: { n: number } | { k: number; a: number; b: number }) =>
  !r ? "" : "n" in r ? `best ${r.n} results` : `best ${r.a} of the first ${r.k} races and best ${r.b} of the rest`;

/**
 * Explains how a season's points progression relates to the official table: historical
 * dropped-score rules, best-car-only constructor scoring, and official adjustments
 * (exclusions, penalties) that race classifications can't show.
 */
export function ProgressNote({ progress, kind = "both" }: { progress?: SeasonProgress; kind?: "driver" | "constructor" | "both" }) {
  if (!progress) return null;
  const { rules } = progress;
  const lines: string[] = [];
  if (kind !== "constructor" && rules.driver) lines.push(`Drivers counted their ${describe(rules.driver)} this season; totals here apply that rule round by round.`);
  if (kind !== "driver" && (rules.bestCarOnly || rules.constructor) && progress.teams.length && +progress.rounds[0]?.date.slice(0, 4) >= 1958)
    lines.push(`Constructors ${rules.bestCarOnly ? "scored only with their best-placed car" : ""}${rules.bestCarOnly && rules.constructor ? " and counted their " : rules.constructor ? "counted their " : ""}${describe(rules.constructor)}.`);
  if ((kind !== "constructor" && rules.approximate.drivers) || (kind !== "driver" && rules.approximate.constructors))
    lines.push("Shared drives make this season's derived totals approximate.");
  const adj = (progress.adjustments || []).filter((a) => kind === "both" || a.kind === kind);
  if (adj.length)
    lines.push(
      "The official table differs after penalties or exclusions: " +
        adj.map((a) => `${a.name} ${pts(a.official)} official vs ${pts(a.computed)} from classifications`).join("; ") + ".",
    );
  if (!lines.length) return null;
  return (
    <p className="notice progress-note" role="note">
      <Info />
      <span>{lines.join(" ")}</span>
    </p>
  );
}
