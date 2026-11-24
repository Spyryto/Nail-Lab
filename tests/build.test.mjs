import test from "node:test";
import assert from "node:assert/strict";
import {readFile, stat} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import vm from "node:vm";

const source = "nail 0.54 ;\ndef identityLab x = x ;\nidentityLab true ;";
test("PWA shell and compilation artifacts are present", async () => {
  for (const path of ["index.html", "styles.css", "app.js", "editor.js", "runtime-worker.js", "sw.js", "version.json", "manifest.webmanifest", "runtime/v0.54/nailseed.js", "runtime/v0.60/nailseed.js", "runtime/v0.61/nailseed.js"]) {
    assert.ok((await stat(new URL("../dist/" + path, import.meta.url))).size > 0, path);
  }
  const html = await readFile(new URL("../dist/index.html",import.meta.url),"utf8");
  assert.match(html, /name="viewport"/);
  assert.match(html, /panel-inspect/);
  assert.match(html, /nav-history/);
  assert.match(html, /id="nail-version"/);
  assert.match(html, /value="0.60"/);
  assert.match(html, /value="0.61" selected/);
  assert.match(html, /id="read-open-latest"/);
  assert.match(html, /id="editor-size"/);
  assert.match(html, /id="result-card"/);
  assert.match(html, /value="0.54"/);
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

test("Nail v0.60 loads its own official runtime and executes the v0.60 dialect", async () => {
  const runtime = await readFile(new URL("../dist/runtime/v0.60/nailseed.js", import.meta.url),"utf8");
  const worker = await readFile(new URL("../dist/runtime-worker.js",import.meta.url),"utf8");
  const messages = [];
  const sandbox = {console, URLSearchParams, location:{search:"?version=0.60"}};
  sandbox.self = sandbox;
  sandbox.postMessage = result => messages.push(result);
  const context = vm.createContext(sandbox);
  sandbox.importScripts = path => {
    assert.equal(path, "./runtime/v0.60/nailseed.js");
    vm.runInContext(runtime,context,{timeout:15000,filename:"nailseed-v0.60.js"});
  };
  vm.runInContext(worker,context,{timeout:10000,filename:"runtime-worker.js"});
  const source = "nail 0.60 ; def answer = 42 ; answer ;";
  sandbox.onmessage({data:{kind:"run",id:100,source}});
  assert.equal(messages[0]?.version,"0.60");
  assert.equal(messages[0]?.ok,true,JSON.stringify(messages[0]));
  assert.deepEqual(Array.from(messages[0].result),["I:42/1"]);
  sandbox.onmessage({data:{kind:"inspect",id:101,source}});
  assert.equal(messages[1]?.version,"0.60");
  assert.equal(messages[1]?.analysis?.ok,true,JSON.stringify(messages[1]));
});

test("Nail v0.61 loads the official runtime and distinguishes structural from nominal access", async () => {
  const runtime = await readFile(new URL("../dist/runtime/v0.61/nailseed.js", import.meta.url),"utf8");
  const worker = await readFile(new URL("../dist/runtime-worker.js",import.meta.url),"utf8");
  const messages = [];
  const sandbox = {console, URLSearchParams, location:{search:"?version=0.61"}};
  sandbox.self = sandbox;
  sandbox.postMessage = result => messages.push(result);
  const context = vm.createContext(sandbox);
  sandbox.importScripts = path => {
    assert.equal(path,"./runtime/v0.61/nailseed.js");
    vm.runInContext(runtime,context,{timeout:15000,filename:"nailseed-v0.61.js"});
  };
  vm.runInContext(worker,context,{timeout:10000,filename:"runtime-worker.js"});
  const structural = 'nail 0.61 ; type Person { name Text age Float } ; ' +
    'def getName data = data . name ; ' +
    'getName { name = " Ada " , age = 19.0 } ; ' +
    'getName ( Person " Mario " 46.0 ) ;';
  sandbox.onmessage({data:{kind:"run",id:101,source:structural}});
  assert.equal(messages[0]?.version,"0.61");
  assert.equal(messages[0]?.ok,true,JSON.stringify(messages[0]));
  assert.deepEqual(Array.from(messages[0].result),["Ada","Mario"]);
  sandbox.onmessage({data:{kind:"inspect",id:102,source:structural}});
  assert.equal(messages[1]?.analysis?.ok,true,JSON.stringify(messages[1]));
  assert.equal(messages[1]?.version,"0.61");

  const nominal = 'nail 0.61 ; type Person { name Text age Float } ; ' +
    'def getName ( data : Person ) = data . name ; ' +
    'getName { name = " Ada " , age = 19.0 } ;';
  sandbox.onmessage({data:{kind:"run",id:103,source:nominal}});
  assert.equal(messages[2]?.ok,false,JSON.stringify(messages[2]));
  assert.match(messages[2].error,/Tipo/i);
});

test("parse errors use Nail's verified source spans, not token counts", async () => {
  const runtime = await readFile(new URL("../dist/runtime/v0.54/nailseed.js",import.meta.url),"utf8");
  const worker = await readFile(new URL("../dist/runtime-worker.js",import.meta.url),"utf8");
  const messages = [];
  const sandbox = {console};
  sandbox.self = sandbox;
  sandbox.postMessage = result => messages.push(result);
  const context = vm.createContext(sandbox);
  sandbox.importScripts = path => {
    assert.equal(path,"./runtime/v0.54/nailseed.js");
    vm.runInContext(runtime,context,{timeout:10000});
  };
  vm.runInContext(worker,context,{timeout:10000});
  const bad = "nail 0.54 ;\ndef broken x = ;\nbroken true ;";
  sandbox.onmessage({data:{id:10,kind:"run",source:bad}});
  assert.equal(messages[0]?.ok,false,JSON.stringify(messages[0]));
  assert.match(messages[0].error,/riga 2, colonna \d+/);
  assert.doesNotMatch(messages[0].error,/at token \d+/);
  assert.equal(messages[0].diagnostic?.span?.line,2);
  sandbox.onmessage({data:{id:11,kind:"inspect",source:bad}});
  assert.match(messages[1].diagnosticText,/riga 2, colonna \d+/);
  assert.doesNotMatch(messages[1].diagnosticText,/at token \d+/);
  assert.match(messages[1].expandDiagnosticText,/riga 2, colonna \d+/);
  // When Nail supplies no trustworthy span, preserve its original token reference.
  const noSpan = vm.runInContext(
    'formatDiagnostic({phase:"parse",message:"Unknown token at token 99",span:null})',
    context
  );
  assert.equal(noSpan, "Sintassi: Unknown token at token 99");
});

test("type errors report the original enclosing source form", async () => {
  const runtime = await readFile(new URL("../dist/runtime/v0.54/nailseed.js",import.meta.url),"utf8");
  const worker = await readFile(new URL("../dist/runtime-worker.js",import.meta.url),"utf8");
  const messages = [], sandbox = {console};
  sandbox.self = sandbox;
  sandbox.postMessage = message => messages.push(message);
  const context = vm.createContext(sandbox);
  sandbox.importScripts = path => {
    assert.equal(path, "./runtime/v0.54/nailseed.js");
    vm.runInContext(runtime,context,{timeout:10000});
  };
  vm.runInContext(worker,context,{timeout:10000});
  const wrong = "nail 0.54 ;\ndef wrong = true true ;";
  sandbox.onmessage({data:{id:21,kind:"run",source:wrong}});
  assert.equal(messages[0]?.ok,false,JSON.stringify(messages[0]));
  assert.equal(messages[0].diagnostic?.phase,"type",JSON.stringify(messages[0]));
  assert.equal(messages[0].diagnostic?.span?.line,2);
  assert.ok(messages[0].diagnostic?.span?.end > messages[0].diagnostic?.span?.start);
  assert.match(messages[0].error,/Tipo · riga 2, colonna \d+ \(forma\)/);
  sandbox.onmessage({data:{id:22,kind:"inspect",source:wrong}});
  assert.equal(messages[1]?.diagnostic?.phase,"type",JSON.stringify(messages[1]));
  assert.equal(messages[1]?.diagnostic?.span?.line,2);
  assert.match(messages[1].diagnosticText,/riga 2, colonna \d+ \(forma\)/);
});

test("worker, update controller and service worker pass syntax checks", () => {
  for (const filename of ["runtime-worker.js","updates.js","storage.js","sw.js"]) {
    execFileSync(process.execPath,["--check",new URL("../dist/"+filename,import.meta.url).pathname]);
  }
});
