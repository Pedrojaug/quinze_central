// 01 Atendimento > Minhas tarefas e Relatório das 20h (instrução 07).
// Tudo pela rota /api/m?r=tar/... (o servidor confere de quem é cada tarefa e quem configura o relatório).
(function () {
  if (window.__qzTar) return; window.__qzTar = true;

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const br = iso => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "");
  const brAno = iso => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "");
  const dataHora = iso => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  const somarDias = (iso, n) => {
    const dt = new Date((iso || new Date().toISOString().slice(0, 10)) + "T12:00:00Z");
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  };
  const proximoDiaUtil = iso => {
    let x = iso || new Date().toISOString().slice(0, 10);
    do { x = somarDias(x, 1); } while ([0, 6].includes(new Date(x + "T12:00:00Z").getUTCDay()));
    return x;
  };
  const proximaSegunda = iso => {
    let x = iso || new Date().toISOString().slice(0, 10);
    do { x = somarDias(x, 1); } while (new Date(x + "T12:00:00Z").getUTCDay() !== 1);
    return x;
  };
  async function copiar(txt) {
    try { await navigator.clipboard.writeText(txt); return true; } catch {}
    const ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { const ok = document.execCommand("copy"); ta.remove(); return ok; } catch { ta.remove(); return false; }
  }
  async function api(r, body) {
    const res = await fetch("/api/m?r=tar/" + r, { method: body ? "POST" : "GET", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j.msg || (res.status === 403 ? "Sem permissão." : "Não deu para concluir. Tente de novo.")), { code: j.code, status: res.status, dados: j });
    return j;
  }
  let base = null;
  const carregarBase = async (forcar = false) => {
    if (!base || forcar) base = await api("inicio");
    return base;
  };
  const REP = { "": "Não repete", diaria: "Diária (dias úteis)", semanal: "Semanal", mensal: "Mensal" };
  const PRI = { baixa: "Baixa", normal: "Normal", alta: "Alta" };
  const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  if (!document.getElementById("qzTarCss")) {
    const st = document.createElement("style"); st.id = "qzTarCss";
    st.textContent = `
      .tr-h{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px}.tr-h h2{margin:0}.tr-h .sp{flex:1}
      .tr-sub{font-size:12.5px;color:var(--ink2)}
      .tr-seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden}
      .tr-seg button{border:0;background:var(--card);padding:7px 14px;font:inherit;font-size:13.5px;cursor:pointer;color:var(--ink2)}
      .tr-seg button[aria-pressed="true"]{background:var(--blue);color:#fff}
      .tr-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:12px}
      .tr-add{display:grid;grid-template-columns:minmax(180px,2.2fr) minmax(140px,1.2fr) 130px 110px 150px auto;gap:8px;align-items:center}
      .tr-add.gestao{grid-template-columns:minmax(180px,2fr) minmax(130px,1.1fr) minmax(130px,1.1fr) 130px 100px 140px auto}
      @media(max-width:1000px){.tr-add,.tr-add.gestao{grid-template-columns:1fr 1fr}}
      .tr-list{display:flex;flex-direction:column}
      .tr-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 4px;border-top:1px solid var(--line2)}
      .tr-row:first-child{border-top:0}
      .tr-row.feita .tt{text-decoration:line-through;color:var(--ink2)}
      .tr-row.atrasada{background:#FFF6F5}
      .tr-chk{width:22px;height:22px;border-radius:50%;border:2px solid #9AA8BF;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;padding:0}
      .tr-row.feita .tr-chk{background:var(--ok);border-color:var(--ok)}
      .tr-chk:hover{border-color:var(--blue)}
      .tr-meta{font-size:12.5px;color:var(--ink2);display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:2px}
      .tr-prazo-btn{border:1px solid transparent;background:transparent;color:var(--ink2);font:inherit;font-size:12.5px;padding:1px 6px;margin:-1px -6px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
      .tr-prazo-btn:hover{background:#EEF3FB;border-color:#D0DDF2;color:var(--blue)}
      .tr-tag{font-size:11.5px;padding:1px 8px;border-radius:20px;font-weight:600;white-space:nowrap}
      .tr-tag.atr{background:#FDE8E8;color:#A12020}.tr-tag.alta{background:#FFF4DE;color:#8A5A00}.tr-tag.baixa{background:#EEF1F6;color:#56627A}
      .tr-tag.rep{background:#E5EFFC;color:#1D4F91}.tr-tag.dono{background:#F1ECFB;color:#55308F}.tr-tag.auto{background:#E6F6EC;color:#1B6B3A}
      .tr-act{display:flex;gap:6px}.tr-act .btn{padding:3px 10px;min-height:0;font-size:13px}
      .tr-edit{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;padding:12px 12px 12px 38px;border-top:1px dashed var(--line2);background:#FAFBFD;border-radius:0 0 8px 8px}
      .tr-edit label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--ink2)}.tr-edit .full{grid-column:1/-1}
      .tr-atalhos-data{display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-top:2px}
      .tr-atalho-btn{border:1px solid var(--line);background:#fff;color:var(--ink2);font:inherit;font-size:11.5px;padding:2px 8px;border-radius:14px;cursor:pointer}
      .tr-atalho-btn:hover{border-color:var(--blue);color:var(--blue);background:#F2F7FF}
      .tr-vazio{padding:22px;text-align:center;color:var(--ink2);font-size:14px}
      .tr-pre{white-space:pre-wrap;font:13.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;background:#F7FAF7;border:1px solid #D7E8DA;border-radius:10px;padding:12px 14px;margin:0 0 10px}
      .tr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
      .tr-grid label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--ink2)}
      .tr-dias{display:flex;gap:6px;flex-wrap:wrap}.tr-dias label{flex-direction:row;align-items:center;gap:4px;font-size:13px;color:var(--ink)}
      .tr-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
      .tr-tbl th{font-size:12px;color:var(--ink2);font-weight:600;text-align:left;padding:7px;border-bottom:1px solid var(--line)}
      .tr-tbl td{padding:7px;border-bottom:1px solid var(--line2);vertical-align:top}
      .tr-st{font-size:12px;padding:2px 8px;border-radius:20px;font-weight:600}.tr-st.enviado{background:#E6F6EC;color:#1B6B3A}.tr-st.falha{background:#FDE8E8;color:#A12020}.tr-st.parcial,.tr-st.enviando{background:#FFF4DE;color:#8A5A00}`;
    document.head.appendChild(st);
  }

  // ======================================================================
  // MINHAS TAREFAS
  // ======================================================================
  function minhas(ctx) {
    const el = ctx.el;
    let visao = "hoje", lista = [], aberta = null, focoCampo = "titulo", apagar = null;
    const opClientes = (sel, nomeAtual) => {
      const tem = !sel || base.clientes.some(c => c.id === sel);
      const extra = !tem ? `<option value="${esc(sel)}" selected>${esc(nomeAtual || sel)}</option>` : "";
      return `<option value="">Sem cliente</option>${extra}${base.clientes.map(c => `<option value="${esc(c.id)}"${c.id === sel ? " selected" : ""}>${esc(c.nome)}</option>`).join("")}`;
    };
    const opPessoas = (sel, vazio, nomeAtual) => {
      const tem = !sel || base.pessoas.some(p => p.login === sel);
      const extra = !tem ? `<option value="${esc(sel)}" selected>${esc(nomeAtual || sel)}</option>` : "";
      return `${vazio ? `<option value="">${vazio}</option>` : ""}${extra}${base.pessoas.map(p => `<option value="${esc(p.login)}"${p.login === sel ? " selected" : ""}>${esc(p.nome)}</option>`).join("")}`;
    };
    const opObj = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}"${k === sel ? " selected" : ""}>${v}</option>`).join("");

    async function montar() {
      try { await carregarBase(true); } catch (e) { el.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      const g = base.veTodas;
      el.innerHTML = `<div class="tr-h"><div><h2>Minhas tarefas</h2><div class="tr-sub">${g ? "Tarefas da equipe. Filtre por pessoa ou crie uma tarefa para alguém." : "Sua lista do dia. Tarefa atrasada continua aqui até ser concluída."}</div></div><span class="sp"></span>
        ${g ? `<label class="tr-sub">Pessoa <select data-x="pessoa">${opPessoas("", "Todas as pessoas")}</select></label>` : ""}
        <div class="tr-seg" role="group"><button type="button" data-v="hoje" aria-pressed="true">Hoje</button><button type="button" data-v="todas" aria-pressed="false">Todas</button><button type="button" data-v="concluidas" aria-pressed="false">Concluídas</button></div></div>
        <form class="tr-card" data-x="add"><div class="tr-add${g ? " gestao" : ""}">
          <input data-a="titulo" maxlength="200" placeholder="Nova tarefa… (Enter para adicionar)" aria-label="Título da tarefa">
          ${g ? `<select data-a="dono" aria-label="Responsável">${opPessoas("", "Para quem? (padrão: você)")}</select>` : ""}
          <select data-a="cliente" aria-label="Cliente">${opClientes("")}</select>
          <input type="date" data-a="prazo" value="${base.hoje}" aria-label="Prazo">
          <select data-a="prioridade" aria-label="Prioridade">${opObj(PRI, "normal")}</select>
          <select data-a="repetir" aria-label="Repetir">${opObj(REP, "")}</select>
          <button class="btn primary" type="submit">Adicionar</button></div><div class="tr-sub" data-a="msg" style="margin-top:6px"></div></form>
        <div class="tr-card"><div class="tr-list" data-box="lista"><div class="tr-vazio">Carregando…</div></div></div>`;
      el.querySelector('[data-x="add"]').addEventListener("submit", async ev => {
        ev.preventDefault();
        const f = n => el.querySelector(`[data-a="${n}"]`);
        if (!f("titulo").value.trim()) { f("titulo").focus(); return; }
        const b = { titulo: f("titulo").value, clienteId: f("cliente").value, prazo: f("prazo").value, prioridade: f("prioridade").value, repetir: f("repetir").value };
        if (g) b.dono = f("dono").value || fv("pessoa") || base.login;
        try {
          await api("tarefa.salvar", b);
          f("titulo").value = ""; f("msg").textContent = ""; f("titulo").focus();
          const msg = visao === "hoje" && b.prazo && b.prazo > base.hoje ? `Tarefa agendada para ${br(b.prazo)} (visível na aba Todas)` : "Tarefa adicionada";
          ctx.toast(msg);
          carregar();
        } catch (e) { f("msg").textContent = e.message; ctx.toast(e.message); }
      });
      carregar();
    }
    const fv = n => el.querySelector(`[data-x="${n}"]`)?.value || "";
    async function carregar() {
      if (!base) return montar();
      try {
        const r = await api(`tarefas&visao=${visao}${fv("pessoa") ? "&pessoa=" + encodeURIComponent(fv("pessoa")) : ""}`);
        if (r.hoje) base.hoje = r.hoje;
        lista = r.tarefas;
      } catch (e) { el.querySelector('[data-box="lista"]').innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      render();
    }
    function atalhosPrazoHtml() {
      const h = base.hoje;
      const amanha = somarDias(h, 1);
      const proxUtil = proximoDiaUtil(h);
      const proxSeg = proximaSegunda(h);
      const mais7 = somarDias(h, 7);
      const botoes = [
        ["Hoje", h],
        ["Amanhã", amanha],
        ...(proxUtil !== amanha ? [[`Próx. dia útil (${br(proxUtil)})`, proxUtil]] : []),
        ...(proxSeg !== amanha && proxSeg !== proxUtil ? [[`Próx. seg (${br(proxSeg)})`, proxSeg]] : []),
        [`+7 dias (${br(mais7)})`, mais7],
        ["Sem prazo", ""],
      ];
      return `<div class="tr-atalhos-data"><span class="tr-sub" style="font-size:11.5px">Reprogramar:</span>${botoes.map(([rotulo, val]) => `<button type="button" class="tr-atalho-btn" data-prazo-set="${val}">${rotulo}</button>`).join("")}</div>`;
    }
    function linha(t) {
      const feita = t.status === "concluida";
      const tags = [
        t.atrasada ? `<span class="tr-tag atr">Atrasada há ${t.diasAtraso} dia${t.diasAtraso > 1 ? "s" : ""}</span>` : "",
        t.prioridade !== "normal" ? `<span class="tr-tag ${t.prioridade}">${PRI[t.prioridade]}</span>` : "",
        t.repetir ? `<span class="tr-tag rep">↻ ${REP[t.repetir]}</span>` : "",
        t.origem && t.origem !== "manual" ? `<span class="tr-tag auto">Automática</span>` : "",
        base.veTodas ? `<span class="tr-tag dono">${esc(t.dono?.nome || "")}</span>` : "",
      ].join("");
      const prazoBtn = `<button type="button" class="tr-prazo-btn" data-t="reprogramar" title="Clique para reprogramar a data">${t.prazo ? `Prazo ${br(t.prazo)}` : "Sem prazo"} ✎</button>`;
      const meta = [t.clienteNome ? `<span>${esc(t.clienteNome)}</span>` : "", prazoBtn, feita ? `<span>Concluída em ${dataHora(t.concluidaEm)}</span>` : ""].filter(Boolean).join("<span>·</span>");
      return `<div class="tr-row${feita ? " feita" : ""}${t.atrasada ? " atrasada" : ""}" data-id="${esc(t.id)}">
        <button class="tr-chk" type="button" data-t="${feita ? "reabrir" : "concluir"}" title="${feita ? "Reabrir" : "Concluir"}" aria-label="${feita ? "Reabrir" : "Concluir"} ${esc(t.titulo)}">${feita ? "✓" : ""}</button>
        <div><div class="tt">${esc(t.titulo)}</div><div class="tr-meta">${meta}${tags}</div>${t.descricao ? `<div class="tr-sub" style="margin-top:3px;white-space:pre-wrap">${esc(t.descricao)}</div>` : ""}</div>
        <div class="tr-act">${apagar === t.id ? `<button class="btn" type="button" data-t="excluir-sim" style="color:var(--danger)">Excluir mesmo</button><button class="btn" type="button" data-t="excluir-nao">Não</button>`
          : `<button class="btn" type="button" data-t="editar">${aberta === t.id ? "Fechar" : "Editar"}</button><button class="btn" type="button" data-t="excluir" title="Excluir">✕</button>`}</div></div>
        ${aberta === t.id ? `<form class="tr-edit" data-edit-tar="${esc(t.id)}">
          <label class="full">Título<input data-e="titulo" maxlength="200" value="${esc(t.titulo)}"></label>
          <label class="full">Descrição (opcional)<textarea data-e="descricao" rows="2">${esc(t.descricao || "")}</textarea></label>
          ${base.veTodas ? `<label>Responsável<select data-e="dono">${opPessoas(t.dono?.login, "", t.dono?.nome)}</select></label>` : ""}
          <label>Cliente<select data-e="cliente">${opClientes(t.clienteId, t.clienteNome)}</select></label>
          <label>Prazo (data)<input type="date" data-e="prazo" value="${esc(t.prazo || "")}"></label>
          <label>Prioridade<select data-e="prioridade">${opObj(PRI, t.prioridade)}</select></label>
          <label>Repetir<select data-e="repetir">${opObj(REP, t.repetir || "")}</select></label>
          <div class="full">${atalhosPrazoHtml()}</div>
          <div class="full" style="display:flex;gap:8px;align-items:center;margin-top:2px"><button class="btn primary" type="submit" data-e="salvar">Salvar alterações</button><button class="btn" type="button" data-t="cancelar">Cancelar</button><span class="tr-sub" data-e="msg" style="color:var(--danger)"></span></div></form>` : ""}`;
    }
    function render() {
      el.querySelectorAll("[data-v]").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === visao));
      const box = el.querySelector('[data-box="lista"]');
      const vazio = { hoje: "Nada para hoje. Tarefas com prazo hoje, atrasadas ou sem prazo aparecem aqui.", todas: "Nenhuma tarefa ainda.", concluidas: "Nenhuma tarefa concluída nos últimos 30 dias." }[visao];
      box.innerHTML = lista.length ? lista.map(linha).join("") : `<div class="tr-vazio">${vazio}</div>`;
      const f = box.querySelector("[data-edit-tar]");
      if (f) {
        const alvoFoco = f.querySelector(`[data-e="${focoCampo}"]`) || f.querySelector('[data-e="titulo"]');
        if (alvoFoco) setTimeout(() => alvoFoco.focus(), 10);
        f.addEventListener("submit", async ev => {
          ev.preventDefault();
          const e = n => f.querySelector(`[data-e="${n}"]`);
          const id = f.dataset.editTar;
          const tAntiga = lista.find(x => x.id === id);
          const b = { id, titulo: e("titulo").value, descricao: e("descricao").value, clienteId: e("cliente").value, prazo: e("prazo").value, prioridade: e("prioridade").value, repetir: e("repetir").value };
          if (base.veTodas) b.dono = e("dono").value;
          const btnSalvar = e("salvar");
          if (btnSalvar) btnSalvar.disabled = true;
          try {
            await api("tarefa.salvar", b);
            aberta = null;
            const mudouPrazo = b.prazo !== (tAntiga?.prazo || "");
            let msg = "Tarefa salva";
            if (visao === "hoje" && b.prazo && b.prazo > base.hoje) msg = `Tarefa reprogramada para ${br(b.prazo)} (visível na aba Todas)`;
            else if (mudouPrazo && b.prazo) msg = `Tarefa reprogramada para ${br(b.prazo)}`;
            else if (mudouPrazo && !b.prazo) msg = "Tarefa salva sem prazo";
            ctx.toast(msg);
            carregar();
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
      if (v) { visao = v; aberta = null; carregar(); return; }
      const atalho = ev.target.closest("[data-prazo-set]");
      if (atalho) {
        const form = atalho.closest("[data-edit-tar]");
        const inp = form?.querySelector('[data-e="prazo"]');
        if (inp) { inp.value = atalho.dataset.prazoSet; inp.focus(); }
        return;
      }
      const t = ev.target.closest("[data-t]")?.dataset.t; if (!t) return;
      const id = ev.target.closest("[data-id],[data-edit-tar]")?.dataset.id || ev.target.closest("[data-edit-tar]")?.dataset.editTar;
      if (t === "editar") { aberta = aberta === id ? null : id; focoCampo = "titulo"; apagar = null; render(); return; }
      if (t === "reprogramar") { aberta = id; focoCampo = "prazo"; apagar = null; render(); return; }
      if (t === "cancelar") { aberta = null; render(); return; }
      if (t === "excluir") { apagar = id; render(); return; }
      if (t === "excluir-nao") { apagar = null; render(); return; }
      ev.target.disabled = true;
      try {
        if (t === "concluir") { const r = await api("tarefa.concluir", { id }); ctx.toast(r.proxima ? `Concluída. Próxima em ${br(r.proxima.prazo)}` : "Tarefa concluída"); }
        if (t === "reabrir") { await api("tarefa.reabrir", { id }); ctx.toast("Tarefa reaberta"); }
        if (t === "excluir-sim") { await api("tarefa.excluir", { id }); apagar = null; ctx.toast("Tarefa excluída"); }
        carregar();
      } catch (e) { ctx.toast(e.message); ev.target.disabled = false; }
    });
    el.addEventListener("change", ev => { if (ev.target.dataset.x === "pessoa") carregar(); });
    return async () => {
      if (!base) return montar();
      try { await carregarBase(true); } catch {}
      return carregar();
    };
  }

  // ======================================================================
  // RELATÓRIO DAS 20H (configuração, prévia e histórico: Mestre e gestão)
  // ======================================================================
  function relatorio(ctx) {
    const el = ctx.el;
    let ultimaPrevia = null;
    async function carregar() {
      let c, p, h;
      try { [c, p, h] = await Promise.all([api("relatorio.config"), api("relatorio.previa"), api("relatorio.historico")]); }
      catch (e) { el.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      ultimaPrevia = p;
      const cfg = c.config;
      el.innerHTML = `<div class="tr-h"><div><h2>Relatório das 20h</h2><div class="tr-sub">Uma mensagem no WhatsApp com o que cada atendimento fez no dia e o que ficou pendente.</div></div></div>
        ${c.whatsapp ? "" : `<div class="note warn" style="margin-bottom:12px"><b>Envio automático via API aguardando credenciais na Vercel</b> (faltam <code>WHATSAPP_API_URL</code> e <code>WHATSAPP_TOKEN</code>).<br>O envio manual está liberado: use o botão <b>Copiar relatório</b> abaixo para colar no WhatsApp a qualquer momento.</div>`}
        ${c.producao ? "" : `<div class="note" style="margin-bottom:12px">Este é um ambiente de teste: o envio automático vai só para o número de teste, nunca para o destino real.</div>`}
        <form class="tr-card" data-x="cfg"><h3 style="margin:0 0 10px;font-size:15px">Configuração</h3><div class="tr-grid">
          <label style="flex-direction:row;align-items:center;gap:8px;color:var(--ink)"><input type="checkbox" data-c="ativo"${cfg.ativo ? " checked" : ""}> Envio automático ligado</label>
          <label>Horário (Fortaleza)<select data-c="hora">${c.horas.map(x => `<option${x === cfg.hora ? " selected" : ""}>${x}</option>`).join("")}</select></label>
          <div><div class="tr-sub" style="margin-bottom:4px">Dias</div><div class="tr-dias">${DIAS.map((d, i) => `<label><input type="checkbox" data-dia="${i}"${cfg.dias.includes(i) ? " checked" : ""}> ${d}</label>`).join("")}</div></div>
          <label>Destino (números com DDI e DDD, separados por vírgula)<input data-c="destino" value="${esc(cfg.destino)}" placeholder="${c.destinoVercel.length ? "Vazio = o da Vercel (" + esc(c.destinoVercel.join(", ")) + ")" : "Ex.: 5585999999999 ou id-do-grupo@g.us"}"></label>
          <label>Número de teste (para onde vai o botão de teste)<input data-c="numeroTeste" value="${esc(cfg.numeroTeste)}" placeholder="${c.testeVercel.length ? "Vazio = o da Vercel (" + esc(c.testeVercel.join(", ")) + ")" : "Ex.: 5585999999999 ou id-do-grupo@g.us"}"></label></div>
          <p class="tr-sub" style="margin:10px 0 0">O envio sai na primeira passada da rotina depois do horário escolhido (a Vercel passa uma vez por hora; pode chegar até cerca de 1 hora depois). Nunca sai duas vezes no mesmo dia.</p>
          <div style="display:flex;gap:8px;align-items:center;margin-top:10px"><button class="btn primary" type="submit">Salvar configuração</button><span class="tr-sub" data-c="msg" style="color:var(--danger)"></span></div></form>
        <div class="tr-card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><h3 style="margin:0;font-size:15px">Prévia do relatório de hoje</h3><span class="tr-sub">${p.partes.length > 1 ? `${p.partes.length} mensagens (dividido para caber no WhatsApp)` : "1 mensagem"}</span><span style="flex:1"></span>
          <button class="btn primary" type="button" data-x="copiar-tudo">Copiar relatório</button>
          <button class="btn" type="button" data-x="teste"${c.whatsapp ? "" : " disabled"} title="${c.whatsapp ? "Enviar teste para o número de teste" : "Requer WHATSAPP_API_URL e WHATSAPP_TOKEN na Vercel"}">Enviar agora (teste)</button>
          <button class="btn" type="button" data-x="enviar-oficial"${c.whatsapp ? "" : " disabled"} title="${c.whatsapp ? "Enviar relatório oficial do dia para os números de Destino" : "Requer WHATSAPP_API_URL e WHATSAPP_TOKEN na Vercel"}">Enviar relatório oficial</button><span class="tr-sub" data-x="tmsg" style="color:var(--danger)"></span></div>
          ${p.partes.map((x, idx) => `<div style="margin-bottom:12px"><pre class="tr-pre">${esc(x)}</pre>${p.partes.length > 1 ? `<div style="margin-top:4px;display:flex;justify-content:flex-end"><button class="btn small" type="button" data-x="copiar-parte" data-idx="${idx}">Copiar parte ${idx + 1}</button></div>` : ""}</div>`).join("")}</div>
        <div class="tr-card"><h3 style="margin:0 0 10px;font-size:15px">Histórico de envios</h3>
          ${h.historico.length ? `<table class="tr-tbl"><thead><tr><th>Dia</th><th>Tipo</th><th>Status</th><th>Mensagens</th><th>Quando</th><th>Erro</th></tr></thead><tbody>
          ${h.historico.map(x => `<tr><td>${brAno(x.data)}</td><td>${x.tipo === "teste" ? "Teste" + (x.por ? " (" + esc(x.por.nome) + ")" : "") : x.somenteTeste ? "Diário (só nº de teste)" : "Diário"}</td><td><span class="tr-st ${esc(x.status)}">${esc(x.status)}</span></td><td>${x.partes || ""}</td><td>${dataHora(x.fim || x.em || x.inicio)}</td><td class="tr-sub">${esc(x.erro || (x.resultados || []).find(r => !r.ok)?.erro || "")}</td></tr>`).join("")}</tbody></table>`
          : `<div class="tr-vazio">Nenhum envio ainda.</div>`}</div>`;
      el.querySelector('[data-x="cfg"]').addEventListener("submit", async ev => {
        ev.preventDefault();
        const q = n => el.querySelector(`[data-c="${n}"]`);
        const ativo = q("ativo").checked;
        const destino = q("destino").value.trim();
        if (ativo && !destino && !c.destinoVercel.length) {
          q("msg").textContent = "Para ligar o envio automático, preencha os números de destino.";
          q("destino").focus();
          return;
        }
        q("msg").textContent = "";
        const b = { ativo, hora: q("hora").value, dias: [...el.querySelectorAll("[data-dia]")].filter(x => x.checked).map(x => +x.dataset.dia), destino, numeroTeste: q("numeroTeste").value };
        try { await api("relatorio.config.salvar", b); ctx.toast("Configuração salva"); carregar(); } catch (e) { q("msg").textContent = e.message; }
      });
    }
    el.addEventListener("click", async ev => {
      const btn = ev.target.closest("[data-x]");
      if (!btn || !ultimaPrevia) return;
      const x = btn.dataset.x;
      if (x === "copiar-tudo") {
        const texto = ultimaPrevia.partes.join("\n\n---\n\n");
        const ok = await copiar(texto);
        ctx.toast(ok ? "Relatório copiado! Cole no WhatsApp." : "Não foi possível copiar. Selecione o texto manualmente.");
        return;
      }
      if (x === "copiar-parte") {
        const idx = Number(btn.dataset.idx);
        const texto = ultimaPrevia.partes[idx] || "";
        const ok = await copiar(texto);
        ctx.toast(ok ? `Parte ${idx + 1} copiada!` : "Não foi possível copiar.");
        return;
      }
      if (x === "teste") {
        btn.disabled = true; el.querySelector('[data-x="tmsg"]').textContent = "Enviando…";
        try { const r = await api("relatorio.teste", {}); ctx.toast(`Teste enviado (${r.partes} mensagem${r.partes > 1 ? "s" : ""})`); carregar(); }
        catch (e) { el.querySelector('[data-x="tmsg"]').textContent = e.message; btn.disabled = false; }
        return;
      }
      if (x === "enviar-oficial") {
        if (!confirm("Enviar agora o relatório oficial de hoje para os números de Destino configurados?")) return;
        btn.disabled = true; el.querySelector('[data-x="tmsg"]').textContent = "Enviando relatório oficial…";
        try { const r = await api("relatorio.enviar", {}); ctx.toast(`Relatório oficial enviado (${r.partes} mensagem${r.partes > 1 ? "s" : ""})`); carregar(); }
        catch (e) { el.querySelector('[data-x="tmsg"]').textContent = e.message; btn.disabled = false; }
        return;
      }
    });
    return carregar;
  }

  const MONTAR = { tarefas: minhas, relatorio20h: relatorio };
  Object.entries(MONTAR).forEach(([id, montar]) => {
    let recarregar = null;
    QZ.modulo({ id, iniciar(ctx) { if (!ctx.el) return; recarregar = montar(ctx); if (!ctx.el.hidden) recarregar(); }, aoMostrar() { if (recarregar) recarregar(); } });
  });
})();
