import test from "node:test";
import assert from "node:assert/strict";
import {readFile, stat} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const source = "nail 0.54 ;\ndef id x = x ;\nid 42 ;";
test("PWA shell and compilation artifacts are present", async () => {
  for (const path of ["index.html", "styles.css", "app.js", "editor.js", "runtime-worker.js", "sw.js", "version.json", "manifest.webmanifest", "runtime/v0.54/nailseed.js"]) {
    assert.ok((await stat(new URL("../dist/" + path, import.meta.url))).size > 0, path);
  }
  const html = await readFile(new URL("../dist/index.html",import.meta.url),"utf8");
  assert.match(html, /name="viewport"/);
  assert.match(html, /panel-inspect/);
  assert.match(html, /nav-history/);
  const manifest = JSON.parse(await readFile(new URL("../dist/manifest.webmanifest",import.meta.url)));
  assert.equal(manifest.orientation,"portrait");
});
test("real Nail 0.54 bundle executes and analyzes the lesson", () => {
  const {NailSeed} = require("../dist/runtime/v0.54/nailseed.js");
  assert.equal(typeof NailSeed.create, "function");
  const vm = NailSeed.create();
  vm.loadStdlib();
  const output = vm.runPlain(source);
  assert.match(JSON.stringify(output), /42/);
  const analysis = NailSeed.analyze(source);
  assert.equal(analysis.ok, true, JSON.stringify(analysis.diagnostics));
  assert.equal(typeof NailSeed.expand(source), "string");
});
test("worker, update controller and service worker pass syntax checks", () => {
  for (const filename of ["runtime-worker.js","updates.js","storage.js","sw.js"]) {
    execFileSync(process.execPath,["--check",new URL("../dist/"+filename,import.meta.url).pathname]);
  }
});
