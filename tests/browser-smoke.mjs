import {createServer} from "node:http";
import {readFile, stat} from "node:fs/promises";
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
  await page.getByRole("button",{name:"Scrivi"}).click();
  await page.locator("#panel-editor").waitFor({state:"visible",timeout:4000});
  await page.locator(".cm-editor").waitFor({state:"visible",timeout:4000});
  await page.getByRole("button",{name:"Esegui",exact:true}).click();
  await page.waitForFunction(()=>document.getElementById("run-output").textContent.includes("true"),{timeout:12000});
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

  await page.getByRole("button",{name:"Storia"}).click();
  await page.locator("#panel-history").waitFor({state:"visible",timeout:4000});
  await page.getByRole("button",{name:"Leggi"}).click();
  await page.locator("#panel-read").waitFor({state:"visible",timeout:4000});
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
