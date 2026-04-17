import test from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "../lib/reports/csv.ts";

test("toCsv escapes quotes and preserves headers", () => {
  const csv = toCsv([
    {
      title: 'Quarterly "Review"',
      total: 2,
      active: true
    }
  ]);

  assert.equal(
    csv,
    'title,total,active\n"Quarterly ""Review""","2","true"\n'
  );
});

test("toCsv returns an empty string when no rows are provided", () => {
  assert.equal(toCsv([]), "");
});
