  // ---------- Módulos novos (plugins) ----------
  // Cada funcionalidade nova é um arquivo em /modulos/<id>.js registrado em api/_modules.js.
  // O arquivo chama QZ.modulo({ id, iniciar(ctx), aoMostrar(ctx) }) e recebe uma aba própria.
  const QZ_defs = {}, QZ_ctx = {}, QZ_meta = {};
  let QZ_banco = null;
  function QZ_contexto(id){
    if (QZ_ctx[id]) return QZ_ctx[id];
    const el = document.getElementById("tab-" + id);
    return QZ_ctx[id] = {
      id, el, nome: QZ_meta[id]?.nome || id,
      get db(){ return QZ_banco; },
      get me(){ return ME; },
      dados: nome => QZ_banco.collection(`m/${id}/${nome}`),   // espaço de dados exclusivo do módulo
      clientes: () => clients.slice(),                         // carteira do mês selecionado
      mes: () => cur,
      equipe: () => ({ atendimentos: people("atendimentos","atendimento"), socials: people("socials","social") }),
      onboardings: () => obs.slice(),
      irPara: tab => { const b = document.querySelector(`nav.tabs button[data-tab="${tab}"]`); if (b && !b.hidden) b.click(); },
      toast, esc, br, brl: v => (Number(v)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),
      hoje: todayIso, diasUteis: bdCount, somarDiasUteis: addBD,
    };
  }
  function QZ_iniciar(id){
    const d = QZ_defs[id]; if (!d || !QZ_banco || d._ok) return;
    d._ok = true;
    try { d.iniciar && d.iniciar(QZ_contexto(id)); } catch(e) { console.error(e); QZ_contexto(id).el.innerHTML = `<div class="note warn">Não deu para abrir “${esc(QZ_contexto(id).nome)}”. Recarregue a página.</div>`; }
  }
  function QZ_db(db){ QZ_banco = db; Object.keys(QZ_defs).forEach(QZ_iniciar); }
  window.QZ = { modulo(def){ if (!def || !def.id) return; QZ_defs[def.id] = def; QZ_iniciar(def.id); } };
  function QZ_montar(m){
    if (document.getElementById("tab-" + m.id)) return;
    QZ_meta[m.id] = m;
    const sec = document.createElement("section"); sec.id = "tab-" + m.id; sec.hidden = true; sec.dataset.modulo = m.id;
    sec.innerHTML = `<p class="muted">Carregando ${esc(m.nome)}…</p>`;
    document.querySelector("main.wrap").appendChild(sec);
    const nav = document.querySelector("nav.tabs");
    const b = document.createElement("button"); b.setAttribute("role","tab"); b.dataset.tab = m.id; b.setAttribute("aria-selected","false"); b.textContent = m.nome;
    const ref = [...nav.querySelectorAll("button")].find(x => x.dataset.tab === "users");
    nav.insertBefore(b, ref || null);
    b.addEventListener("click", () => {
      nav.querySelectorAll("button").forEach(x => x.setAttribute("aria-selected", x === b));
      showSections(m.id);
      const d = QZ_defs[m.id]; if (d && d.aoMostrar && d._ok) { try { d.aoMostrar(QZ_contexto(m.id)); } catch(e) { console.error(e); } }
    });
    loadScript(m.arquivo + (m.arquivo.includes("?") ? "" : "?v=" + Date.now().toString(36).slice(0,-3))).catch(() => { sec.innerHTML = `<div class="note warn">Não deu para carregar “${esc(m.nome)}”. Recarregue a página.</div>`; });
  }


