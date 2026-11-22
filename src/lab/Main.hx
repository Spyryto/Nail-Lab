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
  static inline var STORAGE_KEY = "v0.54:core-ast:source";
  static inline var DEFAULT_SOURCE = "nail 0.54 ;\ndef identityLab x = x ;\nidentityLab true ;";
  static var source:String = DEFAULT_SOURCE;
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
    source = value;
    // CodeMirror clears the decoration in its own update transaction.
    clearErrorJump(false);
    text("code-status", "Modifiche in salvataggio…");
    if (saveTimer != null) Browser.window.clearTimeout(saveTimer);
    saveTimer = Browser.window.setTimeout(function() {
      saveTimer = null;
      NailStorage.save(STORAGE_KEY, source).then(function(ok) {
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
    worker = new Worker("./runtime-worker.js");
    worker.onmessage = function(event:MessageEvent) {
      var msg:Dynamic = event.data;
      // An older Worker response must not annotate a newly edited source.
      if (msg.source != null && msg.source != source) return;
      if (msg.kind == "run") {
        text("run-button", "Esegui");
        el("run-button").removeAttribute("disabled");
        el("stop-button").setAttribute("hidden", "");
        text("run-output", msg.ok
          ? Json.stringify(msg.result, null, "  ")
          : Std.string(msg.error));
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
      el("run-button").removeAttribute("disabled");
      text("run-button", "Esegui");
      el("stop-button").setAttribute("hidden", "");
      return true;
    };
  }

  static function run():Void {
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
    worker.postMessage({id:serial, kind:"run", source:source});
  }

  static function stop():Void {
    newWorker();
    clearErrorJump();
    text("run-output", "Esecuzione interrotta.");
    text("run-button", "Esegui");
    el("run-button").removeAttribute("disabled");
    el("stop-button").setAttribute("hidden", "");
  }

  static function inspect():Void {
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
    // Navigation is independent of the editor: an editor failure cannot disable buttons.
    newWorker();
    on("nav-read", function() show("read"));
    on("nav-editor", function() show("editor"));
    on("nav-inspect", function() show("inspect"));
    on("nav-history", function() show("history"));
    on("read-try", function() {
      show("editor");
      try NailEditor.focus() catch (_:Dynamic) {}
    });
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
    NailStorage.load(STORAGE_KEY).then(function(saved) {
      if (saved != null && saved.length > 0) {
        source = saved;
        NailEditor.setValue(saved);
      }
      text("code-status", "Salvato sul dispositivo");
      return null;
    }).catchError(function(_) {
      text("code-status", "Memoria locale non disponibile");
      return null;
    });
  }
}
