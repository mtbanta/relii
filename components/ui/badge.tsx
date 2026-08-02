// THE PILL (PD-8c).
//
// The mockups lean on a small pill for every short status: "Practiced 2 of 3",
// "Locked", "Recording", a mode, a score. The app said all of those as bare
// coloured text, which at the new density reads as just another sentence
// fragment in the row. PD-8a's handoff flagged this as the obvious third
// primitive; the density pass is where it finally earns its place.
//
// Mockup values: 11px, padding 3px by 9px, radius 8px, weight 500.
//
// Same conventions as the other primitives: no "use client", plus a classes()
// export for the places where the element already exists.
import type { ComponentPropsWithRef, ReactNode } from "react";

// neutral  a quiet fact (a mode, a count)
// info     in progress, or the current thing
// success  finished well
// warning  needs attention but is not an error
// danger   an error, or something stopped
export type BadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export type BadgeOptions = {
  tone?: BadgeTone;
  className?: string;
};

const BASE =
  "inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-micro font-medium whitespace-nowrap";

// Each pairing was contrast-checked in PD-8b when these surfaces were adopted:
// danger 6.1:1, warning 5.9:1, success 5.4:1, all clear of the 4.5:1 that AA
// requires for text this small.
const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-secondary text-content-secondary",
  info: "bg-surface-info text-content-info",
  success: "bg-surface-success text-content-success",
  warning: "bg-surface-warning text-content-warning",
  danger: "bg-surface-danger text-content-danger",
};

export function badgeClasses({
  tone = "neutral",
  className = "",
}: BadgeOptions = {}): string {
  return [BASE, TONES[tone], className].filter(Boolean).join(" ");
}

export function Badge({
  tone,
  className,
  children,
  ...props
}: BadgeOptions & ComponentPropsWithRef<"span"> & { children?: ReactNode }) {
  return (
    <span {...props} className={badgeClasses({ tone, className })}>
      {children}
    </span>
  );
}
