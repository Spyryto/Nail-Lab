import {basicSetup, EditorView} from "codemirror";
import {EditorState} from "@codemirror/state";
import {StreamLanguage} from "@codemirror/language";

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
const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "#101b2c", color: "#edf3fa" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "15px", lineHeight: "1.65" },
  ".cm-gutters": { backgroundColor: "#101b2c", color: "#8194ac", border: "none" },
  ".cm-content": { caretColor: "#a9d4ff", padding: "14px 0" },
  ".cm-activeLine": { backgroundColor: "#1b2c43" },
  ".cm-selectionBackground": { backgroundColor: "#365b85 !important" }
}, {dark: true});

let editor;
window.NailEditor = {
  mount(elementId, initial, onChange) {
    editor = new EditorView({
      state: EditorState.create({
        doc: initial,
        extensions: [
          basicSetup,
          nail,
          EditorView.lineWrapping,
          theme,
          EditorView.updateListener.of(update => {
            if (update.docChanged) onChange(update.state.doc.toString());
          })
        ]
      }),
      parent: document.getElementById(elementId)
    });
  },
  getValue() { return editor.state.doc.toString(); },
  setValue(value) {
    editor.dispatch({changes: {from: 0, to: editor.state.doc.length, insert: value}});
  },
  focus() { editor.focus(); }
};
