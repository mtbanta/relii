// THE SHARED BUTTON (PD-8a).
//
// Before this file the app had at least five different button recipes written
// out by hand on nearly forty controls: a solid black one, a solid dark gray
// one, a solid amber one, a solid red one, and an outlined one. The variants
// below are not invented, they are those recipes named and given one home.
//
// There is deliberately no "use client" here. This file has no state and no
// event handlers of its own, so it can be dropped into a server-rendered page
// (a link styled as a button) or into an interactive client component (a form's
// submit button) without either one having to change.
//
// Two ways to use it:
//   <Button variant="primary">Save</Button>
//   <Link className={buttonClasses({ variant: "secondary" })}>View result</Link>
// The second exists because a navigation control is an <a>, not a <button>, and
// it should still look identical.
import type { ButtonHTMLAttributes } from "react";

// primary     the main action on a screen (was bg-black)
// secondary   an outlined, lower-emphasis action (was border-gray-300)
// destructive removes something permanently (was bg-red-600)
// caution     reversible but consequential, e.g. resetting a submission so a
//             student can retake it (was bg-amber-600)
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "destructive"
  | "caution";

// md is the ordinary size. sm is for a control sitting inside a row or a card
// header. xs is for the small confirm/cancel pairs inside the two-step confirm
// panels (delete, reset, un-invite), which run much smaller than a page action.
export type ButtonSize = "xs" | "sm" | "md";

export type ButtonOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  // Stretches the button to the width of whatever contains it (used by the
  // login and register forms).
  fullWidth?: boolean;
  // Extra classes, appended last so they win. For one-off spacing (mt-3), not
  // for re-colouring the button: if a colour is missing, the variant list is
  // what should change.
  className?: string;
};

const BASE =
  "inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-content-primary text-white border border-content-primary hover:bg-black",
  secondary:
    "bg-surface-primary text-content-primary border border-line-secondary hover:bg-surface-secondary",
  destructive:
    "bg-content-danger text-white border border-content-danger hover:brightness-110",
  caution:
    "bg-content-warning text-white border border-content-warning hover:brightness-110",
};

const SIZES: Record<ButtonSize, string> = {
  xs: "px-2 py-0.5 text-xs",
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
};

// The classes for one button, on their own. Use this on an <a>, a <Link>, or
// anywhere the element cannot be a <button>.
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
}: ButtonOptions = {}): string {
  return [
    BASE,
    VARIANTS[variant],
    SIZES[size],
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

// The button itself. Every ordinary button attribute (onClick, disabled, type,
// aria-*) passes straight through.
//
// Note on `type`: it is NOT defaulted here. A <button> inside a <form> submits
// that form by default, and several forms in this app rely on exactly that, so
// setting a default would quietly break them. Pass type="button" yourself for a
// control inside a form that must not submit it.
export function Button({
  variant,
  size,
  fullWidth,
  className,
  ...props
}: ButtonOptions & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={buttonClasses({ variant, size, fullWidth, className })}
    />
  );
}
