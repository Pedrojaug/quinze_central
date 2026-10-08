// 01 Atendimento > Pendências de clientes (instrução 08).
// Tudo pela rota /api/m?r=pen/... A plataforma não envia nada ao cliente: o atendimento copia a mensagem e cola.
(function () {
  if (window.__qzPen) return; window.__qzPen = true;

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brd = iso => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "");
  const dLocal = iso => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date(iso)) : "");
  const dataHora = iso => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  async function api(r, body) {
    const res = await fetch("/api/m?r=pen/" + r, { method: body ? "POST" : "GET", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j.msg || (res.status === 403 ? "Sem permissão." : "Não deu para concluir. Tente de novo.")), { code: j.code, status: res.status });
    return j;
  }
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; }
    catch { const t = document.createElement("textarea"); t.value = texto; t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch { /* sem cópia */ } t.remove(); return ok; }
  }
  const ACAO = { rascunho: "criou o rascunho", aguardando_retorno: "aprovou e copiou a mensagem", respondida: "registrou: respondida", aprovada: "registrou: aprovada",
    recusada: "registrou: recusada", cancelada: "cancelou", cobranca: "gerou cobrança" };

  if (!document.getElementById("qzPenCss")) {
    const st = document.createElement("style"); st.id = "qzPenCss";
    st.textContent = `
      .pn-h{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px}.pn-h h2{margin:0}.pn-h .sp{flex:1}
      .pn-sub{font-size:12.5px;color:var(--ink2)}
      .pn-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:12px}
      .pn-card.form{border-color:var(--blue)}
      .pn-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
      .pn-grid label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--ink2)}.pn-grid .full{grid-column:1/-1}
      .pn-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
      .pn-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}
      .pn-kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px}
      .pn-kpi b{display:block;font:700 24px/1.1 var(--display);font-variant-numeric:tabular-nums}.pn-kpi span{font-size:12.5px;color:var(--ink2)}
      .pn-kpi.alerta b{color:#A12020}
      .pn-res{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-bottom:12px}
      .pn-res ul{margin:0;padding:0;list-style:none;font-size:13.5px}.pn-res li{display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid var(--line2)}.pn-res li:first-child{border-top:0}
      .pn-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px}
      .pn-filtros label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--ink2)}
      .pn-filtros .chk{flex-direction:row;align-items:center;gap:5px;font-size:13px;color:var(--ink);padding-bottom:6px}
      .pn-scroll{overflow-x:auto}
      .pn-tbl{width:100%;border-collapse:collapse;font-size:13.5px;min-width:980px}
      .pn-tbl th{font-size:12px;color:var(--ink2);font-weight:600;text-align:left;padding:7px 6px;border-bottom:1px solid var(--line);white-space:nowrap;cursor:pointer;user-select:none}
      .pn-tbl th[data-ord]::after{content:" ↕";opacity:.35}.pn-tbl th.asc::after{content:" ↑";opacity:1}.pn-tbl th.desc::after{content:" ↓";opacity:1}
      .pn-tbl td{padding:7px 6px;border-bottom:1px solid var(--line2);vertical-align:top}
      .pn-tbl tr.linha{cursor:pointer}.pn-tbl tr.linha:hover td{background:#F7F9FD}
      .pn-tbl tr.atrasada td{background:#FFF6F5}
      .pn-tbl .num{text-align:right;font-variant-numeric:tabular-nums}
      .pn-st{font-size:11.5px;padding:2px 8px;border-radius:20px;font-weight:600;white-space:nowrap}
      .pn-st.aguardando_retorno{background:#FFF4DE;color:#8A5A00}.pn-st.respondida{background:#E5EFFC;color:#1D4F91}.pn-st.aprovada{background:#E6F6EC;color:#1B6B3A}
      .pn-st.recusada{background:#FDE8E8;color:#A12020}.pn-st.cancelada{background:#EEF1F6;color:#56627A}.pn-st.rascunho{background:#F1ECFB;color:#55308F}
      .pn-st.atr{background:#FDE8E8;color:#A12020}
      .pn-msg{width:100%;min-height:190px;font:14px/1.5 inherit}
      .pn-aviso{font-size:13px;padding:8px 12px;border-radius:8px;background:#FFF8E6;border:1px solid #F2DDA4;color:#6B4E00;margin:8px 0}
      .pn-ok{font-size:13px;padding:8px 12px;border-radius:8px;background:#E6F6EC;color:#1B6B3A;margin:8px 0}
      .pn-det{background:#FAFBFD;padding:12px 14px !important}
      .pn-hist{margin:6px 0 0;padding:0;list-style:none;font-size:13px}.pn-hist li{padding:4px 0;border-top:1px solid var(--line2)}.pn-hist li:first-child{border-top:0}
      .pn-vazio{padding:22px;text-align:center;color:var(--ink2);font-size:14px}
      .pn-link{max-width:220px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom}`;
    document.head.appendChild(st);
  }

  function pendencias(ctx) {
    const el = ctx.el;
    let base = null, lista = [], hoje = "", ord = { col: "dias", dir: "desc" }, aberta = null, rascunho = null, cobranca = {};
    const $ = s => el.querySelector(s);
    const fv = n => el.querySelector(`[data-f="${n}"]`);

    async function carregar() {
      try { if (!base) base = await api("inicio"); const d = await api("pendencias"); lista = d.pendencias; hoje = d.hoje; }
      catch (e) { el.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      if (!$("[data-box=tabela]")) montar();
      opcoesFiltros(); render();
    }
    function montar() {
      const ops = (obj, vazio) => `<option value="">${vazio}</option>` + Object.entries(obj).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
      el.innerHTML = `<div class="pn-h"><div><h2>Pendências de clientes</h2><div class="pn-sub">Tudo o que enviamos ao cliente e ainda não teve retorno. A plataforma gera a mensagem; você copia e envia.</div></div><span class="sp"></span>
          ${base.gestao ? `<button class="btn" type="button" data-x="prazos">Prazos por tipo</button>` : ""}<button class="btn primary" type="button" data-x="nova">Nova pendência</button></div>
        <div data-box="prazos"></div><div data-box="nova"></div>
        <div class="pn-kpis" data-box="kpis"></div><div class="pn-res" data-box="resumo"></div>
        <div class="pn-card"><div class="pn-filtros">
          <label>Cliente<select data-f="cliente"><option value="">Todos</option></select></label>
          <label>Atendimento<select data-f="resp"><option value="">Todos</option></select></label>
          <label>Tipo<select data-f="tipo">${ops(base.tipos, "Todos")}</select></label>
          <label>Status<select data-f="status"><option value="">Todos (sem rascunhos)</option>${Object.entries(base.status).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
          <label>Enviado de<input type="date" data-f="de"></label><label>até<input type="date" data-f="ate"></label>
          <label class="chk"><input type="checkbox" data-f="atrasadas"> Somente atrasadas</label>
          <label style="flex:1;min-width:160px">Busca<input data-f="busca" placeholder="Título, cliente, link, nota…"></label>
          <button class="btn" type="button" data-x="csv">Exportar CSV</button></div>
          <div class="pn-scroll" data-box="tabela"></div></div>`;
    }
    function opcoesFiltros() {
      const set = (sel, pares) => { const v = sel.value; sel.innerHTML = sel.options[0].outerHTML + pares.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join(""); sel.value = pares.some(([k]) => k === v) ? v : ""; };
      const uniq = f => [...new Map(lista.filter(p => p.status !== "rascunho").map(f)).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
      set(fv("cliente"), uniq(p => [p.clienteId, p.clienteNome]));
      set(fv("resp"), uniq(p => [p.responsavel.login, p.responsavel.nome]));
    }
    function filtrada() {
      const q = fv("busca").value.trim().toLowerCase();
      return lista.filter(p => (fv("status").value ? p.status === fv("status").value : p.status !== "rascunho")
        && (!fv("cliente").value || p.clienteId === fv("cliente").value) && (!fv("resp").value || p.responsavel.login === fv("resp").value)
        && (!fv("tipo").value || p.tipo === fv("tipo").value) && (!fv("atrasadas").checked || p.atrasada)
        && (!fv("de").value || dLocal(p.enviadoEm) >= fv("de").value) && (!fv("ate").value || (p.enviadoEm && dLocal(p.enviadoEm) <= fv("ate").value))
        && (!q || [p.titulo, p.clienteNome, p.link, p.nota, p.resumo, p.responsavel.nome].join(" ").toLowerCase().includes(q)));
    }
    const COLS = [["cliente", "Cliente", p => p.clienteNome], ["resp", "Atendimento", p => p.responsavel.nome], ["tipo", "Tipo", p => base.tipos[p.tipo]], ["titulo", "Título", p => p.titulo],
      ["link", "Link", p => p.link], ["envio", "Envio", p => p.enviadoEm || ""], ["prazo", "Prazo de retorno", p => p.prazo || ""], ["dias", "Dias sem retorno", p => p.diasSemRetorno],
      ["status", "Status", p => base.status[p.status]], ["atual", "Última atualização", p => p.atualizadoEm || ""]];
    function ordenar(l) {
      const c = COLS.find(x => x[0] === ord.col); const k = c[2]; const s = ord.dir === "asc" ? 1 : -1;
      return l.slice().sort((a, b) => { const x = k(a), y = k(b); return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR")) * s || (b.diasAtraso - a.diasAtraso); });
    }
    function render() {
      const ativas = lista.filter(p => p.status === "aguardando_retorno");
      const atr = ativas.filter(p => p.atrasada);
      const cont = f => { const m = {}; ativas.forEach(p => { const [k, n] = f(p); (m[k] ||= { n, total: 0, atr: 0 }).total++; if (p.atrasada) m[k].atr++; }); return Object.values(m).sort((a, b) => b.total - a.total); };
      $("[data-box=kpis]").innerHTML = [[ativas.length, "Aguardando retorno"], [atr.length, "Atrasadas", atr.length ? "alerta" : ""],
        ...Object.entries(base.tipos).map(([k, v]) => [ativas.filter(p => p.tipo === k).length, v])].map(([n, r, c]) => `<div class="pn-kpi ${c || ""}"><b>${n}</b><span>${esc(r)}</span></div>`).join("");
      const ul = arr => arr.length ? `<ul>${arr.slice(0, 6).map(x => `<li><span>${esc(x.n)}</span><span><b>${x.total}</b>${x.atr ? ` <span class="pn-st atr">${x.atr} atrasada${x.atr > 1 ? "s" : ""}</span>` : ""}</span></li>`).join("")}</ul>` : `<div class="pn-sub">Nada aguardando.</div>`;
      $("[data-box=resumo]").innerHTML = `<div class="pn-card" style="margin:0"><div class="pn-sub" style="margin-bottom:6px"><b>Por atendimento</b></div>${ul(cont(p => [p.responsavel.login, p.responsavel.nome]))}</div>
        <div class="pn-card" style="margin:0"><div class="pn-sub" style="margin-bottom:6px"><b>Clientes com mais pendências</b></div>${ul(cont(p => [p.clienteId, p.clienteNome]))}</div>`;
      const l = ordenar(filtrada());
      $("[data-box=tabela]").innerHTML = l.length ? `<table class="pn-tbl"><thead><tr>${COLS.map(([k, n]) => `<th data-ord="${k}" class="${ord.col === k ? ord.dir : ""}">${n}</th>`).join("")}</tr></thead><tbody>
        ${l.map(p => `<tr class="linha${p.atrasada ? " atrasada" : ""}" data-id="${esc(p.id)}"><td>${esc(p.clienteNome)}</td><td>${esc(p.responsavel.nome)}</td><td>${esc(base.tipos[p.tipo])}</td><td>${esc(p.titulo)}</td>
          <td><a class="pn-link" href="${esc(p.link)}" target="_blank" rel="noopener" title="${esc(p.link)}">${esc(p.link.replace(/^https?:\/\//, ""))}</a></td>
          <td>${brd(dLocal(p.enviadoEm))}</td><td>${brd(p.prazo)}${p.atrasada ? `<br><span class="pn-st atr">atrasada há ${p.diasAtraso} dia${p.diasAtraso > 1 ? "s" : ""}</span>` : ""}</td>
          <td class="num">${p.status === "aguardando_retorno" ? p.diasSemRetorno : "—"}</td><td><span class="pn-st ${p.status}">${esc(base.status[p.status])}</span>${(p.cobrancas || []).length ? `<div class="pn-sub">${p.cobrancas.length} cobrança${p.cobrancas.length > 1 ? "s" : ""}</div>` : ""}</td>
          <td>${dataHora(p.atualizadoEm)}</td></tr>${aberta === p.id ? `<tr><td colspan="10" class="pn-det">${detalhe(p)}</td></tr>` : ""}`).join("")}</tbody></table>`
        : `<div class="pn-vazio">${lista.some(p => p.status !== "rascunho") ? "Nada com esses filtros." : "Nenhuma pendência registrada ainda. Clique em \"Nova pendência\"."}</div>`;
    }
    function detalhe(p) {
      const hist = (p.historico || []).slice().reverse().map(h => `<li><b>${esc(h.por?.nome || "")}</b> ${ACAO[h.acao] || esc(h.acao)} · <span class="pn-sub">${dataHora(h.em)}${h.data ? " · retorno em " + brd(h.data) : ""}</span>${h.nota ? `<div>${esc(h.nota)}</div>` : ""}</li>`).join("");
      const cob = cobranca[p.id];
      const acoes = !p.podeEditar ? `<p class="pn-sub">Só quem criou, o responsável, o Mestre e a gestão alteram esta pendência.</p>`
        : p.status === "rascunho" ? `<div class="pn-bar"><button class="btn primary" type="button" data-x="continuar">Continuar o rascunho</button></div>`
        : p.status === "aguardando_retorno" ? `<div class="pn-grid" style="margin-top:10px"><label>Retorno do cliente<select data-r="status"><option value="respondida">Respondida</option><option value="aprovada">Aprovada</option><option value="recusada">Recusada</option><option value="cancelada">Cancelar pendência</option></select></label>
            <label>Data do retorno<input type="date" data-r="data" value="${hoje}"></label><label class="full">O que o cliente respondeu (nota)<textarea data-r="nota" rows="2"></textarea></label></div>
            <div class="pn-bar"><button class="btn primary" type="button" data-x="retorno">Registrar</button><button class="btn" type="button" data-x="cobrar">Gerar cobrança</button><span class="pn-sub" data-r="msg"></span></div>
            ${cob ? `<div style="margin-top:10px"><div class="pn-sub">Mensagem de cobrança (registrada no histórico):</div><textarea class="pn-msg" style="min-height:120px" data-r="cob">${esc(cob)}</textarea><div class="pn-bar"><button class="btn" type="button" data-x="copiar-cob">Copiar cobrança</button></div></div>` : ""}`
        : `<div class="pn-bar"><button class="btn" type="button" data-x="reabrir">Reabrir (voltar a aguardar retorno)</button><span class="pn-sub" data-r="msg"></span></div>`;
      return `<div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:18px">
        <div><div class="pn-sub">Resumo</div><div>${esc(p.resumo || "—")}</div>${p.nota ? `<div class="pn-sub" style="margin-top:6px">Nota: ${esc(p.nota)}</div>` : ""}
          ${p.retorno ? `<div class="pn-ok">Retorno em ${brd(p.retorno.data)}: <b>${esc(base.status[p.retorno.status])}</b>${p.retorno.nota ? " — " + esc(p.retorno.nota) : ""}</div>` : ""}${acoes}</div>
        <div><div class="pn-sub">Histórico</div><ul class="pn-hist">${hist}</ul></div></div>`;
    }

    // ---------- Nova pendência (rascunho) ----------
    function formNova(p) {
      const box = $("[data-box=nova]");
      const opCli = base.clientes.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join("");
      if (!p) {
        box.innerHTML = `<div class="pn-card form"><h3 style="margin:0 0 10px;font-size:16px">Nova pendência</h3><div class="pn-grid">
          <label class="full">Link do que foi enviado<input data-n="link" placeholder="https://drive.google.com/..." inputmode="url"></label>
          <label>Cliente<select data-n="cliente"><option value="">Escolha</option>${opCli}</select></label>
          ${base.gestao ? `<label>Atendimento responsável<select data-n="resp">${base.pessoas.map(x => `<option value="${esc(x.login)}"${x.login === base.login ? " selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></label>` : ""}
          <label class="full">Nota curta (opcional)<input data-n="nota" maxlength="300" placeholder="Ex.: arte do outdoor da campanha de verão"></label>
          <label class="full" data-n="descbox" hidden>Descreva em uma linha o que foi enviado<input data-n="desc" maxlength="300"></label></div>
          <div data-n="aviso"></div>
          <div class="pn-bar"><button class="btn primary" type="button" data-x="interpretar">Interpretar link</button><button class="btn" type="button" data-x="fechar">Cancelar</button><span class="pn-sub" data-n="msg"></span></div></div>`;
        box.querySelector('[data-n="link"]').focus();
        return;
      }
      rascunho = p;
      const tipos = Object.entries(base.tipos).map(([k, v]) => `<option value="${k}"${k === p.tipo ? " selected" : ""}>${esc(v)}${k === p.tipoSugerido ? " (sugerido)" : ""}</option>`).join("");
      box.innerHTML = `<div class="pn-card form"><h3 style="margin:0 0 6px;font-size:16px">Mensagem para aprovação · ${esc(p.clienteNome)}</h3>
        ${p.leitura.baseadoSoNaDescricao ? `<div class="pn-aviso">Tipo sugerido <b>baseado só na sua descrição</b>: o link não pôde ser lido. Confira o tipo antes de aprovar.</div>`
          : `<div class="pn-sub">Link lido (${p.leitura.fonte === "pagina" ? "página" : p.leitura.fonte === "arquivo" ? "arquivo" : "Google Drive"}${p.leitura.nome ? ": " + esc(p.leitura.nome) : ""}). Confiança da classificação: ${esc(p.confianca)}.</div>`}
        ${p.avisoIA ? `<div class="pn-aviso">${esc(p.avisoIA)} Preencha o tipo e o título.</div>` : ""}
        <div class="pn-grid" style="margin-top:10px">
          <label>Tipo<select data-d="tipo">${tipos}</select></label>
          <label>Prazo de retorno<input type="date" data-d="prazo" value="${esc(p.prazo)}"></label>
          <label class="full">Título<input data-d="titulo" maxlength="80" value="${esc(p.titulo)}"></label>
          <label class="full">Resumo<input data-d="resumo" maxlength="200" value="${esc(p.resumo)}"></label>
          <label class="full">Mensagem para o cliente (edite à vontade)<textarea class="pn-msg" data-d="mensagem">${esc(p.mensagem)}</textarea></label></div>
        <div class="pn-bar"><button class="btn primary" type="button" data-x="aprovar">Aprovar e copiar mensagem</button><button class="btn" type="button" data-x="regerar">Regerar mensagem</button>
          <button class="btn" type="button" data-x="salvar-rasc">Salvar rascunho</button><button class="btn" type="button" data-x="descartar" style="color:var(--danger)">Descartar</button><span class="pn-sub" data-d="msg"></span></div>
        <p class="pn-sub" style="margin:8px 0 0">Nada é enviado ao cliente pela plataforma. Ao aprovar, a mensagem vai para a área de transferência e a pendência entra na planilha como "Aguardando retorno".</p></div>`;
      box.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const dadosRasc = () => { const d = n => $(`[data-d="${n}"]`).value; return { id: rascunho.id, tipo: d("tipo"), prazo: d("prazo"), titulo: d("titulo"), resumo: d("resumo"), mensagem: d("mensagem") }; };

    el.addEventListener("click", async ev => {
      const th = ev.target.closest("th[data-ord]");
      if (th) { const c = th.dataset.ord; ord = ord.col === c ? { col: c, dir: ord.dir === "asc" ? "desc" : "asc" } : { col: c, dir: c === "dias" ? "desc" : "asc" }; render(); return; }
      const x = ev.target.closest("[data-x]")?.dataset.x;
      const tr = ev.target.closest("tr.linha");
      if (!x && tr && !ev.target.closest("a")) { aberta = aberta === tr.dataset.id ? null : tr.dataset.id; render(); return; }
      if (!x) return;
      const msgN = t => { const m = $('[data-n="msg"]'); if (m) m.textContent = t; };
      const msgD = t => { const m = $('[data-d="msg"]'); if (m) m.textContent = t; };
      const msgR = t => { const m = $('[data-r="msg"]'); if (m) m.textContent = t; };
      const btn = ev.target.closest("button"); const travar = v => { if (btn) btn.disabled = v; };
      try {
        if (x === "nova") { rascunho = null; formNova(); return; }
        if (x === "fechar") { $("[data-box=nova]").innerHTML = ""; rascunho = null; return; }
        if (x === "prazos") {
          const box = $("[data-box=prazos]");
          if (box.innerHTML) { box.innerHTML = ""; return; }
          box.innerHTML = `<div class="pn-card"><div class="pn-sub" style="margin-bottom:8px">Prazo padrão de retorno, em dias úteis, contado do envio:</div><div class="pn-grid">
            ${Object.entries(base.tipos).map(([k, v]) => `<label>${esc(v)}<input type="number" min="1" max="30" data-pz="${k}" value="${base.prazos[k]}"></label>`).join("")}</div>
            <div class="pn-bar"><button class="btn primary" type="button" data-x="salvar-prazos">Salvar prazos</button><span class="pn-sub" data-pz="msg"></span></div></div>`;
          return;
        }
        if (x === "salvar-prazos") {
          const prazos = Object.fromEntries([...el.querySelectorAll("input[data-pz]")].map(i => [i.dataset.pz, i.value]));
          const r = await api("config.salvar", { prazos }); base.prazos = r.prazos; $("[data-box=prazos]").innerHTML = ""; ctx.toast("Prazos salvos"); return;
        }
        if (x === "interpretar") {
          const n = k => $(`[data-n="${k}"]`);
          if (!n("link").value.trim() || !n("cliente").value) { msgN("Informe o link e o cliente."); return; }
          const pedeDesc = !n("descbox").hidden;
          if (pedeDesc && !n("desc").value.trim()) { msgN("Descreva o que foi enviado."); n("desc").focus(); return; }
          travar(true); msgN("Lendo o link…");
          const r = await api("interpretar", { link: n("link").value, clienteId: n("cliente").value, responsavel: n("resp")?.value || "", nota: n("nota").value, descricao: pedeDesc ? n("desc").value : "" });
          travar(false);
          if (r.precisaDescricao) { n("descbox").hidden = false; n("aviso").innerHTML = `<div class="pn-aviso">${esc(r.msg)}</div>`; btn.textContent = "Classificar pela descrição"; msgN(""); n("desc").focus(); return; }
          formNova(r.pendencia); lista = lista.filter(p => p.id !== r.pendencia.id).concat(r.pendencia); return;
        }
        if (x === "regerar") { travar(true); msgD("Gerando…"); const r = await api("mensagem.regerar", dadosRasc()); formNova(r.pendencia); return; }
        if (x === "salvar-rasc") { travar(true); await api("rascunho.salvar", dadosRasc()); ctx.toast("Rascunho salvo"); $("[data-box=nova]").innerHTML = ""; rascunho = null; carregar(); return; }
        if (x === "descartar") { travar(true); await api("descartar", { id: rascunho.id }); $("[data-box=nova]").innerHTML = ""; rascunho = null; ctx.toast("Rascunho descartado"); carregar(); return; }
        if (x === "aprovar") {
          const d = dadosRasc(); if (!d.mensagem.trim()) { msgD("A mensagem está vazia."); return; }
          travar(true);
          const copiou = await copiar(d.mensagem);
          await api("aprovar", d);
          $("[data-box=nova]").innerHTML = ""; rascunho = null;
          ctx.toast(copiou ? "Mensagem copiada. Cole no WhatsApp do cliente." : "Pendência registrada. Copie a mensagem manualmente.");
          carregar(); return;
        }
        const id = ev.target.closest("tr")?.previousElementSibling?.dataset.id || aberta;
        const p = lista.find(q => q.id === id);
        if (x === "continuar") { formNova(p); return; }
        if (x === "retorno") {
          const st = $('[data-r="status"]').value; travar(true);
          await api("retorno", { id, status: st, data: $('[data-r="data"]').value, nota: $('[data-r="nota"]').value });
          ctx.toast(st === "cancelada" ? "Pendência cancelada" : "Retorno registrado"); delete cobranca[id]; carregar(); return;
        }
        if (x === "reabrir") { travar(true); await api("retorno", { id, status: "aguardando_retorno", nota: "Reaberta" }); ctx.toast("Pendência reaberta"); carregar(); return; }
        if (x === "cobrar") { travar(true); const r = await api("cobranca", { id }); cobranca[id] = r.mensagem; lista = lista.map(q => q.id === id ? r.pendencia : q); render(); return; }
        if (x === "copiar-cob") { const ok = await copiar($('[data-r="cob"]').value); ctx.toast(ok ? "Cobrança copiada" : "Copie manualmente"); return; }
        if (x === "csv") {
          const cel = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
          const linhas = [["Cliente", "Atendimento", "Tipo", "Título", "Link", "Data de envio", "Prazo de retorno", "Dias sem retorno", "Atrasada", "Status", "Cobranças", "Última atualização"].map(cel).join(";"),
            ...ordenar(filtrada()).map(p => [p.clienteNome, p.responsavel.nome, base.tipos[p.tipo], p.titulo, p.link, brd(dLocal(p.enviadoEm)), brd(p.prazo), p.status === "aguardando_retorno" ? p.diasSemRetorno : "",
              p.atrasada ? "sim" : "não", base.status[p.status], (p.cobrancas || []).length, dataHora(p.atualizadoEm)].map(cel).join(";"))];
          const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
          a.download = `pendencias-de-clientes-${hoje}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return;
        }
      } catch (e) { travar(false); (rascunho ? msgD : $('[data-r="msg"]') ? msgR : msgN)(e.message); if (!$('[data-n="msg"]') && !$('[data-d="msg"]') && !$('[data-r="msg"]')) ctx.toast(e.message); }
    });
    el.addEventListener("input", ev => { if (ev.target.dataset.f === "busca") render(); });
    el.addEventListener("change", ev => { if (ev.target.dataset.f) render(); });
    return carregar;
  }

  QZ.modulo({ id: "pendencias", iniciar(ctx) { if (!ctx.el) return; this._r = pendencias(ctx); if (!ctx.el.hidden) this._r(); }, aoMostrar() { if (this._r) this._r(); } });
})();
