import {mkdtemp, mkdir, readdir, copyFile, rm, access, readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {spawnSync} from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const versions = ["0.54", "0.60", "0.61"];


function command(program, args, cwd) {
  const result = spawnSync(program, args, {stdio: "inherit", cwd});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(program + " failed (" + result.status + ")");
}
async function findFile(dir, basename) {
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const match = await findFile(path, basename);
      if (match) return match;
    } else if (entry.isFile() && entry.name === basename) return path;
  }
  return null;
}
for (const version of versions) {
  const destination = join(root, "vendor", "nailseed-v" + version + ".js");
  const zipUrl = "https://github.com/Spyryto/NailLang/releases/download/v" + version +
    "/naillang-v" + version + "-js.zip";
  if (process.argv.includes("--cached")) {
    try {
      await access(destination);
      console.log("Using cached Nail " + version + " runtime");
      continue;
    } catch { /* fetch missing runtime */ }
  }
  const temp = await mkdtemp(join(tmpdir(), "nail-lab-runtime-"));
  try {
    const archive = join(temp, "runtime.zip");
    const unpacked = join(temp, "unpacked");
    await mkdir(unpacked);
    command("curl", ["--fail", "--location", "--silent", "--show-error", "--retry",
      "3", zipUrl, "--output", archive]);
    command("unzip", ["-q", archive, "-d", unpacked]);
    const source = await findFile(unpacked, "nailseed.js");
    if (!source) throw new Error("Nail v" + version + " release does not contain nailseed.js");
    await mkdir(join(root, "vendor"), {recursive:true});
    await copyFile(source, destination);
    console.log("Pinned Nail v" + version + " installed at " + destination);
  } finally {
    await rm(temp, {recursive:true, force:true});
  }
}

// Experimental source is pinned independently of the official release ZIPs.
const experimentCommit = "350694cc98171c02540cd37c926a38a130942191";
const experimentDestination = join(root, "vendor", "nailseed-vsyntax.js");
const stamp = join(root, "vendor", "syntax-commit.txt");
let cached = false;
if (process.argv.includes("--cached")) {
  try { await access(experimentDestination); cached = (await readFile(stamp,"utf8")).trim() === experimentCommit; } catch {}
}
if (!cached) {
  const temp = await mkdtemp(join(tmpdir(), "nail-lab-syntax-"));
  try {
    const archive = join(temp, "source.tar.gz");
    command("curl", ["--fail", "--location", "--silent", "--show-error", "--retry", "3",
      "https://github.com/Spyryto/NailLang/archive/" + experimentCommit + ".tar.gz", "--output", archive]);
    command("tar", ["-xzf", archive, "-C", temp, "--strip-components=1"]);
    await mkdir(join(temp,"build","js"),{recursive:true});
    command("haxe", ["js.hxml"], temp);
    await copyFile(join(temp,"build","js","nailseed.js"), experimentDestination);
    await writeFile(stamp,experimentCommit+"\n");
    console.log("Pinned experimental syntax runtime: " + experimentCommit);
  } finally { await rm(temp,{recursive:true,force:true}); }
}
