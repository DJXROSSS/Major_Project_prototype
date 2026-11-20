import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(dirname, "../src/lib/placepro/batch-sections.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {} };
vm.runInNewContext(code, context);
const { generateSectionNames, parseManualSectionNames, uniqueSectionNames } = context.exports;

test("automatic section names continue through Excel-style labels", () => {
  assert.deepEqual([...generateSectionNames("5").sections], ["A", "B", "C", "D", "E"]);
  assert.equal(generateSectionNames("17").sections.at(-1), "Q");
  assert.equal(generateSectionNames("26").sections.at(-1), "Z");
  assert.deepEqual([...generateSectionNames("28").sections.slice(-3)], ["Z", "AA", "AB"]);
  assert.equal(generateSectionNames("52").sections.at(-1), "AZ");
  assert.equal(generateSectionNames("53").sections.at(-1), "BA");
});

test("automatic generation rejects invalid counts", () => {
  for (const value of ["", "0", "-1", "1.5", "1001", "abc"]) {
    assert.notEqual(generateSectionNames(value).error, "");
  }
});

test("manual sections preserve custom names and order", () => {
  assert.deepEqual(
    [...parseManualSectionNames(" CH, CG, EA, EB ").sections],
    ["CH", "CG", "EA", "EB"],
  );
  assert.deepEqual(
    [...parseManualSectionNames("Morning, Evening, Weekend").sections],
    ["Morning", "Evening", "Weekend"],
  );
});

test("manual sections reject empty and duplicate names", () => {
  for (const value of ["", "A,,B", "A, ", "A, a"]) {
    assert.notEqual(parseManualSectionNames(value).error, "");
  }
  assert.deepEqual([...uniqueSectionNames([" A ", "a", "B", "", "B"])], ["A", "B"]);
});
