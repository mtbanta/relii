// GATE 6. The one place that says what a class name may be, shared by the create
// route, the rename route and the reassign guard, so the three cannot drift
// apart about what counts as the same name.

// Generous, so a real course title ("Professional Selling, Fall 2026, Section
// 2") fits comfortably, while a stray paste cannot store something absurd. The
// same shape of cap the name gate uses in app/api/profile/name/route.ts.
export const MAX_CLASS_NAME_LENGTH = 80;

// Trim, and collapse any run of whitespace to a single space.
//
// THE COLLAPSE IS NOT COSMETIC. `classes` carries unique (instructor_id, name)
// from Gate 1, and that rule compares text exactly, so "Sales 300" and
// "Sales  300" would be two different classes to the database and the same class
// to every human reading the picker. Normalising here means the constraint
// catches the collisions a person would call collisions.
export function cleanClassName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}
