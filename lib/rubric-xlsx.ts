// PHASE 2a. Reads Tom's rubric spreadsheet and turns it into the shape the app
// stores. It is the only place that knows what those files look like.
//
// ==> SERVER ONLY. It imports ExcelJS, which is a Node library and 96 packages.
//     Nothing that a client component can reach may import this file. The
//     shapes it produces live in lib/types.ts, which imports nothing, and are
//     deliberately NOT re-exported from here. Same split, and the same reason,
//     as lib/legal.ts against lib/legal-server.ts in Phase 5. <==
//
// ==> IT REFUSES RATHER THAN GUESSES. Every failure returns { ok: false } with a
//     message naming what was wrong, because the alternative is a rubric that
//     parsed "successfully" into the wrong numbers and then graded students
//     with them. There is no partial success here and no defaulting. <==
//
// WHAT IT DOES NOT DO: evaluate a formula. Every points value in these files is
// a formula, and the number we want is the CACHED RESULT that Excel stored
// alongside it. Recomputing would mean implementing Excel, and would silently
// disagree with what Tom saw on his screen.
//
// LAYOUT, VERIFIED CELL BY CELL against both real files on 2026-09-09. Read
// this before changing anything below, because several of these are not what
// you would assume:
//
//   A3         the rubric's name ("Discovery Role-Play").
//   Row 3      ALSO holds six numbers in D..I. They are the level MULTIPLIERS
//              (1.0, 0.9, 0.8, 0.7, 0.5, 0.1). They are NOT a header and NOT
//              criterion data, and they are deliberately not stored: every
//              level already carries its absolute points, so keeping the
//              multiplier too would be a second way to compute the same grade.
//   Row 4      the level header. Six cells, D..I. EACH IS A richText OBJECT,
//              not a string, so cell.value is {richText:[...]} and String() on
//              it gives "[object Object]". Use cell.text. Each packs a short
//              name and a descriptor split by a newline, and SINCE PHASE 2b-1
//              BOTH ARE STORED. The descriptor is the only thing in the file
//              that says what a level means, and 2b-1 makes an AI choose a
//              level for every criterion. See RubricLevel in lib/types.ts.
//   Criteria   TWO ROWS EACH. First row: number in A, weight in B, name in C,
//              six points values in D..I. Second row: description in C.
//   Totals     a row of six values in D..I (Discovery) or one value in D
//              (Presentation) with A, B and C all empty.
//   Maximum    a cell reading "Maximum points:" with the number to its right.
//              Row 18 in Discovery, row 20 in Presentation, so it is FOUND and
//              never assumed.
//
// ==> THE DETECTION RULE THAT MAKES ALL OF THAT SAFE, AND WHY IT IS STRICTER
//     THAN IT LOOKS. "A row with six values in D..I" matches row 3, the header,
//     every criterion AND the totals row. So:
//
//       the header  is the row whose D..I are all TEXT (rows of numbers, such
//                   as row 3 and the totals row, cannot match).
//       a criterion is a row with a NUMBER in A, a NUMBER in B and TEXT in C
//                   (the totals row has all three empty, so it cannot match).
//
//     Those two rules are what keep row 3 and the totals row out of the data.
//     Loosening either one is how this parser starts reading multipliers as
//     grades. <==
import ExcelJS from "exceljs";
import {
  MAX_RUBRIC_FILE_BYTES,
  MAX_RUBRIC_UNCOMPRESSED_BYTES,
  formatLimit,
  formatSize,
} from "@/lib/types";
import type { ParseResult, RubricCriterion, RubricLevel } from "@/lib/types";

// ==> THE SHAPES ARE IMPORTED, NOT DEFINED HERE, AND NOT RE-EXPORTED EITHER.
//     Re-exporting them would recreate the exact hazard the split exists to
//     remove: it would give a client component a second place to import
//     ParsedRubric from, and the one that drags ExcelJS along. There is one
//     place, lib/types.ts, and it imports nothing. <==

// The six level columns, D through I.
const FIRST_LEVEL_COL = 4;
const LAST_LEVEL_COL = 9;
const LEVEL_COUNT = 6;

// Tom's rubrics are six or seven criteria. Anything else is not one of his
// files, and scoring against a rubric of the wrong size is worse than refusing.
const MIN_CRITERIA = 6;
const MAX_CRITERIA = 7;

const refuse = (error: string): ParseResult => ({ ok: false, error });

// Said in one place, because rule 0 and rule 1 both reach it and Tom should not
// get two different explanations of the same mistake.
const NOT_AN_XLSX =
  "That file could not be opened as an Excel workbook. Please upload the .xlsx file itself, not a PDF, a CSV or a renamed copy.";

// ==> HOW BIG THIS FILE SAYS IT WILL GET, WITHOUT DECOMPRESSING ANY OF IT.
//
//     An .xlsx is a zip. Every zip ends with an "end of central directory"
//     record, and the central directory lists each entry with its compressed
//     and uncompressed sizes. Summing that column answers "how much data does
//     this file SAY it will expand to" from header arithmetic alone, before
//     ExcelJS spends any memory finding out.
//
//     ==> IT IS A DECLARATION, NOT A MEASUREMENT, AND THE DIFFERENCE IS THE
//         WHOLE LIMIT OF THIS CHECK. Whoever built the file wrote these numbers.
//         A crafted archive can declare 1 KB and carry a deflate stream that
//         inflates to gigabytes, because the inflater works from the STREAM and
//         never consults the declaration. This catches an honest oversized
//         workbook and a naive bomb. IT DOES NOT CATCH A LIAR AND IT IS NOT A
//         ZIP-BOMB DEFENCE. The bound that does hold is MAX_RUBRIC_FILE_BYTES.
//         The note beside both constants in lib/types.ts says why that residual
//         is accepted here rather than solved. <==
//
//     IT FAILS CLOSED. Anything it cannot make sense of returns null and the
//     caller refuses. That includes ZIP64, which a genuine rubric is never in.
//     A file we cannot measure is a file we do not parse. <==
function declaredUncompressedBytes(buffer: ArrayBuffer): number | null {
  const EOCD_SIGNATURE = 0x06054b50;
  const CENTRAL_SIGNATURE = 0x02014b50;
  const EOCD_LENGTH = 22;
  const CENTRAL_HEADER_LENGTH = 46;
  const ZIP64_MARKER = 0xffffffff;

  const view = new DataView(buffer);
  const length = view.byteLength;
  if (length < EOCD_LENGTH) return null;

  // The record sits at the end, after an optional comment of up to 65535 bytes.
  let eocd = -1;
  const earliest = Math.max(0, length - EOCD_LENGTH - 0xffff);
  for (let i = length - EOCD_LENGTH; i >= earliest; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || offset === ZIP64_MARKER) return null;

  let total = 0;
  for (let n = 0; n < entries; n += 1) {
    // Every read below is bounds-checked first, because the numbers steering
    // them come from the file being examined.
    if (offset + CENTRAL_HEADER_LENGTH > length) return null;
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) return null;

    const uncompressed = view.getUint32(offset + 24, true);
    if (uncompressed === ZIP64_MARKER) return null;

    total += uncompressed;
    offset +=
      CENTRAL_HEADER_LENGTH +
      view.getUint16(offset + 28, true) + // file name
      view.getUint16(offset + 30, true) + // extra field
      view.getUint16(offset + 32, true); // comment
  }

  return total;
}

// cell.text is the ONLY safe way to read a cell that might be rich text. See
// the header note above.
function cellText(cell: ExcelJS.Cell): string {
  const t = cell.text;
  return typeof t === "string" ? t.trim() : "";
}

// True only for a cell holding actual text. A numeric cell has a .text of "1",
// which is why this checks the VALUE's type rather than whether text is
// non-empty. This is what keeps row 3 from being mistaken for the header.
function isTextCell(cell: ExcelJS.Cell): boolean {
  const v = cell.value;
  if (typeof v === "string") return v.trim().length > 0;
  if (v && typeof v === "object" && "richText" in v) return cellText(cell).length > 0;
  return false;
}

// The number in a cell, whether it is stored directly or is the cached result
// of a formula.
//
// ==> cell.result IS THE CACHED VALUE EXCEL WROTE, and it is what every points
//     value in these files is. cell.value on a formula cell is an object, not a
//     number. A plain number cell has no .result at all, hence the fallback.
//     Returns null for anything that is not a finite number, which is what
//     turns "a formula with no cached result" (possible from some exporters)
//     into a refusal instead of a NaN. <==
function numericValue(cell: ExcelJS.Cell): number | null {
  const raw = cell.result ?? cell.value;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

// "Approach: " becomes "Approach". Tom's files are inconsistent about trailing
// colons and spaces, and a criterion name is shown to students.
function normaliseName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().replace(/[:\s]+$/, "").trim();
}

function slug(raw: string): string {
  return (
    normaliseName(raw)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "criterion"
  );
}

export async function parseRubricXlsx(file: ArrayBuffer): Promise<ParseResult> {
  // ==> RULE 0. SIZE, BEFORE ANYTHING IS PARSED. It is rule ZERO rather than
  //     rule 7 because it has to run before ExcelJS sees the file: every rule
  //     below asks ExcelJS a question, and asking it anything at all is what
  //     spends the memory. The limits and the reasoning behind the two numbers
  //     are in lib/types.ts. <==
  if (file.byteLength > MAX_RUBRIC_FILE_BYTES) {
    return refuse(
      `That file is ${formatSize(file.byteLength)} and the limit is ${formatLimit(
        MAX_RUBRIC_FILE_BYTES,
      )}. A rubric is a few rows of numbers, so a file this large is not one.`,
    );
  }

  const expanded = declaredUncompressedBytes(file);
  if (expanded === null) {
    // Not a zip at all, or a zip shaped in a way we will not risk parsing.
    return refuse(NOT_AN_XLSX);
  }
  if (expanded > MAX_RUBRIC_UNCOMPRESSED_BYTES) {
    return refuse(
      `That file is small on disk but expands to ${formatSize(
        expanded,
      )} when opened, and the limit is ${formatLimit(
        MAX_RUBRIC_UNCOMPRESSED_BYTES,
      )}. Please check you uploaded the rubric and not something larger.`,
    );
  }

  // RULE 1. It opens as a real xlsx.
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file);
  } catch {
    return refuse(NOT_AN_XLSX);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return refuse("That workbook has no sheets in it.");
  }

  // ==> HOW FAR DOWN TO SCAN. THIS LINE WAS WRONG AND THE TWO REAL FILES HID IT.
  //
  //     It used to read sheet.actualRowCount. THAT IS THE COUNT OF NON-EMPTY
  //     ROWS, NOT THE INDEX OF THE LAST ONE. Both real workbooks have content in
  //     every row from 1 to 18, so the count and the last index are both 18 and
  //     the wrong property gave the right answer.
  //
  //     PUT ONE BLANK ROW ANYWHERE and they diverge: a rubric using rows 1 and
  //     3 to 17 with row 2 empty has a count of 16 and a last index of 17, the
  //     scan stops a row early, and "Maximum points:" is never found. The file
  //     is refused with a message saying the maximum is missing when it is
  //     plainly there. Tom adding a spacer row would have hit this.
  //
  //     Found on 2026-09-09 by a hand-built minimal rubric, not by the samples.
  //     A regression fixture with a deliberate blank row now guards it.
  //
  //     rowCount IS an upper bound on the last row carrying anything, which is
  //     what a scan needs. It reads 1000 on the real files because of trailing
  //     formatting, so it is capped: scanning a few hundred empty rows costs
  //     nothing, and the cap stops a sparse sheet that declares a huge dimension
  //     from turning a cheap scan into an expensive one. <==
  const MAX_ROWS_SCANNED = 2000;
  const lastRow = Math.min(sheet.rowCount, MAX_ROWS_SCANNED);

  // RULE 2. A level header row with six level cells is findable.
  let headerRow = 0;
  for (let r = 1; r <= lastRow; r += 1) {
    const row = sheet.getRow(r);
    let textCells = 0;
    for (let c = FIRST_LEVEL_COL; c <= LAST_LEVEL_COL; c += 1) {
      if (isTextCell(row.getCell(c))) textCells += 1;
    }
    if (textCells === LEVEL_COUNT) {
      headerRow = r;
      break;
    }
  }

  if (headerRow === 0) {
    return refuse(
      `No performance level header was found. Expected a row with ${LEVEL_COUNT} level names in columns D to I, such as "Excellent" through "Unsatisfactory".`,
    );
  }

  // PHASE 2b-1. BOTH LINES OF EACH HEADER CELL ARE KEPT. The first is the short
  // name the grader returns and the student is shown; the rest is Tom's
  // descriptor, which is the only statement anywhere of what that level MEANS.
  // The note on RubricLevel.descriptor in lib/types.ts says why that is
  // load-bearing rather than decorative.
  const levelNames: string[] = [];
  const levelDescriptors: (string | undefined)[] = [];
  for (let c = FIRST_LEVEL_COL; c <= LAST_LEVEL_COL; c += 1) {
    const lines = cellText(sheet.getRow(headerRow).getCell(c)).split("\n");
    levelNames.push(normaliseName(lines[0]));
    // Everything after the first line, in case a descriptor wraps onto two.
    // Whitespace is collapsed but the text is otherwise left exactly as Tom
    // wrote it: normaliseName is for NAMES, and it strips a trailing colon,
    // which would quietly edit a sentence. An empty descriptor is undefined
    // rather than "", so a level either carries Tom's words or carries nothing.
    const rest = lines.slice(1).join(" ").replace(/\s+/g, " ").trim();
    levelDescriptors.push(rest || undefined);
  }

  // The rubric's name sits in column A of the row above the header. Tied to the
  // header's position rather than hardcoded to A3, so a file with an extra row
  // at the top still reads correctly.
  const titleCell = sheet.getRow(Math.max(1, headerRow - 1)).getCell(1);
  const rubricName = cellText(titleCell);
  if (!rubricName) {
    return refuse(
      `No rubric name was found. Expected the rubric's title in column A of row ${headerRow - 1}, such as "Discovery Role-Play".`,
    );
  }

  // The criteria. See the detection rule at the top of this file.
  const criteria: RubricCriterion[] = [];
  for (let r = headerRow + 1; r <= lastRow; r += 1) {
    const row = sheet.getRow(r);
    const number = numericValue(row.getCell(1));
    const weight = numericValue(row.getCell(2));
    const nameCell = row.getCell(3);

    // Not a criterion row. The totals row lands here, because its A, B and C
    // are all empty.
    if (number === null || weight === null || !isTextCell(nameCell)) continue;

    const name = normaliseName(cellText(nameCell));

    // RULES 4 and 5. Every criterion has all six level values, and every one is
    // a number. Rule 4 is the exact defect Tom hand-repaired in the
    // Presentation file, so it is not hypothetical.
    const levels: RubricLevel[] = [];
    for (let c = FIRST_LEVEL_COL; c <= LAST_LEVEL_COL; c += 1) {
      const cell = row.getCell(c);
      const points = numericValue(cell);
      const columnLetter = String.fromCharCode("A".charCodeAt(0) + c - 1);

      if (points === null) {
        const isBlank = cell.value === null || cell.value === undefined || cellText(cell) === "";
        return refuse(
          isBlank
            ? `The criterion "${name}" (row ${r}) is missing its ${levelNames[c - FIRST_LEVEL_COL]} value in column ${columnLetter}. Every criterion needs all ${LEVEL_COUNT} performance levels filled in.`
            : `The criterion "${name}" (row ${r}) has "${cellText(cell)}" in column ${columnLetter} where a number was expected. Every performance level must be a number.`,
        );
      }

      const descriptor = levelDescriptors[c - FIRST_LEVEL_COL];
      levels.push(
        descriptor
          ? { name: levelNames[c - FIRST_LEVEL_COL], descriptor, points }
          : { name: levelNames[c - FIRST_LEVEL_COL], points },
      );
    }

    // The description is column C of the following row. Optional in the sense
    // that a missing one is empty rather than fatal: it is shown to students
    // but is not part of the arithmetic, so refusing a whole file over it would
    // be the wrong trade.
    const description = cellText(sheet.getRow(r + 1).getCell(3));

    criteria.push({
      id: `${criteria.length + 1}-${slug(name)}`,
      name,
      description,
      weight,
      levels,
    });

    // The description row is consumed, so skip it. Without this, a description
    // row that happened to start with a number would be read as a criterion.
    r += 1;
  }

  // RULE 3. Six or seven criteria.
  if (criteria.length < MIN_CRITERIA || criteria.length > MAX_CRITERIA) {
    return refuse(
      `Expected ${MIN_CRITERIA} or ${MAX_CRITERIA} criteria and found ${criteria.length}. Please check the file is a Sales 300 role-play rubric.`,
    );
  }

  // RULE 6. A "Maximum points" label with a number beside it.
  //
  // FOUND, NEVER ASSUMED: it is row 18 in Discovery and row 20 in Presentation.
  let maxTotal: number | null = null;
  for (let r = 1; r <= lastRow && maxTotal === null; r += 1) {
    const row = sheet.getRow(r);
    for (let c = 1; c < LAST_LEVEL_COL; c += 1) {
      if (/maximum\s*points/i.test(cellText(row.getCell(c)))) {
        maxTotal = numericValue(row.getCell(c + 1));
        break;
      }
    }
  }

  if (maxTotal === null) {
    return refuse(
      'No maximum was found. Expected a cell reading "Maximum points:" with the total number of points in the cell to its right.',
    );
  }

  // ==> THERE IS DELIBERATELY NO CHECK THAT THE CRITERIA SUM TO THIS MAXIMUM.
  //     Owner's ruling, and it is not an oversight to be corrected later: Tom
  //     adjusts these files by hand and a rubric that does not add up is still
  //     the rubric he intends to grade with. Do not add one. <==

  return { ok: true, rubric: { name: rubricName, maxTotal, criteria } };
}
