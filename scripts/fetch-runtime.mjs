import {mkdtemp, mkdir, readdir, copyFile, rm, access} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {spawnSync} from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const versions = ["0.54", "0.60", "0.61"];


function command(program, args) {
  const result = spawnSync(program, args, {stdio: "inherit"});
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
