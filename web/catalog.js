/* Presentation-only catalog. Nail source is interpreted ONLY by the official
   release selected in Main.hx, never parsed or evaluated by this module. */
(() => {
  let examples = null;
  let onLoad = null;
  let activeVersion = "0.61";
  const $ = id => document.getElementById(id);
  const normalize = text => String(text).normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it");
  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function selectOptions(select, values, first) {
    select.replaceChildren();
    for (const [value,label] of [[ "all", first ], ...values.map(v => [v,v])]) {
      const option=element("option",null,label);
      option.value=value;
      select.appendChild(option);
    }
  }
  function render() {
    if (!examples) return;
    const needle = normalize($("catalog-search").value.trim());
    const version = $("catalog-version").value;
    const category = $("catalog-category").value;
    const matches = examples.filter(item =>
      (version === "all" || item.version === version) &&
      (category === "all" || item.category === category) &&
      normalize([item.title,item.summary,item.category,item.source].join(" ")).includes(needle)
    );
    const container = $("catalog-list");
    container.replaceChildren();
    $("catalog-count").textContent = matches.length + " esempi su " + examples.length;
    if (matches.length === 0) {
      container.appendChild(element("p","catalog-empty","Nessun esempio trovato. Prova un'altra ricerca o versione."));
      return;
    }
    for (const item of matches) {
      const card = element("article","catalog-card");
      const row = element("div","catalog-card-top");
      const categoryLabel = element("span","catalog-category-label",item.category);
      const badge = element("span","catalog-version-label","v" + item.version +
        (item.version === activeVersion ? " · attiva" : ""));
      row.append(categoryLabel,badge);
      const title = element("h3",null,item.title);
      const summary = element("p","catalog-summary",item.summary);
      const code = element("code",null,item.source);
      code.id="catalog-source-" + item.id;
      const preview = element("pre","catalog-source");
      preview.appendChild(code);
      const foot = element("div","catalog-card-foot");
      const note=element("span","catalog-expect",item.expect?.kind === "error"
        ? "Errore intenzionale" : "Esempio verificato");
      if (item.expect?.kind === "error") note.classList.add("catalog-expected-error");
      const action=element("button","catalog-load","Apri nell'editor");
      action.type="button";
      action.dataset.exampleId=item.id;
      foot.append(note,action);
      card.append(row,title,summary,preview,foot);
      container.appendChild(card);
      try { window.NailEditor?.highlightBlock?.(code.id); } catch (_) {}
    }
  }
  function start() {
    $("catalog-open").addEventListener("click", async () => {
      const dialog = $("catalog-dialog");
      if (!dialog.open) dialog.showModal();
      $("catalog-search").focus();
      if (examples) { render(); return; }
      $("catalog-count").textContent="Caricamento esempi…";
      try {
        const response=await fetch("./examples.json");
        if (!response.ok) throw new Error("HTTP " + response.status);
        const catalog=await response.json();
        if (catalog.schema !== 1 || !Array.isArray(catalog.examples)) throw new Error("Catalogo non valido");
        examples=catalog.examples;
        const versions=[...new Set(examples.map(x=>x.version))].sort((a,b)=>Number(b)-Number(a));
        const categories=[...new Set(examples.map(x=>x.category))].sort((a,b)=>a.localeCompare(b,"it"));
        selectOptions($("catalog-version"),versions,"Tutte le versioni");
        selectOptions($("catalog-category"),categories,"Tutti gli argomenti");
        render();
      } catch (error) {
        $("catalog-count").textContent="Catalogo non disponibile: " + String(error);
      }
    });
    $("catalog-close").addEventListener("click",()=>$("catalog-dialog").close());
    $("catalog-search").addEventListener("input",render);
    $("catalog-version").addEventListener("change",render);
    $("catalog-category").addEventListener("change",render);
    $("catalog-list").addEventListener("click",event=>{
      const button=event.target.closest("button[data-example-id]");
      if (!button || !examples || !onLoad) return;
      const item=examples.find(e=>e.id === button.dataset.exampleId);
      if (!item) return;
      if (onLoad(item.version,item.source,item.title)) $("catalog-dialog").close();
    });
  }
  window.NailCatalog={
    mount(callback) { onLoad=callback; start(); },
    setVersion(value) { activeVersion=value; if (examples && $("catalog-dialog").open) render(); }
  };
})();
