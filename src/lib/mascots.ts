export type MascotId = "writer" | "researcher" | "ops";

export const MASCOT_IDS: MascotId[] = ["writer", "researcher", "ops"];

export const MASCOT_META: Record<
  MascotId,
  { id: MascotId; label: string; blurb: string; defaultColor: "sage" | "clay" | "slate" }
> = {
  writer: { id: "writer", label: "Scrib", blurb: "Paper and pen", defaultColor: "sage" },
  researcher: { id: "researcher", label: "Lens", blurb: "Magnifier", defaultColor: "clay" },
  ops: { id: "ops", label: "Crate", blurb: "Gear and crate", defaultColor: "slate" },
};

export function mascotIdForTemplate(name: string): MascotId {
  const n = name.trim().toLowerCase();
  if (n.includes("writer") || n.includes("draft") || n.includes("scrib")) return "writer";
  if (n.includes("research") || n.includes("lens")) return "researcher";
  if (n.includes("ops") || n.includes("crate")) return "ops";
  return "ops";
}

export function isMascotId(v: unknown): v is MascotId {
  return v === "writer" || v === "researcher" || v === "ops";
}
