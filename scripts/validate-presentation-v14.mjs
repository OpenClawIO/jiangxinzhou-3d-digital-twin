import assert from "node:assert/strict";
import { lensCopy, lensOrder, parseExperienceLens, writeExperienceLens } from "../app/jiangxinzhou/presentation.ts";

assert.deepEqual(lensOrder, ["cinematic", "atlas", "expedition"]);
assert.equal(parseExperienceLens(""), "cinematic");
assert.equal(parseExperienceLens("?lens=atlas"), "atlas");
assert.equal(parseExperienceLens("?lens=expedition"), "expedition");
assert.equal(parseExperienceLens("?lens=unknown"), "cinematic");
assert.equal(lensCopy.cinematic.label.zh, "观景");
assert.equal(lensCopy.expedition.label.en, "Expedition");

const cinematicParams = writeExperienceLens(new URLSearchParams("lang=en&view=landmark&landmark=2"), "cinematic");
assert.equal(cinematicParams.get("lang"), "en");
assert.equal(cinematicParams.get("view"), "landmark");
assert.equal(cinematicParams.get("lens"), null);

const atlasParams = writeExperienceLens(new URLSearchParams("lang=zh"), "atlas");
assert.equal(atlasParams.get("lens"), "atlas");

console.log("Validated V14 experience lenses, bilingual labels and URL compatibility.");

