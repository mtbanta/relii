// ICONS (PD-8c).
//
// PD-8a cut the icon set on purpose: adding a dependency two days before a demo
// was not worth it. That decision is now reversed, and this file is the one
// place icons enter the app.
//
// WHICH PACKAGE, AND WHY NOT THE CDN. The mockups link the Tabler icon WEBFONT
// from a CDN. We use the @tabler/icons-react npm package instead, which draws
// the same icons as inline SVG. A CDN icon font is an external runtime request:
// if the demo room's network is slow or blocked, every icon renders as an empty
// box in front of the stakeholder. A bundled package cannot fail that way.
// Next.js already lists @tabler/icons-react in its default optimizePackageImports,
// so a named import pulls in only the icons named here, not the 6000-icon set.
//
// TWO RULES, WHICH MATTER MORE THAN WHICH ICONS ARE PICKED.
//
//   1. An icon that IS the control needs an accessible name. Use <ActionIcon>,
//      which requires a label and renders both aria-label (for a screen reader)
//      and <title> (so a sighted user gets a tooltip on hover).
//   2. An icon sitting beside its own text label is decoration, and repeating
//      the label would make a screen reader say everything twice. Use <Icon>,
//      which is aria-hidden.
//
// And icon-only is only for universally understood actions. Where the meaning is
// ambiguous, use icon plus text: the Actions column's Video, Transcript and CSV
// are three different downloads, and three bare icons there would be a guessing
// game.
import type { ComponentType } from "react";
import type { IconProps } from "@tabler/icons-react";

// The Tabler icons this app uses. Named imports, so the bundler keeps only
// these. Grouped by where they are used, so adding one has an obvious home.
export {
  IconArrowLeft,
  IconChevronDown,
  IconChevronUp,
  IconCircleFilled,
  IconClock,
  IconDownload,
  IconEye,
  IconFileText,
  IconFlag,
  IconInbox,
  IconLock,
  IconMessage,
  IconMicrophone,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlus,
  IconSend,
  IconTable,
  IconTrash,
  IconUser,
  IconUsers,
  IconVideo,
} from "@tabler/icons-react";

type TablerIcon = ComponentType<IconProps>;

// The sizes icons are drawn at in this app, matched to the type scale they sit
// beside: 14px next to meta and micro text, 16px next to body text.
export type IconSize = "sm" | "md";

const PX: Record<IconSize, number> = { sm: 14, md: 16 };

// A DECORATIVE icon, sitting beside text that already says what it means.
// Hidden from screen readers so the label is not announced twice.
export function Icon({
  icon: Glyph,
  size = "sm",
  className = "",
}: {
  icon: TablerIcon;
  size?: IconSize;
  className?: string;
}) {
  return (
    <Glyph
      size={PX[size]}
      stroke={1.75}
      aria-hidden="true"
      focusable="false"
      className={`inline-block shrink-0 ${className}`.trim()}
    />
  );
}

// An icon that IS the control, with no visible text of its own. `label` is
// required: it becomes both the accessible name and the hover tooltip.
export function ActionIcon({
  icon: Glyph,
  label,
  size = "sm",
  className = "",
}: {
  icon: TablerIcon;
  label: string;
  size?: IconSize;
  className?: string;
}) {
  return (
    // `title` is Tabler's own prop: it renders a <title> element inside the SVG,
    // which is what gives a sighted user the hover tooltip. aria-label is what
    // gives a screen reader the name. Both, on purpose.
    <Glyph
      size={PX[size]}
      stroke={1.75}
      role="img"
      aria-label={label}
      title={label}
      focusable="false"
      className={`inline-block shrink-0 ${className}`.trim()}
    />
  );
}
