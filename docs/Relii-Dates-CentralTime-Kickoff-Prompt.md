# Dates and Times in US Central, and the Available Date Unlock

A small session between Phase 4 and the rest of Phase 3. **Phases 2, 3a, 4a and 4b are closed; do not reopen them.** **It must ship before Tom's students register the week of September 14.** There is no migration and no stored value changes: this is formatting, plus one comparison.

**Before anything else, state the filename and line count you read.**

## READ FIRST

**PROJECT_STATE.md, the UTC Open Issue that Phase 4b filed** with its live instance: a review saved at 22:21 Central renders as "Sep 11, 2026, 3:21 AM". **AUDIT THE CODE BEFORE YOU PLAN.** Line numbers were checked against `95ec986`. **STATE YOUR PLAN AND WAIT FOR APPROVAL.**

## The owner's rulings (September 11, 2026). Build to them; do not reopen them.

1. **ONE TIMEZONE, APP-WIDE: America/Chicago.** Put it in one constant in one module, used by every human-readable timestamp, on screen and in downloaded files. No per-viewer timezone.
2. **NO SUFFIX.** Times read "Sep 11, 2026, 10:21 PM". The reset history's " UTC" label goes, so it matches everything else.
3. **AN AVAILABLE DATE UNLOCKS AT 12:00 AM CENTRAL ON THE PICKED DAY**, correctly across daylight saving. Today an assignment set to September 14 unlocks at 7pm Central on September 13. **This is a behaviour change, not display.**
4. **DATE-ONLY VALUES DO NOT MOVE.** Due and Available dates are stored as midnight UTC of the picked day, and their UTC-pinned formatting is deliberate: a date picked as "Sep 14" must still show as "Sep 14". **Their display stays exactly as it is.**

## Every date call site, classified by the Cowork audit. Confirm each; add any it missed.

**Timestamps: move to Central**
| # | Where | Today |
| :-- | :-- | :-- |
| 1 | `lib/date-taken.ts` `formatDateTaken` (line 17) | No timeZone, so UTC on Vercel. Feeds Date Taken, "Reviewed by your instructor on", the instructor submission page, and the CSV Status line. |
| 2 | `app/student/page.tsx` `formatShortDate` (line 58, used line 623) | No timeZone. Practice dates on the student home. |
| 3 | `app/api/instructor/submission/[id]/transcript/route.ts` `formatDateTime` (line 12) | No timeZone, and its comment calls it UTC. |
| 4 | `components/reset-history.tsx` `formatResetTime` (line 43) | Deliberately UTC with a " UTC" suffix. Ruling 2 changes it. |
| 5 | `app/instructor/scaffold/page.tsx` line 101 | Bare `toLocaleString()`. |
| 6 | `app/admin/class/[id]/page.tsx` line 196 | Bare `toLocaleDateString()` of a timestamp, so it becomes a Central date. |
| 7 | `lib/instructor-submission.ts` `fileDate` (line 276) | The UTC day in submission download filenames. Use the Central day. |
| 8 | `lib/class-export.ts` `classExportFilename` (line 553) | The UTC day in the class export filename. Use the Central day. |

**Date-only: display unchanged.** `formatDueDate` at `app/student/page.tsx` line 47 and `components/edit-assignment-form.tsx` line 58; `formatAvailableDate` at `lib/available-date.ts` line 32; `toDateInputValue` at `components/edit-assignment-form.tsx` line 71.

**Behaviour: the unlock.** `isLockedUntil` at `lib/available-date.ts` line 18 compares midnight UTC with now. It is the single rule behind the student home (`app/student/page.tsx` line 380) and four server refusals: `app/api/assignment/start/route.ts` line 65, `app/api/voice/start/route.ts` line 57, `app/api/practice/submit/route.ts` line 130, and `app/api/session/start/route.ts` line 62. **Change the helper, never the callers**, so the page and the four routes cannot disagree. It already takes `now` as a parameter, which is what makes it testable.

## Things that must stay true

- **Machine-readable values stay ISO UTC.** Raw timestamps inside exports, such as `exportedAt` and the class export's row data, are data rather than text for a reader. Only human-formatted strings change.
- **No new runtime dependency.** `Intl` handles America/Chicago and daylight saving. If you believe a library is needed, stop and say why.
- **Server and client agree.** Anything rendered in a client component must not produce a hydration mismatch between server and browser. Pin the timezone explicitly; do not rely on either machine's default.
- **The date shown and the lock agree.** "Available Sep 14" means locked until 12:00 AM Central, September 14.

## Not in scope

Anything stored: no migration, no rewriting of `due_at` or `available_date`, and no change to how the date picker saves a value. Due dates are display-only today and stay that way. The rest of Phase 3, Phase 6.

## Proof, run by you end to end

1. **A check script exercising real instants, and every check shown able to fail:**
   - `2026-09-11T03:21:00Z` formats as "Sep 10, 2026, 10:21 PM" (daylight time, UTC-5).
   - A December instant uses standard time (UTC-6).
   - The November 1, 2026 fall-back hour formats sensibly.
   - For an Available Date of `2026-09-14T00:00:00Z`: locked at `04:59:59Z` and unlocked at `05:00:00Z`. For a December date: locked at `05:59:59Z` and unlocked at `06:00:00Z`.
   - Every date-only formatter's output for a midnight-UTC input, byte-identical before and after.
   - Each filename's date part at 22:00 Central is the Central day.
   State the count from the run.
2. **The discriminating live check, measured before and after the deploy.** B1 session `0ae456b3` is stored at 2026-09-03 23:47:11 UTC and renders "Sep 3, 2026, 11:47 PM" today. After the deploy it must render **"Sep 3, 2026, 6:47 PM"**, which only the new build can produce. That observation is the deploy confirmation too.
3. **Every other surface in the table, observed on the live site or in a downloaded file:** the student home practice dates, a transcript download header, the reset history (Central, no " UTC"), the scaffold page, and both filenames. **Item 6 is super-admin only: ask the owner to open that page, or record it as not observed.**
4. **The unlock, as a matched pair through a real start request as the student.** A throwaway B1 assignment whose Available Date is the Central tomorrow is refused with its date in the message, beside one dated the Central today, which starts. **If the run happens between 7pm and midnight Central, add the case that discriminates old code from new:** an Available Date equal to today's UTC date is still locked. Outside that window, say it was not run live, and let item 1's instants carry it.
5. **Existing Due and Available dates in B1 display exactly as before.**
6. A clean `tsc`, eslint, and `npm run build` after deleting `.next`, with the exit code and timestamp, plus the existing render and CSV scripts still passing, with their counts read from the runs.

**Cleanup:** remove the throwaway assignments by the plain delete, once their practices are gone. **Never type DELETE.**

## How testing runs: you run it

Any SQL is read-only and each section returns its answer as its last statement. The click-through goes through the Playwright MCP on relii.vercel.app, in B1 only, with a baseline first. The owner supplies passwords; **ask which accounts.** Announce every destructive click. git commit and push stay behind their ask rules.

## Rules this project paid for

**A GREEN RESULT IS EVIDENCE ONLY WHEN YOU KNOW WHICH ARTIFACT PRODUCED IT. A CHECK THAT CANNOT FAIL IS DECORATION. A REFUSAL BESIDE A MATCHING SUCCESS IS A MEASUREMENT.**

## Conventions

No em or en dashes outside chat. Record each owner ruling in PROJECT_STATE when it is given. **Close the UTC Open Issue with the measurement from proof 2.** Write the handoff for **the rest of Phase 3** before the owner clears the session.
