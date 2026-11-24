import {mkdir, rm, copyFile, readFile, writeFile, access} from "node:fs/promises";
import {resolve, join} from "node:path";
import {spawnSync} from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
function run(program, args) {
  const result = spawnSync(program, args, {cwd:root, stdio:"inherit"});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(program + " failed (" + result.status + ")");
}
const versions = ["0.54", "0.60"];
for (const version of versions) {
  try { await access(join(root, "vendor", "nailseed-v" + version + ".js")); }
  catch { throw new Error("Missing Nail v" + version + " runtime. Run npm run fetch:runtime first."); }
}

await rm(dist, {recursive:true, force:true});
for (const version of versions) {
  await mkdir(join(dist, "runtime", "v" + version), {recursive:true});
}
for (const filename of ["index.html", "styles.css", "storage.js", "runtime-worker.js", "updates.js", "manifest.webmanifest", "icon.svg"]) {
  await copyFile(join(root, "web", filename), join(dist, filename));
}
for (const version of versions) {
  await copyFile(join(root, "vendor", "nailseed-v" + version + ".js"),
    join(dist, "runtime", "v" + version, "nailseed.js"));
}
run("haxe", ["build.hxml"]);
run(join(root, "node_modules", ".bin", "esbuild"), [
  "web/editor.js", "--bundle", "--format=iife", "--target=es2020",
  "--minify", "--outfile=dist/editor.js"
]);

const build = process.env.GITHUB_SHA ?? process.env.NAIL_LAB_BUILD ?? "local";
const timestamp = new Date().toISOString();
await writeFile(join(dist, "version.json"), JSON.stringify({build, timestamp, nail:"0.60", runtimes:versions}, null, 2) + "\n");
const serviceWorker = (await readFile(join(root,"web","sw.js"),"utf8")).replaceAll("__BUILD_ID__",build);
await writeFile(join(dist,"sw.js"),serviceWorker);
console.log("Built Nail Lab PWA at dist/ (Nail " + versions.join(", ") + ", build " + build + ")");
