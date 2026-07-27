// One place that decides how a person's name is shown. Everywhere the app used
// to show only an email now shows the person's full name, falling back to the
// email whenever a name has not been set yet (a legacy account, or before the
// name gate has been filled in), so a missing name never renders as blank.

type NameParts = {
  first_name?: string | null;
  last_name?: string | null;
  email: string;
};

// "First Last" when both names are present, otherwise the email.
export function displayName(p: NameParts): string {
  const first = (p.first_name ?? "").trim();
  const last = (p.last_name ?? "").trim();
  const full = `${first} ${last}`.trim();
  return full || p.email;
}

// Whether this profile has a usable name set. The dashboards use this to decide
// whether to show the name gate. Both parts must be filled.
export function hasName(p: {
  first_name?: string | null;
  last_name?: string | null;
}): boolean {
  return Boolean((p.first_name ?? "").trim() && (p.last_name ?? "").trim());
}
