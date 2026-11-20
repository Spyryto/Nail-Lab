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
      if (msg.kind == "run") {
        text("run-button", "Esegui");
        el("run-button").removeAttribute("disabled");
        el("stop-button").setAttribute("hidden", "");
        text("run-output", msg.ok
          ? Json.stringify(msg.result, null, "  ")
          : "Errore: " + Std.string(msg.error));
      } else if (msg.kind == "inspect") {
        text("expand-output", msg.expandError != null
          ? "Espansione non disponibile: " + Std.string(msg.expandError)
          : (msg.ok ? Std.string(msg.expanded) : "Errore: " + Std.string(msg.error)));
        text("types-output", msg.analysisError != null
          ? "Analisi non disponibile: " + Std.string(msg.analysisError)
          : (msg.ok ? Json.stringify(msg.analysis, null, "  ") : "Errore: " + Std.string(msg.error)));
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
    NailEditor.mount("code-editor", source, changed);
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

    newWorker();
    on("nav-read", function() show("read"));
    on("nav-editor", function() show("editor"));
    on("nav-inspect", function() show("inspect"));
    on("nav-history", function() show("history"));
    on("read-try", function() {
      show("editor");
      NailEditor.focus();
    });
    on("run-button", run);
    on("stop-button", stop);
    on("inspect-refresh", inspect);
    on("tab-expand", function() inspectTab("expand"));
    on("tab-types", function() inspectTab("types"));
    inspectTab("expand");
    show("read");
  }
}
