"use client";

// THE RUBRIC SCORE (PD-8d): the itemized score, grouped into its own categories
// and collapsible, shared by the student results page and the instructor
// submission view so the two can never drift.
//
// WHAT CHANGED AND WHY. Both screens used to render every scored item as a flat
// card in one column, 29 of them on a full rubric, ignoring the structure the
// rubric has always had. The data has carried a category per item since Stage 3;
// the screen simply never used it. This is a display change only: no schema
// change, no new data, and no new query.
//
// WHY THIS IS A CLIENT COMPONENT RATHER THAN <details>. <details> would be
// server-rendered, keyboard accessible and JavaScript-free, which is genuinely
// better, and it was the first choice. Two requirements rule it out:
//
//   1. PRINT. Student print-to-PDF is a shipped feature. A collapsed <details>
//      does not render its content, and CSS cannot force it open, because the
//      `open` ATTRIBUTE is the only thing that reveals it. A student saving
//      their results would get six category headings and no feedback at all.
//      Here, a collapsed category stays in the DOM as `hidden print:block`, so
//      the printed sheet always contains every category fully expanded no matter
//      what is open on screen.
//   2. THE CHIP JUMP. Jumping to a category and landing on a closed row is worse
//      than having no chip, so a chip has to OPEN its target as well as scroll
//      to it. That needs state.
//
// Accessibility is kept by hand instead: each category header is a real button
// with aria-expanded and aria-controls, so it is reachable and announced.
import { useState } from "react";
import { Icon, IconChevronDown, IconChevronUp } from "@/components/ui/icon";
import type { RubricItem, ScoreItem } from "@/lib/types";

// Short chip labels. The real category names are far too long for a chip row.
// This is an EXPLICIT map rather than a truncation, so renaming a category can
// never produce a nonsense chip: an unmapped name falls through to itself.
const SHORT_LABELS: Record<string, string> = {
  "Introduction / Approach": "Intro",
  "Confirming & Uncovering Relevant Facts": "Facts",
  "Identifying Needs & Opportunities": "Needs",
  "Product / Service Presentation": "Presentation",
  "Soliciting Feedback & Closing": "Closing",
  "Sales Style": "Style",
};

function shortLabel(category: string): string {
  return SHORT_LABELS[category] ?? category;
}

// A category name turned into an id we can scroll to.
function anchorId(category: string): string {
  return `rubric-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

type Category = {
  name: string;
  earned: number;
  possible: number;
  items: { item: ScoreItem; label: string }[];
};

// Group the SCORED items by their category, in the order the rubric defines
// them. Totals come from the items actually present, which matters: today's
// scorer only scores the content items for this meeting (18 of 29 on a discovery
// run), so a category with nothing scored must not appear at all rather than
// show a misleading 0 out of 60.
function buildCategories(
  items: ScoreItem[],
  rubricItems: RubricItem[],
): Category[] {
  const meta = new Map(rubricItems.map((r) => [r.id, r]));
  const order = rubricItems.map((r) => r.category ?? "Other");
  const byName = new Map<string, Category>();

  for (const item of items) {
    const m = meta.get(item.id);
    const name = m?.category ?? "Other";
    let cat = byName.get(name);
    if (!cat) {
      cat = { name, earned: 0, possible: 0, items: [] };
      byName.set(name, cat);
    }
    cat.earned += item.points_earned;
    cat.possible += item.points_max;
    cat.items.push({ item, label: m?.label ?? item.id });
  }

  const seen = new Set<string>();
  const ordered: Category[] = [];
  for (const name of order) {
    if (seen.has(name)) continue;
    seen.add(name);
    const cat = byName.get(name);
    if (cat) ordered.push(cat);
  }
  // Anything whose category is not in the rubric definition still gets shown,
  // rather than silently disappearing from the student's score.
  for (const [name, cat] of byName) {
    if (!seen.has(name)) ordered.push(cat);
  }
  return ordered;
}

export function RubricScore({
  items,
  rubricItems,
}: {
  items: ScoreItem[];
  rubricItems: RubricItem[];
}) {
  const categories = buildCategories(items, rubricItems);

  // The first category open, the rest collapsed (owner decision, and what the
  // mockup draws: chevron-up on the first, chevron-down on the others).
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(categories.length > 0 ? [categories[0].name] : []),
  );

  function toggle(name: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // A chip OPENS its category and then scrolls to it. Opening first is the whole
  // point: landing on a closed row would be worse than having no chip.
  function jumpTo(name: string) {
    setOpen((prev) => new Set(prev).add(name));
    // Wait for the row to be expanded before scrolling, so the browser measures
    // the final position rather than the collapsed one.
    requestAnimationFrame(() => {
      document
        .getElementById(anchorId(name))
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (categories.length === 0) return null;

  return (
    <div>
      {/* The chip row: one per category, earned over possible, jump to it. */}
      <div className="mb-2.5 flex flex-wrap gap-1.5 print:hidden">
        {categories.map((c) => (
          <button
            key={c.name}
            type="button"
            onClick={() => jumpTo(c.name)}
            className="rounded-md bg-surface-secondary px-2.5 py-1 text-micro text-content-secondary transition-colors hover:bg-surface-info hover:text-content-info"
          >
            {shortLabel(c.name)}{" "}
            <span className="tabular-nums">
              {c.earned}/{c.possible}
            </span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-line-tertiary bg-surface-primary">
        {categories.map((c, i) => {
          const isOpen = open.has(c.name);
          const panelId = `${anchorId(c.name)}-items`;
          return (
            <div
              key={c.name}
              id={anchorId(c.name)}
              className={i > 0 ? "border-t border-line-tertiary" : ""}
            >
              <h3>
                <button
                  type="button"
                  onClick={() => toggle(c.name)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-tertiary"
                >
                  <span className="flex items-center gap-1.5 text-body font-medium text-content-primary">
                    {/* The chevron announces the DISCLOSURE, and it carries the
                        accent colour at REST rather than only on hover. Without
                        that, this row looked exactly like the item rows beneath
                        it, which are not controls: a chevron on its own is not an
                        affordance, and a hover-only treatment cannot advertise a
                        control at all, since the reader must already know it is
                        there to hover it and a touch screen has no hover.
                        The button still announces its own state through
                        aria-expanded, and the chevron is hidden in print, where
                        everything is expanded and a chevron would lie. */}
                    <Icon
                      icon={isOpen ? IconChevronUp : IconChevronDown}
                      className="text-content-info print:hidden"
                    />
                    {c.name}
                  </span>
                  <span className="shrink-0 text-body font-medium tabular-nums text-content-secondary">
                    {c.earned} / {c.possible}
                  </span>
                </button>
              </h3>

              {/* COLLAPSED CONTENT STAYS IN THE DOM. `hidden` removes it from the
                  screen; `print:block` puts it back for the printed sheet, so a
                  student's PDF always has every category and every comment. */}
              <div
                id={panelId}
                className={isOpen ? "block" : "hidden print:block"}
              >
                <ul className="divide-y divide-line-tertiary border-t border-line-tertiary">
                  {c.items.map(({ item, label }) => (
                    <li key={item.id} className="px-3.5 py-2.5 pl-9">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-meta text-content-primary">
                          {label}
                        </span>
                        <span className="shrink-0 text-meta font-medium tabular-nums text-content-secondary">
                          {item.points_earned} / {item.points_max}
                        </span>
                      </div>
                      {/* The per-item feedback is the one genuinely long-form
                          text in this component, and the rubric now runs the
                          full width of a 1120px page, so it takes the narrower
                          reading measure. The score line above it deliberately
                          does not: it needs to stay flush right. */}
                      {item.comment && (
                        <p className="mt-1 max-w-reading text-micro italic text-content-secondary">
                          {item.comment}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
