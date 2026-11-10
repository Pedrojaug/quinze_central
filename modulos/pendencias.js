// 01 Atendimento > Pendências de clientes (instrução 08).
// Funciona como registro persistente de pendências dos clientes para acompanhamento, reprogramação de prazos e cobranças.
(function () {
  if (window.__qzPen) return; window.__qzPen = true;

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const br = iso => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "");
  const brd = iso => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "");
  const dLocal = iso => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date(iso)) : "");
  const dataHora = iso => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  const somarDias = (iso, n) => {
    const dt = new Date((iso || new Date().toISOString().slice(0, 10)) + "T12:00:00Z");
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  };
  const somarDiasUteis = (iso, n) => {
    let x = iso || new Date().toISOString().slice(0, 10), k = 0;
    while (k < n) { x = somarDias(x, 1); if (![0, 6].includes(new Date(x + "T12:00:00Z").getUTCDay())) k++; }
    return x;
  };
  const proximaSegunda = iso => {
    let x = iso || new Date().toISOString().slice(0, 10);
    do { x = somarDias(x, 1); } while (new Date(x + "T12:00:00Z").getUTCDay() !== 1);
    return x;
  };
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
  const ACAO = { rascunho: "criou o rascunho", aguardando_retorno: "registrou a pendência", registrada: "registrou a pendência",
    respondida: "registrou: respondida", aprovada: "registrou: aprovada", recusada: "registrou: recusada",
    cancelada: "cancelou", cobranca: "realizou cobrança", reprogramada: "reprogramou o prazo" };

  if (!document.getElementById("qzPenCss")) {
    const st = document.createElement("style"); st.id = "qzPenCss";
    st.textContent = `
      .pn-h{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px}.pn-h h2{margin:0}.pn-h .sp{flex:1}
      .pn-sub{font-size:12.5px;color:var(--ink2)}
      .pn-seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden}
      .pn-seg button{border:0;background:var(--card);padding:7px 13px;font:inherit;font-size:13.5px;cursor:pointer;color:var(--ink2)}
      .pn-seg button[aria-pressed="true"]{background:var(--blue);color:#fff}
      .pn-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:12px}
      .pn-add{display:grid;grid-template-columns:minmax(160px,1.3fr) minmax(200px,2fr) minmax(140px,1.1fr) 135px minmax(140px,1fr) auto;gap:8px;align-items:center}
      .pn-add.gestao{grid-template-columns:minmax(150px,1.2fr) minmax(190px,1.8fr) minmax(130px,1fr) minmax(135px,1fr) 130px minmax(130px,1fr) auto}
      @media(max-width:1050px){.pn-add,.pn-add.gestao{grid-template-columns:1fr 1fr}}
      .pn-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:10px}
      .pn-grid label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--ink2)}.pn-grid .full{grid-column:1/-1}
      .pn-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
      .pn-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-bottom:12px}
      .pn-kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px}
      .pn-kpi b{display:block;font:700 22px/1.1 var(--display);font-variant-numeric:tabular-nums}.pn-kpi span{font-size:12.5px;color:var(--ink2)}
      .pn-kpi.alerta b{color:#A12020}
      .pn-res{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-bottom:12px}
      .pn-res ul{margin:0;padding:0;list-style:none;font-size:13.5px}.pn-res li{display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid var(--line2)}.pn-res li:first-child{border-top:0}
      .pn-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--line2)}
      .pn-filtros label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--ink2)}
      .pn-list{display:flex;flex-direction:column}
      .pn-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 4px;border-top:1px solid var(--line2)}
      .pn-row:first-child{border-top:0}
      .pn-row.feita .tt{text-decoration:line-through;color:var(--ink2)}
      .pn-row.atrasada{background:#FFF6F5}
      .pn-chk{width:22px;height:22px;border-radius:50%;border:2px solid #9AA8BF;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;padding:0}
      .pn-row.feita .pn-chk{background:var(--ok);border-color:var(--ok)}
      .pn-chk:hover{border-color:var(--blue)}
      .pn-meta{font-size:12.5px;color:var(--ink2);display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:3px}
      .pn-prazo-btn{border:1px solid transparent;background:transparent;color:var(--ink2);font:inherit;font-size:12.5px;padding:1px 6px;margin:-1px -6px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
      .pn-prazo-btn:hover{background:#EEF3FB;border-color:#D0DDF2;color:var(--blue)}
      .pn-st{font-size:11.5px;padding:1px 8px;border-radius:20px;font-weight:600;white-space:nowrap}
      .pn-st.aguardando_retorno{background:#FFF4DE;color:#8A5A00}.pn-st.respondida{background:#E5EFFC;color:#1D4F91}.pn-st.aprovada{background:#E6F6EC;color:#1B6B3A}
      .pn-st.recusada{background:#FDE8E8;color:#A12020}.pn-st.cancelada{background:#EEF1F6;color:#56627A}
      .pn-st.atr{background:#FDE8E8;color:#A12020}.pn-st.cli{background:#E5EFFC;color:#1D4F91}.pn-st.tipo{background:#EEF1F6;color:#475467}
      .pn-st.cob{background:#F1ECFB;color:#55308F}.pn-st.dono{background:#F1ECFB;color:#55308F}
      .pn-act{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.pn-act .btn{padding:3px 10px;min-height:0;font-size:13px}
      .pn-edit{padding:12px 14px 14px 38px;border-top:1px dashed var(--line2);background:#FAFBFD;border-radius:0 0 8px 8px}
      .pn-atalhos-data{display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-top:4px}
      .pn-atalho-btn{border:1px solid var(--line);background:#fff;color:var(--ink2);font:inherit;font-size:11.5px;padding:2px 8px;border-radius:14px;cursor:pointer}
      .pn-atalho-btn:hover{border-color:var(--blue);color:var(--blue);background:#F2F7FF}
      .pn-msg{width:100%;min-height:110px;font:13.5px/1.45 inherit}
      .pn-ok{font-size:13px;padding:8px 12px;border-radius:8px;background:#E6F6EC;color:#1B6B3A;margin:8px 0}
      .pn-hist{margin:6px 0 0;padding:0;list-style:none;font-size:12.5px}.pn-hist li{padding:4px 0;border-top:1px solid var(--line2)}.pn-hist li:first-child{border-top:0}
      .pn-vazio{padding:22px;text-align:center;color:var(--ink2);font-size:14px}
      .pn-link{max-width:240px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom}`;
    document.head.appendChild(st);
  }

  function pendencias(ctx) {
    const el = ctx.el;
    let base = null, lista = [], hoje = "", visao = "pendentes", aberta = null, focoCampo = "titulo", apagar = null, cobranca = {};
    const $ = s => el.querySelector(s);
    const fv = n => el.querySelector(`[data-f="${n}"]`);

    const opClientes = (sel, nomeAtual) => {
      const tem = !sel || base.clientes.some(c => c.id === sel);
      const extra = !tem ? `<option value="${esc(sel)}" selected>${esc(nomeAtual || sel)}</option>` : "";
      return `<option value="">Escolha o cliente…</option>${extra}${base.clientes.map(c => `<option value="${esc(c.id)}"${c.id === sel ? " selected" : ""}>${esc(c.nome)}</option>`).join("")}`;
    };
    const opPessoas = (sel, vazio, nomeAtual) => {
      const tem = !sel || base.pessoas.some(p => p.login === sel);
      const extra = !tem ? `<option value="${esc(sel)}" selected>${esc(nomeAtual || sel)}</option>` : "";
      return `${vazio ? `<option value="">${vazio}</option>` : ""}${extra}${base.pessoas.map(p => `<option value="${esc(p.login)}"${p.login === sel ? " selected" : ""}>${esc(p.nome)}</option>`).join("")}`;
    };
    const opObj = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}"${k === sel ? " selected" : ""}>${esc(v)}</option>`).join("");

    async function carregar(forcarBase = false) {
      try {
        if (!base || forcarBase) base = await api("inicio");
        const d = await api("pendencias");
        lista = d.pendencias;
        hoje = d.hoje || base.hoje;
        base.hoje = hoje;
      } catch (e) { el.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      if (!$("[data-box=lista]")) montar();
      else {
        const sc = $('[data-n="cliente"]'), sr = $('[data-n="resp"]');
        if (sc) sc.innerHTML = opClientes(sc.value);
        if (sr) sr.innerHTML = opPessoas(sr.value || base.login, "");
      }
      opcoesFiltros();
      render();
    }

    function prazoPadraoDe(tipo) {
      const dias = (base?.prazos && base.prazos[tipo]) || 2;
      return somarDiasUteis(hoje || base?.hoje, dias);
    }

    function montar() {
      const g = base.gestao;
      const prazoInicial = prazoPadraoDe("retorno_necessario");
      el.innerHTML = `<div class="pn-h"><div><h2>Pendências de clientes</h2><div class="pn-sub">Registre o que está pendente com cada cliente para controlar os prazos de retorno e fazer as devidas cobranças.</div></div><span class="sp"></span>
          ${g ? `<button class="btn" type="button" data-x="prazos">Prazos padrão</button>` : ""}
          <div class="pn-seg" role="group">
            <button type="button" data-v="pendentes" aria-pressed="true">Aguardando retorno</button>
            <button type="button" data-v="atrasadas" aria-pressed="false">Atrasadas</button>
            <button type="button" data-v="concluidas" aria-pressed="false">Concluídas</button>
            <button type="button" data-v="todas" aria-pressed="false">Todas</button>
          </div></div>
        <div data-box="prazos"></div>
        <form class="pn-card" data-x="add-pen">
          <div class="pn-add${g ? " gestao" : ""}">
            <select data-n="cliente" aria-label="Cliente">${opClientes("")}</select>
            <input data-n="titulo" maxlength="160" placeholder="Nova pendência do cliente… (Ex.: Aprovar orçamento, enviar briefing)" aria-label="O que está pendente">
            ${g ? `<select data-n="resp" aria-label="Atendimento responsável">${opPessoas(base.login, "")}</select>` : ""}
            <select data-n="tipo" aria-label="Tipo de pendência">${opObj(base.tipos, "retorno_necessario")}</select>
            <input type="date" data-n="prazo" value="${prazoInicial}" aria-label="Prazo para retorno" title="Prazo esperado para retorno/cobrança">
            <input data-n="link" placeholder="Link (opcional)" inputmode="url" aria-label="Link (opcional)">
            <button class="btn primary" type="submit" data-n="btn">Adicionar</button>
          </div>
          <div class="pn-sub" data-n="msg" style="margin-top:6px;color:var(--danger)"></div>
        </form>
        <div class="pn-kpis" data-box="kpis"></div>
        <div class="pn-res" data-box="resumo"></div>
        <div class="pn-card">
          <div class="pn-filtros">
            <label>Cliente<select data-f="cliente"><option value="">Todos</option></select></label>
            <label>Atendimento<select data-f="resp"><option value="">Todos</option></select></label>
            <label>Tipo<select data-f="tipo"><option value="">Todos</option>${opObj(base.tipos, "")}</select></label>
            <label style="flex:1;min-width:160px">Busca<input data-f="busca" placeholder="Cliente, assunto, atendimento, link…"></label>
            <button class="btn" type="button" data-x="csv">Exportar CSV</button>
          </div>
          <div class="pn-list" data-box="lista"><div class="pn-vazio">Carregando…</div></div>
        </div>`;

      const formAdd = $('[data-x="add-pen"]');
      const selTipo = formAdd.querySelector('[data-n="tipo"]');
      const inpPrazo = formAdd.querySelector('[data-n="prazo"]');
      let prazoEditadoManual = false;
      inpPrazo.addEventListener("change", () => { prazoEditadoManual = true; });
      selTipo.addEventListener("change", () => {
        if (!prazoEditadoManual) inpPrazo.value = prazoPadraoDe(selTipo.value);
      });

      formAdd.addEventListener("submit", async ev => {
        ev.preventDefault();
        const n = k => formAdd.querySelector(`[data-n="${k}"]`);
        const msg = t => { n("msg").textContent = t; };
        if (!n("cliente").value) { msg("Escolha o cliente."); n("cliente").focus(); return; }
        if (!n("titulo").value.trim()) { msg("Descreva o que está pendente com o cliente."); n("titulo").focus(); return; }
        msg("");
        const btn = n("btn");
        btn.disabled = true;
        try {
          const b = {
            clienteId: n("cliente").value,
            titulo: n("titulo").value.trim(),
            tipo: n("tipo").value,
            prazo: n("prazo").value,
            link: n("link").value.trim(),
          };
          if (g && n("resp")) b.responsavel = n("resp").value || base.login;
          await api("salvar", b);
          n("titulo").value = "";
          n("link").value = "";
          prazoEditadoManual = false;
          n("prazo").value = prazoPadraoDe(n("tipo").value);
          n("titulo").focus();
          if (visao === "concluidas") visao = "pendentes";
          ctx.toast("Pendência registrada");
          await carregar();
        } catch (e) {
          msg(e.message);
          ctx.toast(e.message);
        } finally {
          btn.disabled = false;
        }
      });
    }

    function opcoesFiltros() {
      const set = (sel, pares) => {
        if (!sel) return;
        const v = sel.value;
        sel.innerHTML = sel.options[0].outerHTML + pares.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join("");
        sel.value = pares.some(([k]) => k === v) ? v : "";
      };
      const uniq = f => [...new Map(lista.filter(p => p.clienteId || p.responsavel).map(f)).entries()].filter(([k]) => k).sort((a, b) => String(a[1] || "").localeCompare(String(b[1] || ""), "pt-BR"));
      set(fv("cliente"), uniq(p => [p.clienteId, p.clienteNome]));
      set(fv("resp"), uniq(p => [p.responsavel?.login, p.responsavel?.nome]));
    }

    function filtrada() {
      const q = (fv("busca")?.value || "").trim().toLowerCase();
      return lista.filter(p => {
        if (visao === "pendentes" && p.status !== "aguardando_retorno") return false;
        if (visao === "atrasadas" && !(p.status === "aguardando_retorno" && p.atrasada)) return false;
        if (visao === "concluidas" && p.status === "aguardando_retorno") return false;
        if (fv("cliente")?.value && p.clienteId !== fv("cliente").value) return false;
        if (fv("resp")?.value && p.responsavel?.login !== fv("resp").value) return false;
        if (fv("tipo")?.value && p.tipo !== fv("tipo").value) return false;
        if (q && ![p.titulo, p.clienteNome, p.link || "", p.nota || "", p.resumo || "", p.responsavel?.nome || ""].join(" ").toLowerCase().includes(q)) return false;
        return true;
      }).sort((a, b) => {
        if (a.status !== b.status && (a.status === "aguardando_retorno" || b.status === "aguardando_retorno")) {
          return a.status === "aguardando_retorno" ? -1 : 1;
        }
        if (a.atrasada !== b.atrasada) return a.atrasada ? -1 : 1;
        if (a.diasAtraso !== b.diasAtraso) return (b.diasAtraso || 0) - (a.diasAtraso || 0);
        const pa = a.prazo || "9999-99-99", pb = b.prazo || "9999-99-99";
        if (pa !== pb) return pa.localeCompare(pb);
        return (b.criadoEm || "").localeCompare(a.criadoEm || "");
      });
    }

    function atalhosPrazoHtml() {
      const h = hoje || base.hoje;
      const amanha = somarDias(h, 1);
      const mais2Uteis = somarDiasUteis(h, 2);
      const proxSeg = proximaSegunda(h);
      const mais7 = somarDias(h, 7);
      const botoes = [
        ["Hoje", h],
        ["Amanhã", amanha],
        [`+2 dias úteis (${br(mais2Uteis)})`, mais2Uteis],
        ...(proxSeg !== amanha && proxSeg !== mais2Uteis ? [[`Próx. seg (${br(proxSeg)})`, proxSeg]] : []),
        [`+7 dias (${br(mais7)})`, mais7],
      ];
      return `<div class="pn-atalhos-data"><span class="pn-sub" style="font-size:11.5px">Reprogramar prazo:</span>${botoes.map(([rotulo, val]) => `<button type="button" class="pn-atalho-btn" data-prazo-set="${val}">${rotulo}</button>`).join("")}</div>`;
    }

    function linha(p) {
      const aguardando = p.status === "aguardando_retorno";
      const feita = !aguardando;
      const numCob = (p.cobrancas || []).length;
      const ultCob = numCob ? p.cobrancas[numCob - 1] : null;
      const tags = [
        `<span class="pn-st cli">${esc(p.clienteNome || "Cliente")}</span>`,
        `<span class="pn-st tipo">${esc(base.tipos[p.tipo] || "Retorno necessário")}</span>`,
        p.atrasada ? `<span class="pn-st atr">Atrasada há ${p.diasAtraso} dia${p.diasAtraso > 1 ? "s" : ""}</span>` : "",
        !aguardando ? `<span class="pn-st ${esc(p.status)}">${esc(base.status[p.status] || p.status)}</span>` : "",
        numCob ? `<span class="pn-st cob" title="${ultCob ? "Última cobrança em " + dataHora(ultCob.em) : ""}">🔔 ${numCob} cobrança${numCob > 1 ? "s" : ""}</span>` : "",
        `<span class="pn-st dono">${esc(p.responsavel?.nome || "")}</span>`,
      ].join("");

      const prazoBtn = `<button type="button" class="pn-prazo-btn" data-x="reprogramar" title="Clique para reprogramar a data de retorno/cobrança">${p.prazo ? `Prazo ${br(p.prazo)}` : "Sem prazo"} ✎</button>`;
      const metaItens = [
        prazoBtn,
        aguardando ? `<span>${p.diasSemRetorno ? `${p.diasSemRetorno} dia${p.diasSemRetorno > 1 ? "s" : ""} sem retorno` : "Registrada hoje"}</span>` : "",
        `<span>Registrada em ${br(dLocal(p.enviadoEm || p.criadoEm))}</span>`,
        p.retorno ? `<span>Retorno em ${br(p.retorno.data)}</span>` : "",
        p.link ? `<a class="pn-link" href="${esc(p.link)}" target="_blank" rel="noopener" title="${esc(p.link)}">${esc(p.link.replace(/^https?:\/\//, ""))}</a>` : "",
      ].filter(Boolean).join("<span>·</span>");

      return `<div class="pn-row${feita ? " feita" : ""}${p.atrasada ? " atrasada" : ""}" data-id="${esc(p.id)}">
        <button class="pn-chk" type="button" data-x="${feita ? "reabrir-rapido" : "concluir-rapido"}" title="${feita ? "Reabrir pendência" : "Marcar retorno recebido (concluir)"}" aria-label="${feita ? "Reabrir" : "Concluir"} ${esc(p.titulo)}">${feita ? "✓" : ""}</button>
        <div>
          <div class="tt" style="font-weight:500">${esc(p.titulo)}</div>
          <div class="pn-meta">${tags}</div>
          <div class="pn-meta">${metaItens}</div>
          ${p.nota ? `<div class="pn-sub" style="margin-top:3px;white-space:pre-wrap">${esc(p.nota)}</div>` : ""}
        </div>
        <div class="pn-act">
          ${apagar === p.id
            ? `<button class="btn" type="button" data-x="excluir-sim" style="color:var(--danger)">Excluir mesmo</button><button class="btn" type="button" data-x="excluir-nao">Não</button>`
            : `${aguardando ? `<button class="btn primary" type="button" data-x="cobrar-rapido" title="Registrar cobrança e copiar mensagem para o WhatsApp">🔔 Cobrar</button>` : ""}
               <button class="btn" type="button" data-x="editar">${aberta === p.id ? "Fechar" : "Editar"}</button>
               <button class="btn" type="button" data-x="excluir" title="Excluir pendência">✕</button>`}
        </div>
      </div>
      ${aberta === p.id ? painelEdicao(p) : ""}`;
    }

    function painelEdicao(p) {
      const hist = (p.historico || []).slice().reverse().map(h => `<li><b>${esc(h.por?.nome || "")}</b> ${ACAO[h.acao] || esc(h.acao)} · <span class="pn-sub">${dataHora(h.em)}${h.data ? " · retorno em " + brd(h.data) : ""}</span>${h.nota ? `<div>${esc(h.nota)}</div>` : ""}</li>`).join("");
      const txtCob = cobranca[p.id] || p.mensagem || "";
      const aguardando = p.status === "aguardando_retorno";
      return `<div class="pn-edit" data-edit-pen="${esc(p.id)}">
        <div style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:18px">
          <div>
            <form data-x="form-edit-pen">
              <div class="pn-grid">
                <label class="full">O que está pendente / Assunto<input data-e="titulo" maxlength="160" value="${esc(p.titulo)}"></label>
                <label>Cliente<select data-e="cliente">${opClientes(p.clienteId, p.clienteNome)}</select></label>
                ${base.gestao ? `<label>Responsável<select data-e="resp">${opPessoas(p.responsavel?.login, "", p.responsavel?.nome)}</select></label>` : ""}
                <label>Tipo<select data-e="tipo">${opObj(base.tipos, p.tipo)}</select></label>
                <label>Prazo de retorno<input type="date" data-e="prazo" value="${esc(p.prazo || "")}"></label>
                <div class="full">${atalhosPrazoHtml()}</div>
                <label class="full">Link (opcional)<input data-e="link" value="${esc(p.link || "")}" placeholder="https://..."></label>
                <label class="full">Observação / Nota (opcional)<textarea data-e="nota" rows="2">${esc(p.nota || "")}</textarea></label>
              </div>
              <div class="pn-bar">
                <button class="btn primary" type="submit" data-e="salvar">Salvar alterações</button>
                <button class="btn" type="button" data-x="cancelar-edicao">Cancelar</button>
                <span class="pn-sub" data-e="msg" style="color:var(--danger)"></span>
              </div>
            </form>

            <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line2)">
              ${aguardando ? `<div class="pn-sub" style="margin-bottom:6px"><b>Dar baixa / Registrar retorno do cliente</b></div>
                <div class="pn-grid">
                  <label>Resultado<select data-r="status"><option value="respondida">Respondida</option><option value="aprovada">Aprovada</option><option value="recusada">Recusada</option><option value="cancelada">Cancelar pendência</option></select></label>
                  <label>Data do retorno<input type="date" data-r="data" value="${hoje}"></label>
                  <label class="full">O que o cliente respondeu (opcional)<input data-r="nota" placeholder="Ex.: Aprovado pelo WhatsApp"></label>
                </div>
                <div class="pn-bar">
                  <button class="btn" type="button" data-x="retorno">Concluir pendência</button>
                  <span class="pn-sub" data-r="msg" style="color:var(--danger)"></span>
                </div>`
              : `<div class="pn-ok">Concluída (${esc(base.status[p.status] || p.status)})${p.retorno?.data ? ` em ${brd(p.retorno.data)}` : ""}${p.retorno?.nota ? " — " + esc(p.retorno.nota) : ""}</div>
                 <div class="pn-bar"><button class="btn" type="button" data-x="reabrir">Reabrir (voltar para Aguardando retorno)</button><span class="pn-sub" data-r="msg"></span></div>`}
            </div>
          </div>

          <div>
            <div class="pn-sub" style="margin-bottom:4px"><b>Mensagem de cobrança / WhatsApp</b></div>
            <textarea class="pn-msg" data-r="cob">${esc(txtCob)}</textarea>
            <div class="pn-bar" style="margin-top:6px">
              ${aguardando ? `<button class="btn primary" type="button" data-x="cobrar">🔔 Gerar e copiar nova cobrança</button>` : ""}
              <button class="btn" type="button" data-x="copiar-cob">Copiar texto acima</button>
            </div>
            <div class="pn-sub" style="margin-top:14px;margin-bottom:4px"><b>Histórico (${(p.cobrancas || []).length} cobrança${(p.cobrancas || []).length === 1 ? "" : "s"})</b></div>
            <ul class="pn-hist">${hist || "<li class='pn-sub'>Sem registros ainda.</li>"}</ul>
          </div>
        </div>
      </div>`;
    }

    function render() {
      el.querySelectorAll("[data-v]").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === visao));
      const ativas = lista.filter(p => p.status === "aguardando_retorno");
      const atr = ativas.filter(p => p.atrasada);
      const cont = f => {
        const m = {};
        ativas.forEach(p => { const [k, n] = f(p); if (!k) return; (m[k] ||= { n, total: 0, atr: 0 }).total++; if (p.atrasada) m[k].atr++; });
        return Object.values(m).sort((a, b) => b.total - a.total);
      };
      $("[data-box=kpis]").innerHTML = [
        [ativas.length, "Aguardando retorno"],
        [atr.length, "Atrasadas (para cobrar)", atr.length ? "alerta" : ""],
        ...Object.entries(base.tipos).map(([k, v]) => [ativas.filter(p => p.tipo === k).length, v]),
      ].map(([n, r, c]) => `<div class="pn-kpi ${c || ""}"><b>${n}</b><span>${esc(r)}</span></div>`).join("");

      const ul = arr => arr.length ? `<ul>${arr.slice(0, 6).map(x => `<li><span>${esc(x.n)}</span><span><b>${x.total}</b>${x.atr ? ` <span class="pn-st atr">${x.atr} atrasada${x.atr > 1 ? "s" : ""}</span>` : ""}</span></li>`).join("")}</ul>` : `<div class="pn-sub">Nenhuma pendência aguardando retorno.</div>`;
      $("[data-box=resumo]").innerHTML = `<div class="pn-card" style="margin:0"><div class="pn-sub" style="margin-bottom:6px"><b>Por atendimento</b></div>${ul(cont(p => [p.responsavel?.login, p.responsavel?.nome]))}</div>
        <div class="pn-card" style="margin:0"><div class="pn-sub" style="margin-bottom:6px"><b>Clientes com mais pendências</b></div>${ul(cont(p => [p.clienteId, p.clienteNome]))}</div>`;

      const l = filtrada();
      const box = $("[data-box=lista]");
      const msgVazio = {
        pendentes: "Nenhuma pendência aguardando retorno. Adicione uma pendência acima para acompanhar e cobrar.",
        atrasadas: "Nenhuma pendência atrasada no momento.",
        concluidas: "Nenhuma pendência concluída ainda.",
        todas: "Nenhuma pendência registrada ainda. Use os campos acima para registrar a primeira.",
      }[visao];
      box.innerHTML = l.length ? l.map(linha).join("") : `<div class="pn-vazio">${msgVazio}</div>`;

      const fEdit = box.querySelector('[data-x="form-edit-pen"]');
      if (fEdit) {
        const alvoFoco = fEdit.querySelector(`[data-e="${focoCampo}"]`) || fEdit.querySelector('[data-e="titulo"]');
        if (alvoFoco) setTimeout(() => alvoFoco.focus(), 10);
        fEdit.addEventListener("submit", async ev => {
          ev.preventDefault();
          const wrap = fEdit.closest("[data-edit-pen]");
          const id = wrap.dataset.editPen;
          const pAntiga = lista.find(x => x.id === id);
          const e = k => fEdit.querySelector(`[data-e="${k}"]`);
          const b = {
            id,
            titulo: e("titulo").value.trim(),
            clienteId: e("cliente").value,
            tipo: e("tipo").value,
            prazo: e("prazo").value,
            link: e("link").value.trim(),
            nota: e("nota").value.trim(),
          };
          if (base.gestao && e("resp")) b.responsavel = e("resp").value;
          const btnSalvar = e("salvar");
          if (btnSalvar) btnSalvar.disabled = true;
          try {
            const r = await api("salvar", b);
            lista = lista.map(q => q.id === id ? r.pendencia : q);
            aberta = null;
            const mudouPrazo = b.prazo !== (pAntiga?.prazo || "");
            ctx.toast(mudouPrazo && b.prazo ? `Pendência reprogramada para ${br(b.prazo)}` : "Pendência atualizada");
            render();
          } catch (er) {
            if (btnSalvar) btnSalvar.disabled = false;
            e("msg").textContent = er.message;
            ctx.toast(er.message);
          }
        });
      }
    }

    el.addEventListener("click", async ev => {
      const v = ev.target.closest("[data-v]")?.dataset.v;
      if (v) { visao = v; aberta = null; render(); return; }

      const atalho = ev.target.closest("[data-prazo-set]");
      if (atalho) {
        const wrap = atalho.closest("[data-edit-pen]");
        const inp = wrap?.querySelector('[data-e="prazo"]');
        if (inp) { inp.value = atalho.dataset.prazoSet; inp.focus(); }
        return;
      }

      const x = ev.target.closest("[data-x]")?.dataset.x;
      if (!x) return;

      const rowOrEdit = ev.target.closest("[data-id],[data-edit-pen]");
      const id = rowOrEdit?.dataset.id || rowOrEdit?.dataset.editPen || aberta;
      const btn = ev.target.closest("button");
      const travar = v => { if (btn) btn.disabled = v; };

      try {
        if (x === "editar") { aberta = aberta === id ? null : id; focoCampo = "titulo"; apagar = null; render(); return; }
        if (x === "reprogramar") { aberta = id; focoCampo = "prazo"; apagar = null; render(); return; }
        if (x === "cancelar-edicao") { aberta = null; render(); return; }
        if (x === "excluir") { apagar = id; render(); return; }
        if (x === "excluir-nao") { apagar = null; render(); return; }
        if (x === "excluir-sim") {
          travar(true);
          await api("excluir", { id });
          apagar = null;
          if (aberta === id) aberta = null;
          lista = lista.filter(q => q.id !== id);
          ctx.toast("Pendência excluída");
          opcoesFiltros();
          render();
          return;
        }
        if (x === "prazos") {
          const box = $("[data-box=prazos]");
          if (box.innerHTML) { box.innerHTML = ""; return; }
          box.innerHTML = `<div class="pn-card"><div class="pn-sub" style="margin-bottom:8px">Prazo padrão de retorno, em dias úteis, contado do registro:</div><div class="pn-grid">
            ${Object.entries(base.tipos).map(([k, v]) => `<label>${esc(v)}<input type="number" min="1" max="30" data-pz="${k}" value="${base.prazos[k]}"></label>`).join("")}</div>
            <div class="pn-bar"><button class="btn primary" type="button" data-x="salvar-prazos">Salvar prazos</button><button class="btn" type="button" data-x="prazos">Fechar</button><span class="pn-sub" data-pz="msg"></span></div></div>`;
          return;
        }
        if (x === "salvar-prazos") {
          travar(true);
          const prazos = Object.fromEntries([...el.querySelectorAll("input[data-pz]")].map(i => [i.dataset.pz, i.value]));
          const r = await api("config.salvar", { prazos });
          base.prazos = r.prazos;
          $("[data-box=prazos]").innerHTML = "";
          ctx.toast("Prazos padrão salvos");
          return;
        }
        if (x === "concluir-rapido") {
          travar(true);
          const r = await api("retorno", { id, status: "respondida", data: hoje, nota: "" });
          lista = lista.map(q => q.id === id ? r.pendencia : q);
          ctx.toast("Pendência concluída (retorno registrado)");
          render();
          return;
        }
        if (x === "reabrir-rapido" || x === "reabrir") {
          travar(true);
          const r = await api("retorno", { id, status: "aguardando_retorno", nota: "Reaberta" });
          lista = lista.map(q => q.id === id ? r.pendencia : q);
          ctx.toast("Pendência reaberta");
          render();
          return;
        }
        if (x === "retorno") {
          const wrap = ev.target.closest("[data-edit-pen]");
          const st = wrap.querySelector('[data-r="status"]').value;
          const dt = wrap.querySelector('[data-r="data"]').value;
          const nt = wrap.querySelector('[data-r="nota"]').value;
          travar(true);
          const r = await api("retorno", { id, status: st, data: dt, nota: nt });
          lista = lista.map(q => q.id === id ? r.pendencia : q);
          aberta = null;
          ctx.toast(st === "cancelada" ? "Pendência cancelada" : "Retorno do cliente registrado");
          render();
          return;
        }
        if (x === "cobrar-rapido" || x === "cobrar") {
          travar(true);
          const r = await api("cobranca", { id });
          cobranca[id] = r.mensagem;
          lista = lista.map(q => q.id === id ? r.pendencia : q);
          const copiou = await copiar(r.mensagem);
          const nCob = (r.pendencia.cobrancas || []).length;
          aberta = id;
          ctx.toast(copiou ? `${nCob}ª cobrança registrada e mensagem copiada!` : `${nCob}ª cobrança registrada! Copie a mensagem abaixo.`);
          render();
          return;
        }
        if (x === "copiar-cob") {
          const wrap = ev.target.closest("[data-edit-pen]");
          const ok = await copiar(wrap?.querySelector('[data-r="cob"]')?.value || "");
          ctx.toast(ok ? "Mensagem copiada!" : "Não foi possível copiar automaticamente.");
          return;
        }
        if (x === "csv") {
          const cel = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
          const linhas = [["Cliente", "Atendimento", "Tipo", "O que está pendente", "Link", "Data de registro", "Prazo de retorno", "Dias sem retorno", "Atrasada", "Status", "Cobranças", "Última atualização"].map(cel).join(";"),
            ...filtrada().map(p => [p.clienteNome, p.responsavel?.nome || "", base.tipos[p.tipo] || "", p.titulo, p.link || "", brd(dLocal(p.enviadoEm || p.criadoEm)), brd(p.prazo), p.status === "aguardando_retorno" ? p.diasSemRetorno : "",
              p.atrasada ? "sim" : "não", base.status[p.status] || p.status, (p.cobrancas || []).length, dataHora(p.atualizadoEm)].map(cel).join(";"))];
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
          a.download = `pendencias-de-clientes-${hoje}.csv`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          return;
        }
      } catch (e) {
        travar(false);
        ctx.toast(e.message);
      }
    });

    el.addEventListener("input", ev => { if (ev.target.dataset.f === "busca") render(); });
    el.addEventListener("change", ev => { if (ev.target.dataset.f) render(); });
    return () => carregar(true);
  }

  QZ.modulo({ id: "pendencias", iniciar(ctx) { if (!ctx.el) return; this._r = pendencias(ctx); if (!ctx.el.hidden) this._r(); }, aoMostrar() { if (this._r) this._r(); } });
})();
