/* Historical Nail 0.54, not a JS reimplementation of the language. */
let loadError = null;
try {
  importScripts("./runtime/v0.54/nailseed.js");
  if (!self.NailSeed) throw new Error("NailSeed API not exported by runtime");
} catch (error) {
  loadError = String(error);
}

// Nail 0.54's static analyzer owns the only trustworthy source positions.
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
function analyzeSafely(source) {
  try { return self.NailSeed.analyze(source); } catch (_) { return null; }
}
function matchesExecutionFailure(diagnostic, error) {
  if (!diagnostic) return false;
  const raw = String(error).replace(/^Error:\s*/, "");
  const reported = String(diagnostic.message).replace(/^Error:\s*/, "");
  // A source parser error with a token index maps to the analyzer's parse span.
  if (diagnostic.phase === "parse" && /\bat token \d+\b/.test(raw)) return true;
  return raw === reported;
}

self.onmessage = function(event) {
  const {id, kind, source} = event.data || {};
  try {
    if (loadError) throw new Error("Runtime non disponibile: " + loadError);
    if (typeof source !== "string" || source.length > 16000) throw new Error("Sorgente non valido o troppo lungo");
    if (kind === "run") {
      try {
        const vm = self.NailSeed.create(100000);
        vm.loadStdlib();
        const result = vm.runPlain(source);
        self.postMessage({id, kind, ok: true, result});
      } catch (error) {
        const original = String(error);
        const diagnostic = firstDiagnostic(analyzeSafely(source));
        const matched = matchesExecutionFailure(diagnostic, original);
        self.postMessage({
          id, kind, ok: false,
          error: matched ? formatDiagnostic(diagnostic) : "Errore: " + original,
          diagnostic: matched && sourceLocation(diagnostic) ? diagnostic : null
        });
      }
    } else if (kind === "inspect") {
      let analysis = null, expanded = null, analysisError = null, expandError = null;
      try { analysis = self.NailSeed.analyze(source); }
      catch (error) { analysisError = String(error); }
      const diagnostic = firstDiagnostic(analysis);
      const diagnosticText = diagnostic ? formatDiagnostic(diagnostic) : null;
      try { expanded = self.NailSeed.expand(source); }
      catch (error) { expandError = String(error); }
      const expandDiagnosticText = expandError &&
        diagnostic?.phase === "parse" && /\bat token \d+\b/.test(expandError)
          ? formatDiagnostic(diagnostic) : null;
      self.postMessage({
        id, kind, ok: true, analysis, expanded, analysisError, expandError,
        diagnosticText, expandDiagnosticText
      });
    }
  } catch (error) {
    self.postMessage({id, kind, ok: false, error: "Errore: " + String(error)});
  }
};
