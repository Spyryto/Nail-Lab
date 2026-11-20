/* Historical Nail 0.54, not a JS reimplementation of the language. */
let loadError = null;
try {
  importScripts("./runtime/v0.54/nailseed.js");
  if (!self.NailSeed) throw new Error("NailSeed API not exported by runtime");
} catch (error) {
  loadError = String(error);
}

self.onmessage = function(event) {
  const {id, kind, source} = event.data || {};
  try {
    if (loadError) throw new Error("Runtime non disponibile: " + loadError);
    if (typeof source !== "string" || source.length > 16000) throw new Error("Sorgente non valido o troppo lungo");
    if (kind === "run") {
      const vm = self.NailSeed.create(100000);
      vm.loadStdlib();
      const result = vm.runPlain(source);
      self.postMessage({id, kind, ok: true, result});
    } else if (kind === "inspect") {
      let analysis = null, expanded = null, analysisError = null, expandError = null;
      try { analysis = self.NailSeed.analyze(source); }
      catch (error) { analysisError = String(error); }
      try { expanded = self.NailSeed.expand(source); }
      catch (error) { expandError = String(error); }
      self.postMessage({id, kind, ok: true, analysis, expanded, analysisError, expandError});
    }
  } catch (error) {
    self.postMessage({id, kind, ok: false, error: String(error)});
  }
};
