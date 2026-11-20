import test from "node:test";
import assert from "node:assert/strict";
import {readFile, stat} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import vm from "node:vm";

const source = "nail 0.54 ;\ndef identityLab x = x ;\nidentityLab true ;";
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
test("the actual browser Worker loads Nail 0.54 and executes the lesson", async () => {
  const runtime = await readFile(new URL("../dist/runtime/v0.54/nailseed.js",import.meta.url),"utf8");
  const worker = await readFile(new URL("../dist/runtime-worker.js",import.meta.url),"utf8");
  const messages = [];
  const sandbox = {console};
  sandbox.self = sandbox; // Worker global scope: no window or CommonJS exports.
  sandbox.postMessage = result => messages.push(result);
  const context = vm.createContext(sandbox);
  sandbox.importScripts = path => {
    assert.equal(path,"./runtime/v0.54/nailseed.js");
    vm.runInContext(runtime, context, {timeout:10000,filename:"nailseed.js"});
  };
  vm.runInContext(worker,context,{timeout:10000,filename:"runtime-worker.js"});
  assert.equal(typeof sandbox.NailSeed?.create,"function", "Browser-global NailSeed API must be available");
  sandbox.onmessage({data:{kind:"run",id:1,source}});
  assert.equal(messages[0]?.ok,true,JSON.stringify(messages[0]));
  assert.match(JSON.stringify(messages[0].result),/true/);
  sandbox.onmessage({data:{kind:"inspect",id:2,source}});
  assert.equal(messages[1]?.ok,true,JSON.stringify(messages[1]));
  assert.equal(messages[1].analysis.ok,true,JSON.stringify(messages[1].analysis.diagnostics));
  assert.equal(messages[1].expandError,null,JSON.stringify(messages[1]));
  assert.equal(typeof messages[1].expanded,"string");
  assert.ok(messages[1].expanded.length>0);
  // Int literals expose a renderer limitation in the immutable v0.54 toolchain.
  // The UI must still show the independent analysis instead of discarding it.
  const numeric = "nail 0.54 ;\ndef identityLab x = x ;\nidentityLab 42 ;";
  sandbox.onmessage({data:{kind:"inspect",id:3,source:numeric}});
  assert.equal(messages[2]?.ok,true,JSON.stringify(messages[2]));
  assert.equal(messages[2].analysis?.ok,true,JSON.stringify(messages[2]));
  assert.equal(typeof messages[2].expandError,"string");
});
test("worker, update controller and service worker pass syntax checks", () => {
  for (const filename of ["runtime-worker.js","updates.js","storage.js","sw.js"]) {
    execFileSync(process.execPath,["--check",new URL("../dist/"+filename,import.meta.url).pathname]);
  }
});
