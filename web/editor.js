import {basicSetup, EditorView} from "codemirror";
import {StreamLanguage, HighlightStyle, syntaxHighlighting} from "@codemirror/language";
import {tags} from "@lezer/highlight";
import {StateEffect, StateField} from "@codemirror/state";
import {Decoration} from "@codemirror/view";

const nail = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/#[^\n]*/)) return "comment";
    if (stream.match(/"(?:[^"\\]|\\.)*"/)) return "string";
    if (stream.match(/\b(?:def|type|match|with|if|then|else|import|from|use|export|nail)\b/)) return "keyword";
    if (stream.match(/\b(?:true|false|[0-9]+(?:\.[0-9]+)?)\b/)) return "number";
    if (stream.match(/[A-Z][\w]*/)) return "type";
    if (stream.match(/[A-Za-z_][\w]*/)) return "variable";
    stream.next();
    return null;
  }
});
// One coherent, high-contrast and low-saturation palette for CodeMirror.
const nailStyle = HighlightStyle.define([
  {tag:tags.keyword, color:"#f5b3c6", fontWeight:"700"},
  {tag:tags.typeName, color:"#b3dcf8", fontWeight:"700"},
  {tag:tags.string, color:"#b4e5d0"},
  {tag:tags.number, color:"#f3c995"},
  {tag:tags.bool, color:"#f3c995"},
  {tag:tags.comment, color:"#a7bbce", fontStyle:"italic"},
  {tag:tags.variableName, color:"#f2f3fa"}
]);

// Presentation-only syntax colour for text outside CodeMirror.
// Tokens are always appended as DOM text nodes; no HTML is generated from Nail.
const tokenRx = /#[^\n]*|"(?:[^"\\]|\\.)*"|\b(?:def|type|match|with|if|then|else|import|from|use|export|nail)\b|\b(?:true|false|\d+(?:\.\d+)?)\b|\b[A-Z][A-Za-z0-9_]*\b/g;
function highlightOutsideEditor(element) {
  if (!element) return;
  const raw = element.textContent;
  const fragment = document.createDocumentFragment();
  let index = 0;
  for (const match of raw.matchAll(tokenRx)) {
    if (match.index > index) fragment.appendChild(document.createTextNode(raw.slice(index,match.index)));
    const value = match[0];
    const type = value[0] === "#" ? "comment"
      : value[0] === '"' ? "string"
      : /^(?:\d|true$|false$)/.test(value) ? "number"
      : /^[A-Z]/.test(value) ? "type" : "keyword";
    const span = document.createElement("span");
    span.className = "nail-token-" + type;
    span.textContent = value;
    fragment.appendChild(span);
    index = match.index + value.length;
  }
  fragment.appendChild(document.createTextNode(raw.slice(index)));
  element.replaceChildren(fragment);
}

// Diagnostics are original-source ranges, never offsets guessed from messages.
const setDiagnostic = StateEffect.define();
const diagnostics = StateField.define({
  create: () => Decoration.none,
  update(value, transaction) {
    // Clear on edits in the same update transaction. Never dispatch from an
    // updateListener, which would cause a re-entrant CodeMirror update.
    let mapped = transaction.docChanged ? Decoration.none : value.map(transaction.changes);
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
  "&": { height: "100%", backgroundColor: "#15182f", color: "#faf2ff" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "15px", lineHeight: "1.65" },
  ".cm-gutters": { backgroundColor: "#15182f", color: "#9692bb", border: "none" },
  ".cm-content": { caretColor: "#d7fa78", padding: "14px 0" },
  ".cm-activeLine": { backgroundColor: "#2b2850" },
  ".cm-selectionBackground": { backgroundColor: "#514f8b !important" },
  ".cm-nail-diagnostic-token": {
    backgroundColor: "rgba(255,135,168,.21)",
    textDecoration: "underline wavy #ff9ab8",
    textUnderlineOffset: "3px"
  },
  ".cm-nail-diagnostic-form": {
    backgroundColor: "rgba(255,197,104,.16)",
    textDecoration: "underline dotted #ffd785",
    textUnderlineOffset: "3px"
  },
  ".cm-nail-diagnostic-line": {
    backgroundColor: "rgba(255,135,168,.19)"
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
        syntaxHighlighting(nailStyle),
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
  highlightExamples() {
    document.querySelectorAll("pre.example code, code[data-nail-highlight]").forEach(highlightOutsideEditor);
  },
  highlightBlock(id) {
    highlightOutsideEditor(document.getElementById(id));
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
