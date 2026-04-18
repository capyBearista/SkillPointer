import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { HOME_CAT_ART } from "./home-cat-art";

test("home cat art exactly matches cat.txt content", () => {
  const catPath = path.resolve(process.cwd(), "cat.txt");
  const fromFile = fs.readFileSync(catPath, "utf8").replace(/\r\n/g, "\n").replace(/\n$/u, "");
  assert.equal(HOME_CAT_ART, fromFile);
});

test("home cat keeps expected line count", () => {
  assert.equal(HOME_CAT_ART.split("\n").length, 23);
});
