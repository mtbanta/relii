// THE SHARED FORM CONTROLS (PD-8b).
//
// PD-8a built a Button and a Card, but the form control turned out to be the
// most repeated pattern in the app and the biggest unconverted surface: border
// classes appeared in roughly fifty hand-written variations across 41 controls,
// and every label on the instructor forms rendered in a cool blue-gray that
// clashed with the warm page.
//
// The look below is not invented. It is the recipe the app already used most,
//   w-full rounded-md border border-gray-300 px-3 py-2
// which appeared 14 times verbatim and 8 more with small additions, re-expressed
// in tokens. The one thing genuinely added is a visible FOCUS state, which
// almost none of these controls had. A keyboard user could tab through the
// instructor forms with nothing on screen telling them where they were.
//
// Same conventions as button.tsx and card.tsx: no "use client", so these work in
// a server-rendered page and inside an interactive client component alike, and
// every component has a matching classes() export for the places where the
// element already exists and only needs the look.
//
// ComponentPropsWithRef rather than the plain attribute types, so `ref` passes
// through like any other prop (React 19 hands function components their ref
// directly). components/conversation.tsx holds a ref to its message box to
// auto-grow it, and that has to keep working after the swap.
import type { ComponentPropsWithRef, ReactNode } from "react";

// md is the ordinary control (the 22-use recipe). sm is a control sitting in a
// row of other things, such as the assignment dropdown on the Submissions page.
// xs is the small type-the-word-to-confirm box inside the delete panels.
export type ControlSize = "xs" | "sm" | "md";

// danger is the type-to-confirm box in a destructive panel, which has always
// been outlined in red so it does not look like an ordinary field.
export type ControlTone = "default" | "danger";

export type ControlOptions = {
  size?: ControlSize;
  tone?: ControlTone;
  // Most controls in this app fill their form, so this defaults to true. Pass
  // false for a control that sits inline with other things.
  fullWidth?: boolean;
  className?: string;
};

const CONTROL_BASE =
  "rounded-md bg-surface-primary text-content-primary placeholder:text-content-tertiary focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50";

const CONTROL_TONES: Record<ControlTone, string> = {
  default:
    "border border-line-secondary focus:border-accent-solid focus:ring-accent-solid/30",
  danger:
    "border border-content-danger focus:border-content-danger focus:ring-content-danger/30",
};

// PD-8c density: md matches the mockup's control, 13px with 9px by 12px padding.
const CONTROL_SIZES: Record<ControlSize, string> = {
  xs: "px-2 py-0.5 text-micro",
  sm: "px-2.5 py-1 text-meta",
  md: "px-3 py-2 text-body",
};

// The classes for one control, on their own.
export function controlClasses({
  size = "md",
  tone = "default",
  fullWidth = true,
  className = "",
}: ControlOptions = {}): string {
  return [
    CONTROL_BASE,
    CONTROL_TONES[tone],
    CONTROL_SIZES[size],
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

// A text, email, password, number, date or checkbox input. Every ordinary input
// attribute (type, value, onChange, required, min, max, autoComplete) passes
// straight through untouched.
// `size` is omitted from the native attributes because this file uses that name
// for the control's visual size; the HTML size attribute is unused in this app.
export function Input({
  size,
  tone,
  fullWidth,
  className,
  ...props
}: ControlOptions & Omit<ComponentPropsWithRef<"input">, "size">) {
  return (
    <input
      {...props}
      className={controlClasses({ size, tone, fullWidth, className })}
    />
  );
}

export function Select({
  size,
  tone,
  fullWidth,
  className,
  children,
  ...props
}: ControlOptions & Omit<ComponentPropsWithRef<"select">, "size">) {
  return (
    <select
      {...props}
      className={controlClasses({ size, tone, fullWidth, className })}
    >
      {children}
    </select>
  );
}

export function Textarea({
  size,
  tone,
  fullWidth,
  className,
  ...props
}: ControlOptions & ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      {...props}
      className={controlClasses({ size, tone, fullWidth, className })}
    />
  );
}

// The file input (there is exactly one, the bulk-invite CSV picker). A file
// input cannot be styled as a box the way the others can: the browser draws the
// button itself, so the styling goes on the file: pseudo-element and the control
// carries only the text beside it.
export function fileInputClasses(className = ""): string {
  return [
    "block w-full text-body text-content-secondary",
    "file:mr-3 file:rounded-md file:border file:border-line-secondary file:bg-surface-primary file:px-3 file:py-1.5 file:text-body file:text-content-primary",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function FileInput({
  className,
  ...props
}: { className?: string } & ComponentPropsWithRef<"input">) {
  return <input {...props} type="file" className={fileInputClasses(className)} />;
}

// THE LABEL above (or wrapped around) a control. Two patterns existed before
// this: a medium-weight one on the login, register and name screens, and a
// lighter gray one on the instructor forms. They are now one. The instructor
// labels therefore read a little darker and a little heavier than they did,
// which is the intended fix: a form label is not metadata.
//
// Spacing is left to the caller, because a label that WRAPS its control needs no
// bottom margin while a label that sits above one does (pass "mb-1").
export function labelClasses(className = ""): string {
  return ["block text-meta font-medium text-content-primary", className]
    .filter(Boolean)
    .join(" ");
}

export function Label({
  className,
  children,
  ...props
}: ComponentPropsWithRef<"label"> & { children?: ReactNode }) {
  return (
    <label {...props} className={labelClasses(className)}>
      {children}
    </label>
  );
}

// The short explanatory line under a control ("Leave blank for no due date").
export function helpTextClasses(className = ""): string {
  return ["text-micro text-content-secondary", className]
    .filter(Boolean)
    .join(" ");
}

export function HelpText({
  className,
  children,
  ...props
}: { className?: string; children?: ReactNode } & ComponentPropsWithRef<"p">) {
  return (
    <p {...props} className={helpTextClasses(className)}>
      {children}
    </p>
  );
}
