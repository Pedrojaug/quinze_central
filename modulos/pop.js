// 03 Administrativo > POP operacional (instrução 09).
// Mestre: edita (rascunho), publica, vê histórico, restaura e usa "Ajudar com o Claude". Gestão: lê os publicados.
// Tudo pela rota /api/m?r=pop/... (o servidor confere o perfil em cada ação).
(function () {
  if (window.__qzPop) return; window.__qzPop = true;

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dataBr = iso => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "");
  const dataHora = iso => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  async function api(r, body) {
    const res = await fetch("/api/m?r=pop/" + r, { method: body ? "POST" : "GET", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j.msg || (res.status === 403 ? "Sem permissão." : "Não deu para concluir. Tente de novo.")), { code: j.code, status: res.status });
    return j;
  }
  // Texto com formatação simples: **negrito**, links e marcas [CONFIRMAR] / [CONTEÚDO NÃO VEIO NA EXPORTAÇÃO].
  const fmt = t => esc(t)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\[(CONFIRMAR[^\]]*|CONTEÚDO NÃO VEIO NA EXPORTAÇÃO)\]/g, '<mark class="po-mk">[$1]</mark>')
    .replace(/\n/g, "<br>");
  window.QZ_POP_RENDER = function render(c, aviso) {
    const ativ = (c.atividades || []).map(a => `<section class="po-at"><h4>${esc(a.nome)}</h4>${a.quando ? `<p class="po-q"><b>Quando:</b> ${fmt(a.quando)}</p>` : ""}
      <ul class="po-ps">${(a.passos || []).map(p => `<li class="n${p.n}">${fmt(p.t)}</li>`).join("")}</ul>
      ${a.ferramentas ? `<p class="po-q"><b>Ferramentas:</b> ${fmt(a.ferramentas)}</p>` : ""}${a.pronto ? `<p class="po-q"><b>Pronto quando:</b> ${fmt(a.pronto)}</p>` : ""}${a.duvidas ? `<p class="po-q"><b>Dúvidas:</b> ${fmt(a.duvidas)}</p>` : ""}</section>`).join("");
    const plat = c.plataformas && c.plataformas.length ? `<table class="po-tbl"><thead><tr><th>Plataforma</th><th>Para que serve</th><th>Link</th></tr></thead><tbody>${c.plataformas.map(x => `<tr><td>${fmt(x.nome)}</td><td>${fmt(x.funcao)}</td><td>${fmt(x.link)}</td></tr>`).join("")}</tbody></table>` : "";
    return `${aviso ? `<p class="po-aviso">Partes marcadas <mark class="po-mk">[CONTEÚDO NÃO VEIO NA EXPORTAÇÃO]</mark> se perderam na exportação do ClickUp e precisam ser completadas.</p>` : ""}
      <h3 class="po-tit">${esc(c.titulo)}</h3>${c.introducao ? `<p>${fmt(c.introducao)}</p>` : ""}
      ${c.links && c.links.length ? `<p><b>${esc(c.linksTitulo || "Links")}:</b></p><ul>${c.links.map(l => `<li>${esc(l.rotulo)}: ${fmt(l.url)}</li>`).join("")}</ul>` : ""}
      ${plat}${ativ ? `<p><b>Atividades e tarefas:</b></p>${ativ}` : ""}`;
  };

  if (!document.getElementById("qzPopCss")) {
    const st = document.createElement("style"); st.id = "qzPopCss";
    st.textContent = `
      .po-h{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px}.po-h h2{margin:0}.po-h .sp{flex:1}
      .po-sub{font-size:12.5px;color:var(--ink2)}
      .po-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
      .po-chip{border:1px solid var(--line);background:var(--card);border-radius:10px;padding:8px 12px;cursor:pointer;text-align:left;font:inherit}
      .po-chip[aria-pressed="true"]{border-color:var(--blue);box-shadow:0 0 0 2px var(--blue-soft)}
      .po-chip b{display:block;font-size:14px}.po-chip span{font-size:12px;color:var(--ink2)}
      .po-tag{font-size:11.5px;padding:1px 8px;border-radius:20px;font-weight:600}.po-tag.pub{background:#E6F6EC;color:#1B6B3A}.po-tag.ras{background:#F1ECFB;color:#55308F}.po-tag.nada{background:#EEF1F6;color:#56627A}
      .po-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin-bottom:12px}
      .po-ler{line-height:1.6;font-size:15px}.po-ler .po-tit{margin:0 0 8px}
      .po-at{border-top:1px solid var(--line2);padding-top:8px;margin-top:10px}.po-at h4{margin:0 0 4px;font-size:15.5px}
      .po-ps{margin:4px 0 6px;padding-left:20px}.po-ps li.n1{margin-left:22px;list-style:circle}.po-q{margin:3px 0;font-size:14px}
      .po-mk{background:#FFF1C2;color:#6B4E00;border-radius:4px;padding:0 3px}
      .po-aviso{font-size:13px;color:var(--ink2);background:#FAFBFD;border:1px dashed var(--line);border-radius:8px;padding:6px 10px}
      .po-tbl{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0}.po-tbl th,.po-tbl td{border-bottom:1px solid var(--line2);padding:6px;text-align:left;vertical-align:top}
      .po-ed{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:14px;align-items:start}
      @media(max-width:1100px){.po-ed{grid-template-columns:1fr}}
      .po-f{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--ink2);margin-bottom:8px}
      .po-f input,.po-f textarea{font:inherit;font-size:14px;color:var(--ink)}
      .po-atv{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:10px;background:#FCFDFE}
      .po-atv.foco{border-color:var(--blue);box-shadow:0 0 0 2px var(--blue-soft)}
      .po-atv .cab{display:flex;gap:6px;align-items:center}
      .po-atv .cab input{flex:1;font-weight:600}
      .po-pa{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:6px;align-items:start;margin:4px 0}
      .po-pa.n1{margin-left:26px}
      .po-pa textarea{min-height:34px;resize:vertical;font:inherit;font-size:14px}
      .po-mini{padding:2px 7px !important;min-height:0 !important;font-size:12px !important}
      .po-g3{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:6px}
      .po-ia{position:sticky;top:10px;border-color:#C9B8F0}
      .po-ia h3{margin:0 0 6px;font-size:15px;display:flex;gap:6px;align-items:center}
      .po-ia .ats{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
      .po-ia .ats button{font-size:12.5px;padding:4px 9px;min-height:0}
      .po-foco{font-size:12.5px;background:#F6F3FD;border-radius:8px;padding:6px 9px;color:#4A3580}
      .po-dif{font-size:13.5px;line-height:1.55;max-height:46vh;overflow:auto;border:1px solid var(--line2);border-radius:8px;padding:8px 10px;background:#fff;white-space:pre-wrap}
      .po-dif ins{background:#DDF4E4;color:#14532D;text-decoration:none}.po-dif del{background:#FDE2E2;color:#8A1C1C}
      .po-alerta{font-size:12.5px;background:#FFF4DE;color:#8A5A00;border-radius:8px;padding:6px 9px;margin:6px 0}
      .po-hist td,.po-hist th{font-size:13px}
      .po-sujo{color:#8A5A00;font-size:12.5px}`;
    document.head.appendChild(st);
  }

  // Diferenças palavra a palavra (LCS), para mostrar a proposta do Claude ao lado do texto atual.
  function diff(a, b) {
    const ta = a.split(/(\s+)/), tb = b.split(/(\s+)/);
    if (ta.length * tb.length > 4e6) return `<del>${esc(a)}</del>\n<ins>${esc(b)}</ins>`;
    const n = ta.length, m = tb.length, L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = ta[i] === tb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0, out = "";
    while (i < n && j < m) {
      if (ta[i] === tb[j]) { out += esc(ta[i]); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) out += `<del>${esc(ta[i++])}</del>`; else out += `<ins>${esc(tb[j++])}</ins>`;
    }
    while (i < n) out += `<del>${esc(ta[i++])}</del>`; while (j < m) out += `<ins>${esc(tb[j++])}</ins>`;
    return out;
  }
  const textoAtividade = a => [`Atividade: ${a.nome}`, a.quando && `Quando: ${a.quando}`, ...(a.passos || []).map(p => (p.n ? "    – " : "  • ") + p.t),
    a.ferramentas && `Ferramentas: ${a.ferramentas}`, a.pronto && `Pronto quando: ${a.pronto}`, a.duvidas && `Dúvidas: ${a.duvidas}`].filter(Boolean).join("\n");
  const textoPop = c => [`Título: ${c.titulo}`, `Introdução: ${c.introducao}`, ...(c.links || []).map(l => `Link: ${l.rotulo} — ${l.url}`), ...(c.atividades || []).map(textoAtividade),
    ...(c.plataformas || []).map(x => `Plataforma: ${x.nome} — ${x.funcao} — ${x.link}`)].join("\n\n");

  function pop(ctx) {
    const el = ctx.el;
    let lista = null, mestre = false, atual = null, dados = null, ed = null, sujo = false, foco = { caminho: null, ini: 0, fim: 0 }, proposta = null, modo = "editar";
    const $ = s => el.querySelector(s);

    async function carregar() {
      if (sujo) return;   // voltar à aba não descarta o que está sendo editado
      try { const r = await api("lista"); lista = r.pops; mestre = r.mestre; } catch (e) { el.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      if (!atual) atual = lista[0].funcao;
      await abrir(atual, true);
    }
    async function abrir(funcao, manter) {
      if (sujo && !manter && funcao !== atual) { ctx.toast("Salve ou descarte as alterações antes de trocar de POP."); return; }
      atual = funcao; proposta = null; modo = "editar";
      try { dados = await api("ver&funcao=" + funcao); } catch (e) { el.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      if (mestre) { const base = dados.rascunho || dados.publicada; ed = base ? JSON.parse(JSON.stringify(base.conteudo)) : { titulo: "POP — " + itemAtual().rotulo, introducao: "", links: [], atividades: [] }; sujo = false; }
      tela();
    }
    const itemAtual = () => lista.find(p => p.funcao === atual);
    function chips() {
      return `<div class="po-chips">${lista.map(p => `<button class="po-chip" type="button" data-pop="${p.funcao}" aria-pressed="${p.funcao === atual}"><b>${esc(p.rotulo)}</b>
        <span>${p.publicada ? `<span class="po-tag pub">publicado v${p.publicada.numero}</span>` : `<span class="po-tag nada">não publicado</span>`}
        ${mestre && p.rascunho ? ` <span class="po-tag ras">rascunho v${p.rascunho.numero}</span>` : ""}</span></button>`).join("")}</div>`;
    }
    function tela() {
      const it = itemAtual();
      const cab = `<div class="po-h"><div><h2>POP operacional</h2><div class="po-sub">${mestre ? "Só o Mestre edita e publica. Quem não é Mestre vê apenas a versão publicada (em \"Meu POP\")." : "Versões publicadas. A edição é do Mestre."}</div></div><span class="sp"></span>
        <a class="btn" href="/pop" target="_blank" rel="noopener">Abrir Meu POP</a></div>${chips()}`;
      if (!mestre) {
        const v = dados.publicada;
        el.innerHTML = cab + `<div class="po-card po-ler">${v ? `<p class="po-sub">Versão ${v.numero}, publicada em ${dataBr(v.publicadoEm)}</p>` + window.QZ_POP_RENDER(v.conteudo, v.avisoExportacao) : `<p class="po-sub">Este POP ainda não foi publicado.</p>`}</div>`;
        return;
      }
      if (modo === "historico" || modo === "versao") { el.innerHTML = cab + `<div data-box="hist"></div>`; return historicoTela(); }
      const r = dados.rascunho, pb = dados.publicada;
      el.innerHTML = cab + `<div class="po-card" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <span><b>${esc(it.rotulo)}</b> · ${r ? `editando o <span class="po-tag ras">rascunho v${r.numero}</span>${r.restauradoDe ? ` (restaurado da v${r.restauradoDe})` : ""}` : pb ? `a partir da <span class="po-tag pub">v${pb.numero} publicada</span> (salvar cria um rascunho)` : "novo"}</span>
          <span class="po-sujo" data-box="sujo">${sujo ? "Alterações não salvas" : ""}</span><span style="flex:1"></span>
          <button class="btn" type="button" data-x="rotulo" title="Mudar o nome da função">Rótulo</button>
          <button class="btn" type="button" data-x="historico">Histórico</button>
          ${r ? `<button class="btn" type="button" data-x="descartar">Descartar rascunho</button>` : ""}
          <button class="btn" type="button" data-x="salvar">Salvar rascunho</button>
          <button class="btn primary" type="button" data-x="publicar"${r ? "" : " disabled title=\"Salve o rascunho antes de publicar\""}>Publicar</button></div>
        ${r && r.resumoMudanca ? `<p class="po-sub" style="margin:-4px 0 10px">Resumo da mudança: ${esc(r.resumoMudanca)}</p>` : ""}
        <div class="po-ed"><div class="po-card" data-box="editor">${editor()}</div>${painelIA()}</div>`;
    }
    // ---------- Editor ----------
    const campo = (rot, cam, val, area, extra = "") => `<label class="po-f">${rot}${area ? `<textarea data-c="${cam}" rows="${area}"${extra}>${esc(val)}</textarea>` : `<input data-c="${cam}" value="${esc(val)}"${extra}>`}</label>`;
    function editor() {
      const c = ed;
      const fA = foco.caminho && /^a\.(\d+)/.exec(foco.caminho);
      return `${campo("Título", "titulo", c.titulo)}${campo("Introdução", "introducao", c.introducao, 4)}
        <div class="po-f">Links relacionados${(c.links || []).map((l, i) => `<div style="display:grid;grid-template-columns:1fr 2fr auto;gap:6px;margin-top:4px"><input data-c="l.${i}.rotulo" value="${esc(l.rotulo)}" placeholder="Rótulo"><input data-c="l.${i}.url" value="${esc(l.url)}" placeholder="https://"><button class="btn po-mini" type="button" data-x="l-del" data-i="${i}">✕</button></div>`).join("")}
          <div><button class="btn po-mini" type="button" data-x="l-add" style="margin-top:4px">+ link</button></div></div>
        ${c.plataformas ? `<div class="po-f">Plataformas${c.plataformas.map((x, i) => `<div style="display:grid;grid-template-columns:1fr 1.4fr 1.2fr auto;gap:6px;margin-top:4px"><input data-c="pl.${i}.nome" value="${esc(x.nome)}" placeholder="Plataforma"><input data-c="pl.${i}.funcao" value="${esc(x.funcao)}" placeholder="Para que serve"><input data-c="pl.${i}.link" value="${esc(x.link)}" placeholder="Link"><button class="btn po-mini" type="button" data-x="pl-del" data-i="${i}">✕</button></div>`).join("")}
          <div><button class="btn po-mini" type="button" data-x="pl-add" style="margin-top:4px">+ plataforma</button></div></div>` : ""}
        <div class="po-sub" style="margin:10px 0 6px"><b>Atividades e tarefas</b> · clique numa atividade para o Claude trabalhar nela; selecione um texto para "melhorar"</div>
        ${(c.atividades || []).map((a, i) => `<div class="po-atv${fA && +fA[1] === i ? " foco" : ""}" data-ai="${i}">
          <div class="cab"><input data-c="a.${i}.nome" value="${esc(a.nome)}" placeholder="Nome da atividade"><button class="btn po-mini" type="button" data-x="a-up" data-i="${i}" title="Subir">↑</button><button class="btn po-mini" type="button" data-x="a-down" data-i="${i}" title="Descer">↓</button><button class="btn po-mini" type="button" data-x="a-del" data-i="${i}" title="Remover atividade">✕</button></div>
          ${campo("Quando acontece", `a.${i}.quando`, a.quando || "")}
          <div class="po-sub">Tarefas / passos</div>
          ${(a.passos || []).map((p, k) => `<div class="po-pa n${p.n}"><button class="btn po-mini" type="button" data-x="p-n" data-i="${i}" data-k="${k}" title="${p.n ? "Voltar ao nível principal" : "Transformar em subitem"}">${p.n ? "⇤" : "⇥"}</button>
            <textarea data-c="a.${i}.p.${k}" rows="${Math.min(6, Math.max(1, Math.ceil(p.t.length / 90)))}">${esc(p.t)}</textarea>
            <span style="display:flex;gap:3px"><button class="btn po-mini" type="button" data-x="p-up" data-i="${i}" data-k="${k}">↑</button><button class="btn po-mini" type="button" data-x="p-down" data-i="${i}" data-k="${k}">↓</button><button class="btn po-mini" type="button" data-x="p-del" data-i="${i}" data-k="${k}">✕</button></span></div>`).join("")}
          <button class="btn po-mini" type="button" data-x="p-add" data-i="${i}">+ passo</button>
          <div class="po-g3">${campo("Ferramentas", `a.${i}.ferramentas`, a.ferramentas || "")}${campo("Critério de pronto", `a.${i}.pronto`, a.pronto || "")}${campo("Quem acionar em caso de dúvida", `a.${i}.duvidas`, a.duvidas || "")}</div></div>`).join("")}
        <button class="btn" type="button" data-x="a-add">+ atividade</button>
        <div class="po-f" style="margin-top:12px">Resumo da mudança (opcional, vai para o histórico)<input data-resumo value="${esc(dados.rascunho?.resumoMudanca || "")}"></div>`;
    }
    const ler = cam => { const k = cam.split("."); if (k[0] === "titulo" || k[0] === "introducao") return ed[k[0]];
      if (k[0] === "l") return ed.links[+k[1]][k[2]]; if (k[0] === "pl") return ed.plataformas[+k[1]][k[2]];
      if (k[0] === "a") return k[2] === "p" ? ed.atividades[+k[1]].passos[+k[3]].t : ed.atividades[+k[1]][k[2]]; };
    const escrever = (cam, v) => { const k = cam.split("."); if (k[0] === "titulo" || k[0] === "introducao") ed[k[0]] = v;
      else if (k[0] === "l") ed.links[+k[1]][k[2]] = v; else if (k[0] === "pl") ed.plataformas[+k[1]][k[2]] = v;
      else if (k[0] === "a") { if (k[2] === "p") ed.atividades[+k[1]].passos[+k[3]].t = v; else ed.atividades[+k[1]][k[2]] = v; } };
    const marcarSujo = () => { sujo = true; const s = $('[data-box="sujo"]'); if (s) s.textContent = "Alterações não salvas"; };
    const redesenhar = () => { $('[data-box="editor"]').innerHTML = editor(); marcarSujo(); atualizarFoco(); };

    // ---------- Painel do Claude ----------
    function painelIA() {
      return `<div class="po-card po-ia" data-box="ia"><h3>✦ Ajudar com o Claude</h3>
        <div class="po-foco" data-box="foco">${textoFoco()}</div>
        <div class="ats">
          <button class="btn" type="button" data-ia="melhorar">Melhorar o texto selecionado</button><button class="btn" type="button" data-ia="completar">Completar este passo</button>
          <button class="btn" type="button" data-ia="checklist">Transformar em checklist</button><button class="btn" type="button" data-ia="revisar">Revisar clareza e consistência</button>
          <button class="btn" type="button" data-ia="sugerir">Sugerir tarefas que faltam</button><button class="btn" type="button" data-ia="adaptar">Adaptar à Central Quinze</button></div>
        <textarea data-ia-pedido rows="3" style="width:100%" placeholder="Ou peça o que quiser (ex.: escreva o passo a passo da checagem dos grupos com horários a confirmar)"></textarea>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px"><button class="btn primary" type="button" data-ia="livre">Pedir</button><span class="po-sub" data-box="iamsg"></span></div>
        <p class="po-sub" style="margin:8px 0 0">A resposta nunca é gravada sozinha: você vê a proposta com as diferenças e decide. Aplicar só muda o rascunho em edição.</p>
        <div data-box="proposta"></div></div>`;
    }
    function textoFoco() {
      if (!foco.caminho) return "Foco: o POP inteiro. Clique numa atividade ou selecione um trecho para focar.";
      const k = foco.caminho.split(".");
      const sel = foco.fim > foco.ini ? "trecho selecionado" : "campo";
      if (k[0] === "a") return `Foco: atividade ${+k[1] + 1} (${esc(ed.atividades[+k[1]]?.nome || "")})${k[2] === "p" ? `, passo ${+k[3] + 1}` : ""} · ${sel}`;
      return `Foco: ${({ titulo: "título", introducao: "introdução", l: "links", pl: "plataformas" })[k[0]] || k[0]} · ${sel}`;
    }
    function atualizarFoco() {
      const f = $('[data-box="foco"]'); if (f) f.innerHTML = textoFoco();
      el.querySelectorAll(".po-atv").forEach(x => x.classList.toggle("foco", !!foco.caminho && foco.caminho.startsWith("a." + x.dataset.ai + ".")));
    }
    async function pedirIA(atalho) {
      const msg = $('[data-box="iamsg"]');
      const k = foco.caminho ? foco.caminho.split(".") : [];
      const atividade = k[0] === "a" ? +k[1] : null;
      let selecao = null;
      if (foco.caminho && (foco.fim > foco.ini || atalho === "completar" || atalho === "melhorar")) {
        const v = ler(foco.caminho) || "";
        selecao = { caminho: foco.caminho, texto: foco.fim > foco.ini ? v.slice(foco.ini, foco.fim) : v };
      }
      if (["checklist", "sugerir"].includes(atalho)) selecao = null;
      if (["melhorar", "completar"].includes(atalho) && !selecao) { msg.textContent = "Selecione um trecho ou clique no passo primeiro."; return; }
      if (["checklist", "sugerir"].includes(atalho) && atividade === null) { msg.textContent = "Clique numa atividade primeiro."; return; }
      const pedido = $("[data-ia-pedido]").value;
      if (atalho === "livre" && !pedido.trim()) { msg.textContent = "Escreva o pedido."; return; }
      msg.textContent = "O Claude está pensando…";
      el.querySelectorAll("[data-ia]").forEach(b => { b.disabled = true; });
      try {
        const r = await api("ia", { funcao: atual, conteudo: ed, selecao, atividade, atalho, pedido: atalho === "livre" ? pedido : "" });
        proposta = { ...r, sel: selecao ? { ...foco } : null };
        msg.textContent = ""; mostrarProposta();
      } catch (e) { msg.textContent = e.message; }
      finally { el.querySelectorAll("[data-ia]").forEach(b => { b.disabled = false; }); }
    }
    function mostrarProposta() {
      const box = $('[data-box="proposta"]'); if (!proposta) { box.innerHTML = ""; return; }
      const p = proposta;
      let antes = "", depois = "";
      if (p.escopo === "trecho") { antes = p.sel && p.sel.fim > p.sel.ini ? (ler(p.caminho) || "").slice(p.sel.ini, p.sel.fim) : ler(p.caminho) || ""; depois = p.depois; }
      else if (p.escopo === "atividade") { antes = textoAtividade(ed.atividades[p.atividade]); depois = textoAtividade(p.depois); }
      else { antes = textoPop(ed); depois = textoPop(p.depois); }
      box.innerHTML = `<div style="margin-top:12px"><div class="po-sub"><b>Proposta</b> (${p.escopo === "trecho" ? "trecho" : p.escopo === "atividade" ? "atividade " + (p.atividade + 1) : "POP inteiro"})</div>
        ${p.explicacao ? `<p style="font-size:13px;margin:4px 0">${esc(p.explicacao)}</p>` : ""}
        ${p.avisoInexistentes && p.avisoInexistentes.length ? `<div class="po-alerta">Atenção: a proposta cita ${p.avisoInexistentes.map(esc).join(", ")}, que não aparece no registro de módulos da Central. Confira antes de aplicar.</div>` : ""}
        <div class="po-dif">${diff(antes, depois)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><button class="btn primary" type="button" data-x="ia-aplicar">Aplicar</button><button class="btn" type="button" data-x="ia-aplicar-editar">Aplicar e editar</button><button class="btn" type="button" data-x="ia-descartar">Descartar</button></div></div>`;
    }
    function aplicar(editar) {
      const p = proposta; if (!p) return;
      let alvo = null;
      if (p.escopo === "trecho") {
        const v = ler(p.caminho) || "";
        escrever(p.caminho, p.sel && p.sel.fim > p.sel.ini ? v.slice(0, p.sel.ini) + p.depois + v.slice(p.sel.fim) : p.depois);
        alvo = `[data-c="${p.caminho}"]`;
      } else if (p.escopo === "atividade") { ed.atividades[p.atividade] = p.depois; alvo = `[data-c="a.${p.atividade}.nome"]`; }
      else { ed = JSON.parse(JSON.stringify(p.depois)); alvo = '[data-c="titulo"]'; }
      proposta = null; redesenhar(); mostrarProposta();
      ctx.toast("Aplicado no rascunho. Salve para guardar.");
      if (editar && alvo) { const x = $(alvo); if (x) { x.scrollIntoView({ behavior: "smooth", block: "center" }); x.focus(); } }
    }

    // ---------- Histórico ----------
    async function historicoTela(versaoVer) {
      const box = $('[data-box="hist"]');
      let h; try { h = await api("historico&funcao=" + atual); } catch (e) { box.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      let ver = "";
      if (versaoVer) { const v = (await api(`ver&funcao=${atual}&versao=${versaoVer}`)).pedida; if (v) ver = `<div class="po-card po-ler"><p class="po-sub">Versão ${v.numero} (${v.estado})</p>${window.QZ_POP_RENDER(v.conteudo, v.avisoExportacao)}</div>`; }
      box.innerHTML = `<div class="po-card"><div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><b>Histórico de ${esc(itemAtual().rotulo)}</b><span style="flex:1"></span><button class="btn" type="button" data-x="voltar">Voltar ao editor</button></div>
        <table class="po-tbl po-hist"><thead><tr><th>Versão</th><th>Estado</th><th>Autor</th><th>Data</th><th>Resumo da mudança</th><th></th></tr></thead><tbody>
        ${h.versoes.map(v => `<tr><td>v${v.numero}${v.numero === h.atual ? " <span class=\"po-tag pub\">atual</span>" : ""}</td><td>${v.estado === "publicado" ? "Publicado" : "Rascunho"}</td><td>${esc(v.autor?.nome || "")}</td>
          <td>${dataHora(v.publicadoEm || v.atualizadoEm || v.criadoEm)}</td><td>${esc(v.resumoMudanca || "")}</td>
          <td style="white-space:nowrap"><button class="btn po-mini" type="button" data-x="h-ver" data-v="${v.numero}">Ver</button> ${v.estado === "publicado" ? `<button class="btn po-mini" type="button" data-x="h-rest" data-v="${v.numero}">Restaurar como rascunho</button>` : ""}</td></tr>`).join("")}</tbody></table>
        <span class="po-sub" data-box="hmsg"></span></div>${ver}`;
    }

    // ---------- Eventos ----------
    el.addEventListener("focusin", ev => { const c = ev.target.dataset?.c; if (c) { foco = { caminho: c, ini: ev.target.selectionStart || 0, fim: ev.target.selectionEnd || 0 }; atualizarFoco(); } });
    const guardarSelecao = ev => { const c = ev.target.dataset?.c; if (c) { foco = { caminho: c, ini: ev.target.selectionStart || 0, fim: ev.target.selectionEnd || 0 }; atualizarFoco(); } };
    el.addEventListener("mouseup", guardarSelecao); el.addEventListener("keyup", guardarSelecao); el.addEventListener("select", guardarSelecao, true);
    el.addEventListener("input", ev => { const c = ev.target.dataset?.c; if (c) { escrever(c, ev.target.value); marcarSujo(); } });
    el.addEventListener("click", async ev => {
      const chip = ev.target.closest("[data-pop]"); if (chip) { abrir(chip.dataset.pop); return; }
      const ia = ev.target.closest("[data-ia]")?.dataset.ia; if (ia) { pedirIA(ia); return; }
      const atv = ev.target.closest(".po-atv"); if (atv && !ev.target.dataset.c && !ev.target.closest("[data-x]")) { foco = { caminho: `a.${atv.dataset.ai}.nome`, ini: 0, fim: 0 }; atualizarFoco(); }
      const b = ev.target.closest("[data-x]"); if (!b) return;
      const x = b.dataset.x, i = +b.dataset.i, k = +b.dataset.k;
      const mover = (arr, de, para) => { if (para < 0 || para >= arr.length) return; const [it] = arr.splice(de, 1); arr.splice(para, 0, it); };
      const A = ed?.atividades;
      if (x === "l-add") { (ed.links ||= []).push({ rotulo: "", url: "" }); return redesenhar(); }
      if (x === "l-del") { ed.links.splice(i, 1); return redesenhar(); }
      if (x === "pl-add") { ed.plataformas.push({ nome: "", funcao: "", link: "" }); return redesenhar(); }
      if (x === "pl-del") { ed.plataformas.splice(i, 1); return redesenhar(); }
      if (x === "a-add") { A.push({ nome: "Nova atividade", quando: "", passos: [{ t: "", n: 0 }], ferramentas: "", pronto: "", duvidas: "" }); foco = { caminho: `a.${A.length - 1}.nome`, ini: 0, fim: 0 }; return redesenhar(); }
      if (x === "a-del") { A.splice(i, 1); foco = { caminho: null, ini: 0, fim: 0 }; return redesenhar(); }
      if (x === "a-up") { mover(A, i, i - 1); return redesenhar(); }
      if (x === "a-down") { mover(A, i, i + 1); return redesenhar(); }
      if (x === "p-add") { A[i].passos.push({ t: "", n: 0 }); redesenhar(); const t = $(`[data-c="a.${i}.p.${A[i].passos.length - 1}"]`); if (t) t.focus(); return; }
      if (x === "p-del") { A[i].passos.splice(k, 1); return redesenhar(); }
      if (x === "p-up") { mover(A[i].passos, k, k - 1); return redesenhar(); }
      if (x === "p-down") { mover(A[i].passos, k, k + 1); return redesenhar(); }
      if (x === "p-n") { A[i].passos[k].n = A[i].passos[k].n ? 0 : 1; return redesenhar(); }
      if (x === "ia-aplicar") return aplicar(false);
      if (x === "ia-aplicar-editar") return aplicar(true);
      if (x === "ia-descartar") { proposta = null; mostrarProposta(); return; }
      b.disabled = true;
      try {
        if (x === "salvar") { const r = await api("rascunho.salvar", { funcao: atual, conteudo: ed, resumoMudanca: $("[data-resumo]")?.value || "" }); sujo = false; ctx.toast(`Rascunho v${r.rascunho.numero} salvo`); await recarregarLista(); return abrir(atual, true); }
        if (x === "publicar") {
          if (sujo) { ctx.toast("Salve o rascunho antes de publicar."); b.disabled = false; return; }
          const r = await api("publicar", { funcao: atual, resumoMudanca: $("[data-resumo]")?.value || "" }); ctx.toast(`Versão ${r.publicada.numero} publicada`); await recarregarLista(); return abrir(atual, true);
        }
        if (x === "descartar") { await api("rascunho.descartar", { funcao: atual }); sujo = false; ctx.toast("Rascunho descartado"); await recarregarLista(); return abrir(atual, true); }
        if (x === "historico") { if (sujo) { ctx.toast("Salve ou descarte as alterações antes."); b.disabled = false; return; } modo = "historico"; return tela(); }
        if (x === "voltar") { modo = "editar"; return abrir(atual, true); }
        if (x === "h-ver") { return historicoTela(+b.dataset.v); }
        if (x === "h-rest") {
          const n = +b.dataset.v;
          try { await api("restaurar", { funcao: atual, versao: n }); }
          catch (e) { if (e.code !== "tem_rascunho") throw e; const hm = $('[data-box="hmsg"]'); hm.innerHTML = `${esc(e.message)} <button class="btn po-mini" type="button" data-x="h-rest-sim" data-v="${n}">Substituir o rascunho</button>`; return; }
          ctx.toast(`v${n} restaurada como rascunho`); await recarregarLista(); modo = "editar"; return abrir(atual, true);
        }
        if (x === "h-rest-sim") { await api("restaurar", { funcao: atual, versao: +b.dataset.v, substituirRascunho: true }); ctx.toast("Rascunho substituído"); await recarregarLista(); modo = "editar"; return abrir(atual, true); }
        if (x === "rotulo") { const it = itemAtual(); const box = $('[data-box="editor"]'); box.insertAdjacentHTML("afterbegin", `<div class="po-f" data-box="rot">Nome da função neste POP<div style="display:flex;gap:6px"><input data-rot value="${esc(it.rotulo)}"><button class="btn po-mini" type="button" data-x="rotulo-ok">Salvar</button></div></div>`); b.disabled = false; return; }
        if (x === "rotulo-ok") { await api("rotulo", { funcao: atual, rotulo: $("[data-rot]").value }); ctx.toast("Rótulo salvo"); await recarregarLista(); return tela(); }
      } catch (e) { ctx.toast(e.message); }
      b.disabled = false;
    });
    async function recarregarLista() { const r = await api("lista"); lista = r.pops; }
    return carregar;
  }

  QZ.modulo({ id: "pop", iniciar(ctx) { if (!ctx.el) return; this._r = pop(ctx); if (!ctx.el.hidden) this._r(); }, aoMostrar() { if (this._r) this._r(); } });
})();
