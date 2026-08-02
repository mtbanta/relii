// THE SHARED CARD (PD-8a).
//
// A card is the app's one container: a bordered, rounded box holding one thing
// (an assignment, a notice, a panel). Before this file there were more than a
// hundred hand-written container class strings across the app, no two quite the
// same, which is the actual reason the screens looked unrelated.
//
// Like the Button, there is no "use client": it is markup only, so it works in
// a server-rendered page and inside a client component alike.
//
// Two ways to use it:
//   <Card as="li" padding="lg">...</Card>
//   <p className={cardClasses({ tone: "muted", padding: "sm" })}>...</p>
// The second exists for the places where the element already is something else
// (a list item, a paragraph of notice text) and only needs the look.
import type { ReactNode } from "react";

// default  a card on the page (white on the cream background)
// muted    a quieter panel, or a card that is locked / switched off
// info     a neutral note
// success  something completed
// warning  something that needs attention but is not an error
// danger   an error, or something destructive
export type CardTone =
  | "default"
  | "muted"
  | "info"
  | "success"
  | "warning"
  | "danger";

// none is for a card whose children handle their own padding (a list where each
// row is padded, so the card itself must not add a second gap).
export type CardPadding = "none" | "sm" | "md" | "lg";

// The elements a card is allowed to be. A card is a container, so this stays a
// short list on purpose: if a card needs to be a <button>, that is a Button.
export type CardElement = "div" | "li" | "section" | "article";

export type CardOptions = {
  tone?: CardTone;
  padding?: CardPadding;
  // A card normally has a hairline border. The summary tiles on the instructor
  // Submissions page deliberately do not: in the mockup they are flat cream
  // panels, and a border around each one turns three quiet numbers into three
  // boxes competing with the table below them.
  bordered?: boolean;
  className?: string;
};

const BASE = "rounded-lg";

const TONES: Record<CardTone, string> = {
  default: "bg-surface-primary",
  muted: "bg-surface-secondary",
  info: "bg-surface-info",
  success: "bg-surface-success",
  warning: "bg-surface-warning",
  danger: "bg-surface-danger",
};

// PD-8c density: md is the mockup's card padding, 14px. The app was on 16px and
// 20px, which across a page of stacked cards is what made it read roomy.
const PADDINGS: Record<CardPadding, string> = {
  none: "",
  sm: "px-3 py-2",
  md: "p-3.5",
  lg: "p-4",
};

// The classes for one card, on their own. Use this when the element already
// exists and only needs the look.
export function cardClasses({
  tone = "default",
  padding = "md",
  bordered = true,
  className = "",
}: CardOptions = {}): string {
  return [
    BASE,
    bordered ? "border border-line-tertiary" : "",
    TONES[tone],
    PADDINGS[padding],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

// The card itself. `as` picks the HTML element, so an assignment card can be a
// real <li> inside a real <ul> rather than a div pretending to be one.
export function Card({
  as: Element = "div",
  tone,
  padding,
  bordered,
  className,
  children,
}: CardOptions & {
  as?: CardElement;
  children?: ReactNode;
}) {
  return (
    <Element className={cardClasses({ tone, padding, bordered, className })}>
      {children}
    </Element>
  );
}
