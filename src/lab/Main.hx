package lab;

import haxe.Json;
import js.Browser;
import js.html.Element;
import js.html.Worker;
import js.html.MessageEvent;
import lab.Bridges.NailEditor;
import lab.Bridges.NailStorage;

/** Single-column portrait PWA: the UI does not implement a Nail parser or VM. */
class Main {
  static inline var VERSION_KEY = "nail-lab:selected-version";
  static var version:String = "0.61";
  static var source:String = defaultSource("0.61");
  static var ignoreEditorChanges:Bool = false;
  static var draftEpoch:Int = 0;
  static var loadingDraft:Bool = false;

  static function supported(value:String):Bool return value == "0.54" || value == "0.60" || value == "0.61";
  static function storageKey(value:String):String return "v" + value + ":core-ast:source";
  static function defaultSource(value:String):String {
    if (value == "0.61") return "nail 0.61 ;\ntype Person { name Text age Float } ;\ndef getName data = data . name ;\ngetName { name = \" Ada \" , age = 19.0 } ;\ngetName ( Person \" Mario \" 46.0 ) ;";
    return "nail " + value + " ;\ndef identityLab x = x ;\nidentityLab true ;";
  }

  static function updateVersionUi():Void {
    var select:js.html.SelectElement = cast el("nail-version");
    select.value = version;
    text("active-version", "Nail v" + version);
    text("editor-version-label", "LABORATORIO · NAIL v" + version);
    text("inspect-version-label", "STRUMENTI · NAIL v" + version);
    text("runtime-note", version == "0.61"
      ? "Novità: un campo su un parametro senza annotazione è strutturale; ( data : Person ) resta nominale."
      : version == "0.60" ? "CoreIR e consolidamento · release storica." : "La versione della lezione sui cinque costruttori.");
  }

  static function loadDraft():Void {
    var selected = version;
    var epoch = ++draftEpoch;
    loadingDraft = true;
    text("code-status", "Caricamento bozza v" + selected + "…");
    NailStorage.load(storageKey(selected)).then(function(saved) {
      if (epoch != draftEpoch || selected != version) return null;
      source = saved != null && saved.length > 0 ? saved : defaultSource(selected);
      ignoreEditorChanges = true;
      try NailEditor.setValue(source) catch (_:Dynamic) {}
      ignoreEditorChanges = false;
      loadingDraft = false;
      text("code-status", "Bozza v" + selected + " sul dispositivo");
      return null;
    }).catchError(function(_) {
      if (epoch == draftEpoch && selected == version) {
        loadingDraft = false;
        text("code-status", "Memoria locale non disponibile");
      }
      return null;
    });
  }

  static function switchVersion(next:String):Void {
    if (!supported(next) || next == version) return;
    if (saveTimer != null) {
      Browser.window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    // Save the old draft under its version before switching Worker.
    NailStorage.save(storageKey(version), source);
    version = next;
    try Browser.window.localStorage.setItem(VERSION_KEY, version)
    catch (_:Dynamic) {}
    updateVersionUi();
    newWorker(); // Also cancels any previous version's in-flight execution.
    clearErrorJump();
    text("run-button", "Esegui");
    el("run-button").removeAttribute("disabled");
    el("stop-button").setAttribute("hidden", "");
    text("run-output", "Premi Esegui per provare Nail v" + version + ".");
    resultState("idle", "PRONTO");
    runFeedback("idle", "Pronto per l’esecuzione");
    text("expand-output", "Apri Esplora per analizzare Nail v" + version + ".");
    text("types-output", "Apri Esplora per analizzare Nail v" + version + ".");
    loadDraft();
  }
  static var section:String = "read";
  static var worker:Worker;
  static var saveTimer:Null<Int> = null;
  static var serial:Int = 0;
  static var errorLine:Int = 0;
  static var errorColumn:Int = 0;

  static function clearErrorJump(?clearEditorDecoration:Bool = true):Void {
    errorLine = 0;
    errorColumn = 0;
    el("error-jump").setAttribute("hidden", "");
    el("inspect-jump").setAttribute("hidden", "");
    if (clearEditorDecoration)
      try NailEditor.clearDiagnostic() catch (_:Dynamic) {}
  }

  static function showErrorJump(diagnostic:Dynamic):Void {
    clearErrorJump();
    if (diagnostic == null || diagnostic.span == null) return;
    var span:Dynamic = diagnostic.span;
    if (span.line == null || span.column == null || span.line < 1 || span.column < 1) return;
    errorLine = Std.int(span.line);
    errorColumn = Std.int(span.column);
    var at = "Vai a riga " + errorLine + ", colonna " + errorColumn;
    if (diagnostic.phase == "type") at += " (forma)";
    text("error-jump", at);
    text("inspect-jump", at + " nell'editor");
    el("error-jump").removeAttribute("hidden");
    el("inspect-jump").removeAttribute("hidden");
    try NailEditor.markDiagnostic(span, Std.string(diagnostic.phase)) catch (_:Dynamic) {}
  }

  static function el(id:String):Element {
    var node = Browser.document.getElementById(id);
    if (node == null) throw "Missing Nail Lab element: " + id;
    return node;
  }

  static function text(id:String, value:String):Void el(id).textContent = value;
  static function resultState(state:String, caption:String):Void {
    el("result-card").setAttribute("data-state", state);
    text("result-state", caption);
  }
  static function runFeedback(state:String, message:String, ?duration:Dynamic):Void {
    el("run-feedback").setAttribute("data-state", state);
    text("run-feedback-text", message);
    var timer=el("run-feedback-time");
    if (state=="success" && duration!=null) {
      var ms:Float=duration;
      text("run-feedback-time", Std.string(Math.round(ms*100)/100)+" ms · analisi + esecuzione");
      timer.removeAttribute("hidden");
    } else {
      timer.setAttribute("hidden","");
    }
  }
  static function on(id:String, callback:Void->Void):Void
    el(id).addEventListener("click", function(_) callback());

  static function show(next:String):Void {
    section = next;
    for (name in ["read", "editor", "inspect", "history"]) {
      var active = name == next;
      if (active) el("panel-" + name).removeAttribute("hidden");
      else el("panel-" + name).setAttribute("hidden", "");
      el("nav-" + name).setAttribute("aria-current", active ? "page" : "false");
    }
    if (next == "inspect") inspect();
  }

  static function changed(value:String):Void {
    if (ignoreEditorChanges) return;
    source = value;
    // CodeMirror clears the decoration in its own update transaction.
    clearErrorJump(false);
    text("code-status", "Modifiche in salvataggio…");
    if (saveTimer != null) Browser.window.clearTimeout(saveTimer);
    saveTimer = Browser.window.setTimeout(function() {
      saveTimer = null;
      NailStorage.save(storageKey(version), source).then(function(ok) {
        text("code-status", ok ? "Salvato sul dispositivo" : "Salvataggio non disponibile");
        return null;
      }).catchError(function(_) {
        text("code-status", "Salvataggio non disponibile");
        return null;
      });
    }, 350);
  }

  static function newWorker():Void {
    if (worker != null) worker.terminate();
    worker = new Worker("./runtime-worker.js?version=" + version);
    worker.onmessage = function(event:MessageEvent) {
      var msg:Dynamic = event.data;
      if (msg.version != version) return;
      // An older Worker response must not annotate a newly edited source.
      if (msg.source != null && msg.source != source) return;
      if (msg.kind == "run") {
        text("run-button", "Esegui");
        el("run-button").removeAttribute("disabled");
        el("stop-button").setAttribute("hidden", "");
        text("run-output", msg.ok
          ? Json.stringify(msg.result, null, "  ")
          : Std.string(msg.error));
        resultState(msg.ok ? "success" : "error", msg.ok ? "COMPLETATO" : "ERRORE");
        runFeedback(msg.ok ? "success" : "error",
          msg.ok ? "Esecuzione riuscita" : Std.string(msg.error), msg.durationMs);
        showErrorJump(msg.ok ? null : msg.diagnostic);
      } else if (msg.kind == "inspect") {
        text("expand-output", msg.expandError != null
          ? (msg.expandDiagnosticText != null
            ? Std.string(msg.expandDiagnosticText)
            : "Espansione non disponibile: " + Std.string(msg.expandError))
          : (msg.ok ? Std.string(msg.expanded) : Std.string(msg.error)));
        text("types-output", msg.analysisError != null
          ? "Analisi non disponibile: " + Std.string(msg.analysisError)
          : (msg.diagnosticText != null
            ? Std.string(msg.diagnosticText)
            : (msg.ok ? Json.stringify(msg.analysis, null, "  ") : Std.string(msg.error))));
        showErrorJump(msg.diagnostic);
      }
    };
    worker.onerror = function(_) {
      text("run-output", "Errore nel Worker Nail. Prova a riavviare.");
      resultState("error", "ERRORE");
      runFeedback("error", "Errore nel runtime Nail");
      el("run-button").removeAttribute("disabled");
      text("run-button", "Esegui");
      el("stop-button").setAttribute("hidden", "");
      return true;
    };
  }

  static function run():Void {
    if (loadingDraft) return;
    clearErrorJump();
    if (source.length > 16000) {
      text("run-output", "Esempio troppo lungo (limite 16.000 caratteri).");
      return;
    }
    serial++;
    text("run-button", "Esecuzione…");
    el("run-button").setAttribute("disabled", "");
    el("stop-button").removeAttribute("hidden");
    text("run-output", "Elaborazione in corso…");
    resultState("running", "IN ESECUZIONE");
    runFeedback("running", "Analisi ed esecuzione in corso…");
    worker.postMessage({id:serial, kind:"run", source:source});
  }

  static function stop():Void {
    newWorker();
    clearErrorJump();
    text("run-output", "Esecuzione interrotta.");
    resultState("idle", "INTERROTTO");
    runFeedback("idle", "Esecuzione interrotta");
    text("run-button", "Esegui");
    el("run-button").removeAttribute("disabled");
    el("stop-button").setAttribute("hidden", "");
  }

  static function inspect():Void {
    if (loadingDraft) return;
    if (source.length > 16000) {
      text("expand-output", "Sorgente troppo lungo.");
      text("types-output", "Sorgente troppo lungo.");
      return;
    }
    text("expand-output", "Analisi in corso…");
    text("types-output", "Analisi in corso…");
    serial++;
    worker.postMessage({id:serial, kind:"inspect", source:source});
  }

  static function inspectTab(name:String):Void {
    for (part in ["expand", "types"]) {
      if (part == name) el("inspect-" + part).removeAttribute("hidden");
      else el("inspect-" + part).setAttribute("hidden", "");
      el("tab-" + part).setAttribute("aria-selected", part == name ? "true" : "false");
    }
  }

  static function main():Void {
    try {
      var stored = Browser.window.localStorage.getItem(VERSION_KEY);
      if (stored != null && supported(stored)) version = stored;
    } catch (_:Dynamic) {}
    source = defaultSource(version);
    updateVersionUi();
    // Navigation is independent of the editor: an editor failure cannot disable buttons.
    newWorker();
    el("nail-version").addEventListener("change", function(_) {
      var select:js.html.SelectElement = cast el("nail-version");
      switchVersion(select.value);
    });
    on("nav-read", function() show("read"));
    on("read-open-latest", function() {
      if (version != "0.61") switchVersion("0.61");
      show("editor");
      try NailEditor.focus() catch (_:Dynamic) {}
    });
    on("editor-size", function() {
      var panel=el("panel-editor");
      var expand=panel.getAttribute("data-expanded") != "true";
      panel.setAttribute("data-expanded", expand ? "true" : "false");
      text("editor-size", expand ? "Riduci" : "Amplia");
    });
    on("nav-editor", function() show("editor"));
    on("nav-inspect", function() show("inspect"));
    on("nav-history", function() show("history"));
    on("run-button", run);
    on("stop-button", stop);
    on("error-jump", function() {
      if (errorLine > 0) NailEditor.goTo(errorLine, errorColumn);
    });
    on("inspect-jump", function() {
      if (errorLine > 0) {
        show("editor");
        NailEditor.goTo(errorLine, errorColumn);
      }
    });
    on("inspect-refresh", inspect);
    on("tab-expand", function() inspectTab("expand"));
    on("tab-types", function() inspectTab("types"));
    inspectTab("expand");
    show("read");

    try {
      NailEditor.mount("code-editor", source, changed);
    } catch (error:Dynamic) {
      text("code-status", "Editor non disponibile: " + Std.string(error));
      return;
    }
    loadDraft();
  }
}
