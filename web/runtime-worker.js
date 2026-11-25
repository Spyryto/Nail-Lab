/* Official, versioned Nail runtimes. Each Worker loads exactly one version. */
const runtimePaths = Object.freeze({
  "0.54": "./runtime/v0.54/nailseed.js",
  "0.60": "./runtime/v0.60/nailseed.js",
  "0.61": "./runtime/v0.61/nailseed.js",
  "syntax": "./runtime/vsyntax/nailseed.js"
});
const version = self.location?.search
  ? new URLSearchParams(self.location.search).get("version") || "0.54"
  : "0.54"; // Existing test harness and old client default.
const experimental = version === "syntax";
let loadError = null;
try {
  if (!Object.prototype.hasOwnProperty.call(runtimePaths, version))
    throw new Error("Versione di Nail non disponibile: " + version);
  importScripts(runtimePaths[version]);
  if (!self.NailSeed || typeof self.NailSeed.create !== "function")
    throw new Error("NailSeed API not exported by runtime v" + version);
} catch (error) {
  loadError = String(error);
}

// The selected Nail runtime owns the only trustworthy source positions.
// Never infer line/column by splitting or counting textual tokens from an error.
function sourceLocation(diagnostic) {
  const span = diagnostic?.span;
  if (!span ||
      !Number.isInteger(span.line) || span.line < 1 ||
      !Number.isInteger(span.column) || span.column < 1) return null;
  return {line: span.line, column: span.column};
}
function cleanMessage(message, hasLocation) {
  const text = String(message);
  // Suppress the implementation-specific token index ONLY when a verified
  // source location exists. Otherwise keep the original diagnostic intact.
  return hasLocation ? text.replace(/\s+at token \d+\b/g, "").trim() : text;
}
function formatDiagnostic(diagnostic) {
  const loc = sourceLocation(diagnostic);
  const phase = diagnostic.phase === "parse" ? "Sintassi"
    : diagnostic.phase === "type" ? "Tipo" : "Analisi";
  const where = loc ? " · riga " + loc.line + ", colonna " + loc.column
    + (diagnostic.phase === "type" ? " (forma)" : "") : "";
  return phase + where + ": " + cleanMessage(diagnostic.message, loc !== null);
}
function firstDiagnostic(report) {
  return report && Array.isArray(report.diagnostics) && report.diagnostics.length
    ? report.diagnostics[0] : null;
}
function analyzeSource(source) {
  return experimental ? self.NailSeed.analyzeExperimental(source) : self.NailSeed.analyze(source);
}
function analyzeSafely(source) {
  try { return analyzeSource(source); } catch (_) { return null; }
}
function matchesExecutionFailure(diagnostic, error) {
  if (!diagnostic) return false;
  const raw = String(error).replace(/^Error:\s*/, "");
  const reported = String(diagnostic.message).replace(/^Error:\s*/, "");
  // A source parser error with a token index maps to the analyzer's parse span.
  if (diagnostic.phase === "parse" && /\bat token \d+\b/.test(raw)) return true;
  return raw === reported;
}

function clockMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now() : Date.now();
}

self.onmessage = function(event) {
  const {id, kind, source} = event.data || {};
  const startMs = clockMs();
  const elapsedMs = () => Math.max(0, Math.round((clockMs() - startMs) * 100) / 100);
  const sendRun = payload => self.postMessage({...payload, durationMs: elapsedMs()});
  try {
    if (loadError) throw new Error("Runtime non disponibile: " + loadError);
    if (typeof source !== "string" || source.length > 16000) throw new Error("Sorgente non valido o troppo lungo");
    if (kind === "run") {
      // Type inference is optional in the raw Nail VM. The Lab is also a
      // learning IDE, so report genuine static type failures before running.
      // This is NOT an attempt to infer a failing token from the error text:
      // 0.54 exposes the enclosing original form through analyze().diagnostics.
      const analysis = experimental ? analyzeSource(source) : analyzeSafely(source);
      const staticDiagnostic = firstDiagnostic(analysis);
      if (staticDiagnostic?.phase === "type" || (experimental && staticDiagnostic)) {
        sendRun({
          id, kind, version, source, ok: false,
          error: formatDiagnostic(staticDiagnostic),
          diagnostic: sourceLocation(staticDiagnostic) ? staticDiagnostic : null
        });
        return;
      }
      try {
        const vm = self.NailSeed.create(100000);
        vm.loadStdlib();
        const result = experimental ? vm.runPlainExperimental(source) : vm.runPlain(source);
        sendRun({id, kind, version, source, ok: true, result});
      } catch (error) {
        const original = String(error);
        const diagnostic = staticDiagnostic || firstDiagnostic(analyzeSafely(source));
        const matched = matchesExecutionFailure(diagnostic, original);
        sendRun({
          id, kind, version, source, ok: false,
          error: matched ? formatDiagnostic(diagnostic) : "Errore: " + original,
          diagnostic: matched && sourceLocation(diagnostic) ? diagnostic : null
        });
      }
    } else if (kind === "inspect") {
      let analysis = null, expanded = null, analysisError = null, expandError = null;
      try { analysis = analyzeSource(source); }
      catch (error) { analysisError = String(error); }
      const diagnostic = firstDiagnostic(analysis);
      const diagnosticText = diagnostic ? formatDiagnostic(diagnostic) : null;
      try { expanded = experimental ? self.NailSeed.expandExperimental(source) : self.NailSeed.expand(source); }
      catch (error) { expandError = String(error); }
      const expandDiagnosticText = expandError &&
        diagnostic?.phase === "parse" && /\bat token \d+\b/.test(expandError)
          ? formatDiagnostic(diagnostic) : null;
      self.postMessage({
        id, kind, version, source, ok: true, analysis, expanded, analysisError, expandError,
        diagnostic: diagnostic && sourceLocation(diagnostic) ? diagnostic : null,
        diagnosticText, expandDiagnosticText
      });
    }
  } catch (error) {
    const payload = {id, kind, version, source, ok: false, error: "Errore: " + String(error)};
    if (kind === "run") sendRun(payload); else self.postMessage(payload);
  }
};
