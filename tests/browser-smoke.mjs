import {createServer} from "node:http";
import {readFile, stat, mkdir} from "node:fs/promises";
import {resolve, join, extname, sep} from "node:path";
import {chromium} from "playwright";
import assert from "node:assert/strict";

const ROOT = resolve("dist");
const mime = {
  ".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",
  ".js":"application/javascript; charset=utf-8",".json":"application/json; charset=utf-8",
  ".webmanifest":"application/manifest+json; charset=utf-8",".svg":"image/svg+xml"
};
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,"http://localhost");
    const filename=resolve(ROOT,"."+url.pathname, url.pathname.endsWith("/")?"index.html":"");
    if (!filename.startsWith(ROOT+sep) && filename!==ROOT) {
      res.writeHead(403);res.end();return;
    }
    const file=await readFile(filename);
    res.writeHead(200,{"content-type":mime[extname(filename)]||"application/octet-stream","cache-control":"no-store"});
    res.end(file);
  } catch(err) {res.writeHead(404);res.end(String(err));}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port;
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const errors=[];
const page=await browser.newPage({
  viewport:{width:390,height:844},deviceScaleFactor:2,
  isMobile:true,hasTouch:true
});
page.on("pageerror",err=>errors.push(err.stack??String(err)));
page.on("console",msg=>{if(msg.type()==="error") errors.push("console: "+msg.text());});
try {
  const response=await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:"networkidle"});
  assert.equal(response.status(),200);
  // The home screen must have one clear CTA, with a coloured source example.
  assert.equal(await page.locator("#read-open-latest").count(),1);
  assert.equal(await page.locator("#read-try").count(),0);
  assert.equal(await page.locator("pre.example code .nail-token-keyword").count()>0,true);
  await mkdir("test-results",{recursive:true});
  await page.screenshot({path:"test-results/nail-lab-home.png",fullPage:true});
  await page.getByRole("button",{name:"Scrivi"}).click();
  await page.locator("#panel-editor").waitFor({state:"visible",timeout:4000});
  await page.locator(".cm-editor").waitFor({state:"visible",timeout:4000});
  assert.equal(await page.locator("#nail-version").inputValue(), "0.61");
  await page.locator("#nail-version").selectOption("0.54");
  await page.waitForFunction(() => window.NailEditor?.getValue().startsWith("nail 0.54 ;"),
    null, {timeout:12000});
  await page.getByRole("button",{name:"Esegui",exact:true}).click();
  await page.waitForFunction(()=>document.getElementById("run-output").textContent.includes("true"),{timeout:12000});
  assert.equal(await page.locator("#run-feedback").getAttribute("data-state"),"success");
  assert.match(await page.locator("#run-feedback-time").innerText(),/ms · analisi \+ esecuzione/);
  assert.equal(await page.locator("#run-feedback-time").isVisible(),true);
  await page.getByRole("button",{name:"Esplora"}).click();
  await page.locator("#panel-inspect").waitFor({state:"visible",timeout:4000});
  await page.getByRole("tab",{name:"Tipi e simboli"}).click();
  await page.waitForFunction(()=>document.getElementById("types-output").textContent.includes('"ok": true'),null,{timeout:12000});
  // A syntax error must display source coordinates and offer direct navigation.
  await page.getByRole("button",{name:"Scrivi"}).click();
  await page.locator(".cm-content").fill("nail 0.54 ;\ndef broken x = ;\nbroken true ;");
  await page.getByRole("button",{name:"Esegui",exact:true}).click();
  await page.waitForFunction(
    ()=>document.getElementById("run-output").textContent.includes("riga 2, colonna"),
    null,{timeout:12000}
  );
  assert.equal(await page.locator("#run-feedback").getAttribute("data-state"),"error");
  assert.match(await page.locator("#run-feedback-text").innerText(),/riga 2, colonna/);
  assert.equal(await page.locator("#run-feedback-time").isHidden(),true);
  const renderedError = await page.locator("#run-output").innerText();
  assert.doesNotMatch(renderedError,/at token \d+/);
  await page.getByRole("button",{name:/Vai a riga 2, colonna/}).click();
  await page.waitForFunction(
    () => document.activeElement?.closest(".cm-editor") !== null,
    null,{timeout:3000}
  );
  const currentLine = await page.evaluate(() =>
    window.getSelection()?.anchorNode?.parentElement?.closest(".cm-line")?.textContent ?? ""
  );
  assert.match(currentLine,/def broken x = ;/);

  // A parse error is marked on the actual offending token in CodeMirror.
  assert.equal(await page.locator(".cm-nail-diagnostic-token").count(),1);
  // A type failure is attributed to the full enclosing form (Nail 0.54 semantics).
  await page.locator(".cm-content").fill("nail 0.54 ;\ndef wrong = true true ;");
  await page.getByRole("button",{name:"Esegui",exact:true}).click();
  await page.waitForFunction(
    ()=>document.getElementById("run-output").textContent.includes("Tipo · riga 2, colonna"),
    null,{timeout:12000}
  );
  assert.match(await page.locator("#run-output").innerText(),/\(forma\)/);
  await page.locator(".cm-nail-diagnostic-form").first().waitFor({state:"visible",timeout:3000});
  await page.getByRole("button",{name:"Esplora"}).click();
  await page.getByRole("tab",{name:"Tipi e simboli"}).click();
  await page.waitForFunction(
    ()=>document.getElementById("types-output").textContent.includes("Tipo · riga 2"),
    null,{timeout:12000}
  );
  await page.getByRole("button",{name:/Vai a riga 2, colonna .* nell'editor/}).click();
  await page.locator("#panel-editor").waitFor({state:"visible",timeout:3000});
  await page.locator(".cm-nail-diagnostic-form").first().waitFor({state:"visible",timeout:3000});
  await page.getByRole("button",{name:"Storia"}).click();
  await page.locator("#panel-history").waitFor({state:"visible",timeout:4000});
  await page.getByRole("button",{name:"Leggi"}).click();
  await page.locator("#panel-read").waitFor({state:"visible",timeout:4000});
  // Switching releases creates an isolated Worker and retains each draft.
  await page.getByRole("button",{name:"Scrivi"}).click();
  // A version switch must reset controls even when the previous run was busy.
  await page.evaluate(() => {
    const run = document.getElementById("run-button");
    run.disabled = true;
    run.textContent = "Esecuzione…";
    document.getElementById("stop-button").hidden = false;
  });
  await page.locator("#nail-version").selectOption("0.60");
  assert.equal(await page.locator("#run-button").isEnabled(),true);
  assert.equal(await page.locator("#stop-button").isHidden(),true);
  await page.waitForFunction(() => window.NailEditor?.getValue().startsWith("nail 0.60 ;"),
    null,{timeout:12000});
  await page.locator(".cm-content").fill("nail 0.60 ; def answer = 42 ; answer ;");
  await page.getByRole("button",{name:"Esegui",exact:true}).click();
  await page.waitForFunction(() => document.getElementById("run-output").textContent.includes("I:42/1"),
    null,{timeout:12000});
  await page.locator("#nail-version").selectOption("0.54");
  await page.waitForFunction(() => window.NailEditor?.getValue().includes("def wrong = true true"),
    null,{timeout:12000});
  await page.reload({waitUntil:"networkidle"});
  assert.equal(await page.locator("#nail-version").inputValue(),"0.54");
  await page.waitForFunction(() => window.NailEditor?.getValue().includes("def wrong = true true"),
    null,{timeout:12000});
  // v0.61 uses the actual new compiler/runtime, not a replacement JS parser.
  await page.getByRole("button",{name:"Scrivi"}).click();
  await page.locator("#panel-editor").waitFor({state:"visible",timeout:4000});
  await page.locator("#nail-version").selectOption("0.61");
  await page.waitForFunction(() => window.NailEditor?.getValue().startsWith("nail 0.61 ;"),
    null,{timeout:12000});
  assert.equal(await page.locator("#runtime-note").innerText().then(t => t.includes("strutturale")),true);
  await page.getByRole("button",{name:"Amplia"}).click();
  assert.equal(await page.locator("#panel-editor").getAttribute("data-expanded"),"true");
  await page.getByRole("button",{name:"Riduci"}).click();
  assert.equal(await page.locator("#panel-editor").getAttribute("data-expanded"),"false");
  await page.getByRole("button",{name:"Esegui",exact:true}).click();
  await page.waitForFunction(() => document.getElementById("run-output").textContent.includes("Ada") &&
    document.getElementById("run-output").textContent.includes("Mario"),null,{timeout:12000});
  assert.equal(await page.locator("#result-card").getAttribute("data-state"),"success");
  assert.equal(await page.locator("#run-feedback").getAttribute("data-state"),"success");
  assert.match(await page.locator("#run-feedback-time").innerText(),/ms/);
  await page.screenshot({path:"test-results/nail-lab-editor-061.png",fullPage:true});
  await page.locator(".cm-content").fill(
    'nail 0.61 ; type Person { name Text age Float } ; ' +
    'def getName ( data : Person ) = data . name ; ' +
    'getName { name = " Ada " , age = 19.0 } ;'
  );
  await page.getByRole("button",{name:"Esegui",exact:true}).click();
  await page.waitForFunction(() => document.getElementById("run-output").textContent.includes("Tipo"),
    null,{timeout:12000});
  assert.equal(await page.locator("#result-card").getAttribute("data-state"),"error");
  assert.equal(await page.locator("#run-feedback").getAttribute("data-state"),"error");
  assert.match(await page.locator("#run-feedback-text").innerText(),/Tipo/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),true,
    "Mobile layout should not scroll horizontally");
  assert.deepEqual(errors,[],"Browser errors: "+errors.join("\n"));
  console.log("PASS: Mobile navigation, CodeMirror, Nail execution, analysis and history");
} catch(error) {
  console.error("BROWSER ERRORS:\n"+errors.join("\n"));
  console.error("UI:",await page.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
