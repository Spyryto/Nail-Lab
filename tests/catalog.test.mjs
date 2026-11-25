import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const catalog = JSON.parse(await readFile(new URL("../dist/examples.json",import.meta.url),"utf8"));
const allowed = new Set(["0.54","0.60","0.61","syntax","stdlib"]);

test("versioned catalog has unique complete entries, preserved by the offline build",async()=>{
  assert.equal(catalog.schema,1);
  assert.equal(catalog.examples.length,22);
  const ids=new Set();
  for(const item of catalog.examples) {
    assert.match(item.id,/^[a-z0-9-]+$/);
    assert.equal(ids.has(item.id),false,"duplicate ID "+item.id);
    ids.add(item.id);
    assert.equal(allowed.has(item.version),true,item.id);
    assert.ok(item.title && item.summary && item.category,item.id);
    assert.ok(item.version==="stdlib" ? !item.source.startsWith("nail ") : item.source.startsWith("nail "+(item.version==="syntax"?"0.61":item.version)+" ;"),item.id);
    assert.ok(item.expect?.kind==="ok"||item.expect?.kind==="error",item.id);
  }
  const sw=await readFile(new URL("../dist/sw.js",import.meta.url),"utf8");
  assert.match(sw,/\.\/examples\.json/);
  assert.match(sw,/\.\/catalog\.js/);
});

for(const version of allowed) {
  test("catalog runs every v"+version+" example in its official Nail Worker",async()=>{
    const runtimeVersion=version==="stdlib"?"syntax":version;
    const runtime=await readFile(new URL("../dist/runtime/v"+runtimeVersion+"/nailseed.js",import.meta.url),"utf8");
    const worker=await readFile(new URL("../dist/runtime-worker.js",import.meta.url),"utf8");
    const messages=[];
    const sandbox={console,URLSearchParams,location:{search:"?version="+version}};
    sandbox.self=sandbox;
    sandbox.postMessage=message=>messages.push(message);
    const context=vm.createContext(sandbox);
    sandbox.importScripts=path=>{
      assert.equal(path,"./runtime/v"+runtimeVersion+"/nailseed.js");
      vm.runInContext(runtime,context,{timeout:15000,filename:"nailseed-v"+version+".js"});
    };
    vm.runInContext(worker,context,{timeout:10000,filename:"runtime-worker.js"});
    const entries=catalog.examples.filter(e=>e.version===version);
    assert.ok(entries.length>0);
    for(const item of entries) {
      const before=messages.length;
      sandbox.onmessage({data:{kind:"run",id:before+1,source:item.source}});
      const msg=messages.at(-1);
      assert.equal(messages.length,before+1,"No Worker response from "+item.id);
      assert.equal(msg.version,version);
      assert.equal(msg.ok,item.expect.kind==="ok",
        item.id+" "+JSON.stringify(msg));
      if(item.expect.kind==="error") {
        assert.equal(msg.diagnostic?.phase,item.expect.phase,
          item.id+" "+JSON.stringify(msg));
      } else if(item.expect.result) {
        // Nested arrays also originate in the isolated Worker realm.
        assert.deepEqual(JSON.parse(JSON.stringify(msg.result)),item.expect.result,item.id);
      }
    }
  });
}
