import {basicSetup, EditorView} from "codemirror";
import {StreamLanguage} from "@codemirror/language";
import {StateEffect, StateField} from "@codemirror/state";
import {Decoration} from "@codemirror/view";

const nail = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/#[^\n]*/)) return "comment";
    if (stream.match(/"(?:[^"\\]|\\.)*"/)) return "string";
    if (stream.match(/\b(?:def|type|match|with|if|then|else|import|from|use|export|nail)\b/)) return "keyword";
    if (stream.match(/\b(?:true|false|[0-9]+(?:\.[0-9]+)?)\b/)) return "number";
    if (stream.match(/[A-Za-z_][\w]*/)) return "variable";
    stream.next();
    return null;
  }
});
// Diagnostics are original-source ranges, never offsets guessed from messages.
const setDiagnostic = StateEffect.define();
const diagnostics = StateField.define({
  create: () => Decoration.none,
  update(value, transaction) {
    let mapped = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setDiagnostic)) continue;
      const location = effect.value;
      if (!location) return Decoration.none;
      const {from, to, kind} = location;
      if (to > from) {
        return Decoration.set([
          Decoration.mark({class: kind === "type"
            ? "cm-nail-diagnostic-form" : "cm-nail-diagnostic-token"}).range(from, to)
        ]);
      }
      const atLine = transaction.state.doc.lineAt(from).from;
      return Decoration.set([
        Decoration.line({class: "cm-nail-diagnostic-line"}).range(atLine)
      ]);
    }
    return mapped;
  },
  provide: field => EditorView.decorations.from(field)
});
const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "#101b2c", color: "#edf3fa" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "15px", lineHeight: "1.65" },
  ".cm-gutters": { backgroundColor: "#101b2c", color: "#8194ac", border: "none" },
  ".cm-content": { caretColor: "#a9d4ff", padding: "14px 0" },
  ".cm-activeLine": { backgroundColor: "#1b2c43" },
  ".cm-selectionBackground": { backgroundColor: "#365b85 !important" },
  ".cm-nail-diagnostic-token": {
    backgroundColor: "rgba(230,75,97,.22)",
    textDecoration: "underline wavy #ff879c",
    textUnderlineOffset: "3px"
  },
  ".cm-nail-diagnostic-form": {
    backgroundColor: "rgba(239,172,66,.17)",
    textDecoration: "underline dotted #e6a74d",
    textUnderlineOffset: "3px"
  },
  ".cm-nail-diagnostic-line": {
    backgroundColor: "rgba(230,75,97,.18)"
  }
}, {dark: true});

let editor;
window.NailEditor = {
  mount(elementId, initial, onChange) {
    editor = new EditorView({
      doc: initial,
      extensions: [
        basicSetup,
        nail,
        diagnostics,
        EditorView.lineWrapping,
        theme,
        EditorView.updateListener.of(update => {
          if (update.docChanged) onChange(update.state.doc.toString());
        })
      ],
      parent: document.getElementById(elementId)
    });
  },
  getValue() { return editor.state.doc.toString(); },
  setValue(value) {
    editor.dispatch({changes: {from: 0, to: editor.state.doc.length, insert: value}});
  },
  focus() { editor.focus(); },
  clearDiagnostic() {
    if (editor) editor.dispatch({effects: setDiagnostic.of(null)});
  },
  markDiagnostic(span, kind) {
    if (!editor || !span) return false;
    const {start, end} = span;
    if (!Number.isInteger(start) || !Number.isInteger(end) ||
        start < 0 || end < start || end > editor.state.doc.length) return false;
    editor.dispatch({effects: setDiagnostic.of({from:start, to:end, kind})});
    return true;
  },
  goTo(line, column) {
    if (!editor || !Number.isInteger(line) || line < 1 || line > editor.state.doc.lines)
      return false;
    const info = editor.state.doc.line(line);
    const pos = info.from + Math.min(Math.max(0, column - 1), info.length);
    editor.dispatch({
      selection: {anchor: pos},
      effects: EditorView.scrollIntoView(pos, {y: "center"})
    });
    editor.focus();
    return true;
  }
};
