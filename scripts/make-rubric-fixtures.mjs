// Builds the deliberately broken rubric files the parser must refuse.
// Kept OUT of docs/, which holds Tom's real files only.
//
// Each fixture starts from the REAL Discovery workbook, so it is a realistic
// file with a real defect rather than a guess at what a spreadsheet looks like.
//
// ==> FORMULAS ARE FLATTENED TO THEIR CACHED VALUES FIRST, and that is
//     necessary rather than tidy: ExcelJS refuses to write a workbook whose
//     shared-formula master has been moved or removed ("Shared Formula master
//     must exist above and or left of clone"), which splicing a criterion out
//     does. Flattening also makes these fixtures resemble a file re-exported
//     from Google Sheets, which is added coverage. The cached-formula path
//     itself is exercised by the two REAL files, which is where it matters. <==
import ExcelJS from "exceljs";
import { readFileSync, writeFileSync } from "node:fs";

const REAL = "docs/_Discovery-role-play-rubric-Sales-300-Fall-2026-copy.xlsx";
const OUT = "test-fixtures/rubric/";

// Read the cap out of lib/types.ts rather than repeating it, so the fixture and
// the guard can never disagree about where the boundary is.
const MAX_FILE_BYTES = /MAX_RUBRIC_FILE_BYTES\s*=\s*([0-9*\s]+);/
  .exec(readFileSync("lib/types.ts", "utf8"))[1]
  .split("*")
  .map(Number)
  .reduce((a, b) => a * b);

async function load() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(REAL);
  const ws = wb.worksheets[0];
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.type === ExcelJS.ValueType.Formula) cell.value = cell.result ?? null;
    });
  });
  return wb;
}

// 1. Not an xlsx at all, but named like one.
writeFileSync(OUT + "not-a-spreadsheet.xlsx", "This is a text file wearing an .xlsx name.\n");

// 2. Five criteria. Criterion 6 lives on rows 15 and 16; remove both.
{
  const wb = await load();
  wb.worksheets[0].spliceRows(15, 2);
  await wb.xlsx.writeFile(OUT + "five-criteria.xlsx");
}

// 3. A criterion missing one of its six level values. F7 is the "Developing"
//    value of criterion 2. This is the exact defect Tom hand-repaired in the
//    Presentation file, so it is not hypothetical.
{
  const wb = await load();
  wb.worksheets[0].getCell("F7").value = null;
  await wb.xlsx.writeFile(OUT + "missing-level-value.xlsx");
}

// 4. Text where a number belongs.
{
  const wb = await load();
  wb.worksheets[0].getCell("G9").value = "n/a";
  await wb.xlsx.writeFile(OUT + "text-in-a-number-cell.xlsx");
}

// 5. No "Maximum points:" label. C18 carries it in the real file.
{
  const wb = await load();
  wb.worksheets[0].getCell("C18").value = null;
  await wb.xlsx.writeFile(OUT + "no-maximum-points.xlsx");
}

// 6. No level header row. Blank the six rich-text cells on row 4.
{
  const wb = await load();
  for (const c of ["D4", "E4", "F4", "G4", "H4", "I4"]) {
    wb.worksheets[0].getCell(c).value = null;
  }
  await wb.xlsx.writeFile(OUT + "no-level-header.xlsx");
}

// 7. RULE 0a BOUNDARY, HIGH SIDE. Exactly one byte over the cap.
//
//    ==> WHY IT IS ONE BYTE OVER AND NOT A COMFORTABLE 3 MB. A 3 MB file
//        refuses under a 2 MB cap and under a 512 KB cap, so it proves the rule
//        EXISTS and says nothing about where the boundary sits. A fixture that
//        passes both the old value and the new one is not a test of the value.
//        This one fails the moment the constant moves. <==
{
  const over = Buffer.alloc(MAX_FILE_BYTES + 1);
  for (let i = 0; i < over.length; i += 1) over[i] = (i * 2654435761) & 0xff;
  writeFileSync(OUT + "just-over-the-size-cap.xlsx", over);
}

// 8. RULE 0b: a zip that DECLARES a huge expansion. Built by taking the real
//    workbook and patching the uncompressed size of its first central-directory
//    entry to 500 MB.
//
//    ==> WHY PATCHING A HEADER IS THE RIGHT TEST AND NOT A SHORTCUT. The guard
//        is itself a header check: it sums the sizes the archive declares,
//        precisely so it never has to inflate anything. A real zip bomb differs
//        only in that its data genuinely would expand to what it claims. Both
//        present the identical field to the identical check, and this one does
//        not require shipping a hostile file in the repo. <==
{
  const buf = readFileSync(REAL);
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("no end-of-central-directory found in the real file");
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error("central directory not where the EOCD said");
  buf.writeUInt32LE(500 * 1024 * 1024, cdOffset + 24); // uncompressed size
  writeFileSync(OUT + "declares-a-huge-expansion.xlsx", buf);
}

// 9. RULE 0a BOUNDARY, LOW SIDE. A REAL, VALID rubric padded to just under the
//    cap, which must still PARSE. Without this, "refuses things over the cap"
//    is satisfied by a guard that refuses everything.
{
  const wb = await load();
  const pad = wb.addWorksheet("padding");
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const rnd = (n) => {
    let out = "";
    for (let i = 0; i < n; i += 1) out += chars[(Math.random() * chars.length) | 0];
    return out;
  };
  // Random text so the padding does not simply compress away. The parser reads
  // worksheets[0], so a second sheet cannot affect what it finds.
  let buf = await wb.xlsx.writeBuffer();
  while (buf.length < MAX_FILE_BYTES * 0.93) {
    for (let i = 0; i < 60; i += 1) pad.addRow([rnd(140), rnd(140), rnd(140)]);
    buf = await wb.xlsx.writeBuffer();
  }
  if (buf.length > MAX_FILE_BYTES) {
    throw new Error(`padding overshot the cap: ${buf.length} > ${MAX_FILE_BYTES}`);
  }
  writeFileSync(OUT + "near-the-size-cap-valid.xlsx", buf);
  console.log(`  near-cap fixture: ${buf.length} bytes against a cap of ${MAX_FILE_BYTES}`);
}

// 10. REGRESSION FIXTURE, AND IT MUST PARSE. A minimal but VALID rubric with a
//     DELIBERATE BLANK ROW 2.
//
//     ==> WHY THIS EXISTS. The row-scan bound used to read
//         sheet.actualRowCount, which is the COUNT of non-empty rows and not
//         the INDEX of the last one. Both real workbooks fill every row from 1
//         to 18, so the two numbers coincide and the wrong property gave the
//         right answer on every sample we had. One blank row makes them
//         diverge, the scan stops early, and "Maximum points:" is reported
//         missing when it is plainly there.
//
//         Neither real file can catch that, which is exactly why this fixture
//         is hand-built rather than derived from them. Found 2026-09-09. <==
{
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Rubric");
  ws.getCell("A1").value = "Sales 300";
  // Row 2 is deliberately left empty. That is the whole point of this fixture.
  ws.getCell("A3").value = "Blank Row Regression Rubric";
  [["Excellent","Top"],["Proficient","Good"],["Developing","Fair"],
   ["Limited","Weak"],["Minimal","Poor"],["Unsatisfactory","None"]]
    .forEach(([n, d], i) => { ws.getCell(4, 4 + i).value = `${n}\n${d}`; });
  const criteria = [
    ["Approach", 0.2, [20, 18, 16, 14, 10, 2]],
    ["Discovery", 0.2, [20, 18, 16, 14, 10, 2]],
    ["Presentation", 0.2, [20, 18, 16, 14, 10, 2]],
    ["Close", 0.2, [20, 18, 16, 14, 10, 2]],
    ["Objections", 0.1, [10, 9, 8, 7, 5, 1]],
    ["Overall", 0.1, [10, 9, 8, 7, 5, 1]],
  ];
  let row = 5;
  criteria.forEach(([name, weight, pts], i) => {
    ws.getCell(row, 1).value = i + 1;
    ws.getCell(row, 2).value = weight;
    ws.getCell(row, 3).value = name;
    pts.forEach((pt, j) => { ws.getCell(row, 4 + j).value = pt; });
    ws.getCell(row + 1, 3).value = `Description for ${name}.`;
    row += 2;
  });
  ws.getCell(row, 3).value = "Maximum points:";
  ws.getCell(row, 4).value = 100;
  await wb.xlsx.writeFile(OUT + "valid-with-a-blank-row.xlsx");
}

console.log("fixtures written to " + OUT);
