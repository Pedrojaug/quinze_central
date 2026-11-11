// 02 Aprovação de peças: Envio, Fila de aprovação e Dashboard mensal.
// Tudo pela rota /api/m?r=pec/... (o servidor confere quem envia, quem decide e quem vê).
// Os arquivos vão do navegador direto para o armazenamento, com um token de envio gerado pelo servidor para cada arquivo.
(function () {
  if (window.__qzPec) return; window.__qzPec = true;

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brHora = iso => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  const brDia = iso => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");
  const mesBr = m => (m ? ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][+m.slice(5, 7) - 1] + " de " + m.slice(0, 4) : "");
  const mb = n => (n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

  const hojeSp = () => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  };
  const somarDiasIso = (iso, n) => {
    const [y, m, d] = String(iso).split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n, 12));
    return dt.toISOString().slice(0, 10);
  };
  const diaSpDeIso = iso => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (isNaN(d)) return "";
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
    } catch { return ""; }
  };
  const intervaloPeriodo = tipo => {
    const h = hojeSp();
    if (tipo === "hoje") return { de: h, ate: h, rotulo: "Hoje (" + brDia(h + "T12:00:00Z") + ")" };
    if (tipo === "ontem") {
      const ont = somarDiasIso(h, -1);
      return { de: ont, ate: ont, rotulo: "Ontem (" + brDia(ont + "T12:00:00Z") + ")" };
    }
    if (tipo === "semana") {
      const [y, m, d] = h.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d, 12));
      const diaSem = dt.getUTCDay();
      const volta = diaSem === 0 ? 6 : diaSem - 1;
      const seg = somarDiasIso(h, -volta);
      return { de: seg, ate: h, rotulo: "Essa semana (" + brDia(seg + "T12:00:00Z") + " a " + brDia(h + "T12:00:00Z") + ")" };
    }
    if (tipo === "mes" || tipo === "este_mes") {
      const inicio = h.slice(0, 7) + "-01";
      return { de: inicio, ate: h, rotulo: "Esse mês (" + brDia(inicio + "T12:00:00Z") + " a " + brDia(h + "T12:00:00Z") + ")" };
    }
    return { de: null, ate: null, rotulo: "" };
  };
  const pecaBatePeriodo = (p, statusFiltro, de, ate) => {
    if (!de && !ate) return true;
    if (["aprovada", "reprovada", "alteracao_solicitada"].includes(statusFiltro)) {
      const ev = (p.historico || []).slice().reverse().find(h => h.tipo === statusFiltro);
      const dia = diaSpDeIso(ev?.em || p.decididoEm || p.atualizadoEm);
      if (!dia) return false;
      return (!de || dia >= de) && (!ate || dia <= ate);
    }
    if (statusFiltro === "pendente") {
      const ultV = p.versoes && p.versoes[p.versoes.length - 1];
      const dia = diaSpDeIso(ultV?.enviadaEm || p.atualizadoEm || p.criadoEm);
      if (!dia) return false;
      return (!de || dia >= de) && (!ate || dia <= ate);
    }
    const datas = [];
    if (p.decididoEm) datas.push(diaSpDeIso(p.decididoEm));
    if (p.criadoEm) datas.push(diaSpDeIso(p.criadoEm));
    if (p.atualizadoEm) datas.push(diaSpDeIso(p.atualizadoEm));
    for (const v of p.versoes || []) if (v.enviadaEm) datas.push(diaSpDeIso(v.enviadaEm));
    for (const h of p.historico || []) if (h.em) datas.push(diaSpDeIso(h.em));
    return datas.some(dia => (!de || dia >= de) && (!ate || dia <= ate));
  };
  async function api(r, body) {
    const res = await fetch("/api/m?r=pec/" + r, { method: body ? "POST" : "GET", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j.msg || (res.status === 403 ? "Sem permissão." : "Não deu para concluir. Tente de novo.")), { code: j.code, status: res.status });
    return j;
  }
  let base = null;
  const carregarBase = async () => (base ||= await api("inicio"));
  const arqUrl = (p, v, a) => `/api/m?r=pec/peca.arquivo&id=${encodeURIComponent(p.id)}&v=${v.n}&i=${a.i}`;
  const ST = { pendente: "Pendente", aprovada: "Aprovada", reprovada: "Reprovada", alteracao_solicitada: "Alteração solicitada" };
  const ACAO = { envio: "enviou", reenvio: "reenviou", edicao_aprovada: "editou material aprovado", edicao: "editou material", aprovada: "aprovou", reprovada: "reprovou", alteracao_solicitada: "pediu alteração", comentario: "comentou" };

  // Extrai o ID do arquivo em links do Google Drive (para incorporar player de vídeo / Reels)
  function extrairDriveFileId(urlBruta) {
    const s = String(urlBruta || "").trim();
    if (!s) return "";
    const m1 = /\/file\/d\/([A-Za-z0-9_-]{10,})/.exec(s);
    if (m1) return m1[1];
    const m2 = /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s);
    if (m2) return m2[1];
    return "";
  }

  // Modal de confirmação com Senha Mestre para apagar peça ou fila
  function pedirSenhaMestre(titulo, descricao) {
    return new Promise(resolve => {
      let dlg = document.getElementById("qzDlgMestrePecas");
      if (!dlg) {
        dlg = document.createElement("dialog");
        dlg.id = "qzDlgMestrePecas";
        dlg.style.cssText = "border:1px solid var(--line);border-radius:14px;padding:20px 22px;max-width:420px;width:92vw;box-shadow:0 18px 48px rgba(0,0,0,.18)";
        document.body.appendChild(dlg);
      }
      dlg.innerHTML = `<form method="dialog" style="margin:0">
        <h3 style="margin:0 0 6px;font-size:17px">${esc(titulo)}</h3>
        <p class="pc-sub" style="margin:0 0 12px">${esc(descricao)}</p>
        <label style="display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600;color:var(--ink2)">
          Senha mestre
          <input type="password" id="qzInpMestrePecas" placeholder="Digite a senha mestre…" autocomplete="current-password" style="width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:8px">
        </label>
        <div class="pc-bar" style="justify-content:flex-end;margin-top:14px">
          <button class="btn" type="button" id="qzNoMestrePecas">Cancelar</button>
          <button class="btn primary" type="submit" id="qzOkMestrePecas" style="background:var(--danger);border-color:var(--danger)">Confirmar exclusão</button>
        </div>
      </form>`;
      const inp = dlg.querySelector("#qzInpMestrePecas");
      const fechar = val => { try { dlg.close(); } catch {} resolve(val); };
      dlg.querySelector("#qzNoMestrePecas").onclick = () => fechar(null);
      dlg.querySelector("form").onsubmit = ev => { ev.preventDefault(); fechar(inp.value.trim() || null); };
      dlg.oncancel = () => resolve(null);
      dlg.showModal();
      setTimeout(() => inp.focus(), 30);
    });
  }

  if (!document.getElementById("qzPecCss")) {
    const st = document.createElement("style"); st.id = "qzPecCss";
    st.textContent = `
      .pc-h{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px}.pc-h h2{margin:0}.pc-h .sp{flex:1}
      .pc-sub{font-size:12.5px;color:var(--ink2)}
      .pc-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:12px}
      .pc-card.form{border-color:var(--blue);padding:18px 20px}
      .pc-top{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}.pc-top .t{flex:1;min-width:200px}.pc-top b{font-size:15px}
      .pc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
      .pc-grid label{display:flex;flex-direction:column;gap:5px;font-size:13px;color:var(--ink2)}.pc-grid .full{grid-column:1/-1}
      .pc-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px}
      .pc-cli{display:inline-block;background:var(--blue-soft);color:var(--blue-dk);font-size:12px;font-weight:600;padding:2px 8px;border-radius:6px;border:1px solid rgba(6,96,255,0.18)}
      .pc-req{color:var(--danger);font-weight:700;margin-left:2px}
      .st{font-size:12px;padding:2px 9px;border-radius:20px;white-space:nowrap;font-weight:600}
      .st.pendente{background:#FFF4DE;color:#8A5A00}.st.aprovada{background:#E6F6EC;color:#1B6B3A}
      .st.reprovada{background:#FDE8E8;color:#A12020}.st.alteracao_solicitada{background:#E5EFFC;color:#1D4F91}
      .pc-drop{border:2px dashed rgba(6,96,255,0.42);border-radius:14px;padding:34px 24px;min-height:145px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;color:var(--ink2);font-size:14px;cursor:pointer;background:linear-gradient(180deg,#F8FAFF 0%,#F0F6FF 100%);transition:all .15s ease}
      .pc-drop:hover,.pc-drop.on{border-color:var(--blue);background:var(--blue-soft);box-shadow:0 6px 18px rgba(6,96,255,0.08)}
      .pc-drop .ico{font-size:32px;line-height:1;margin-bottom:2px}
      .pc-drop .cta{font-size:15.5px;font-weight:600;color:var(--ink)}
      .pc-drop .cta u{color:var(--blue)}
      .pc-drop .hint{font-size:12.5px;color:var(--ink2)}
      .pc-reels-box{margin-top:10px;padding:12px 14px;border:1px solid #D0E0FF;border-radius:10px;background:#F6F9FF}
      .pc-reels-box b{display:flex;align-items:center;gap:6px;font-size:13.5px;color:var(--ink);margin-bottom:4px}
      .pc-step{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:6px}
      .pc-step b{font-size:14px;font-weight:600;color:var(--ink)}
      .pc-opc{border:1px solid var(--line);border-radius:10px;background:#FAFBFD;padding:14px 16px;margin-top:4px}
      .pc-opc-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--line2)}
      .pc-opc-h b{font-size:13.5px;color:var(--ink)}
      .pc-badge-opc{font-size:11.5px;font-weight:600;color:var(--ink2);background:#EEF2F7;padding:2px 9px;border-radius:99px}
      .pc-fs{margin-top:10px;display:grid;gap:6px}
      .pc-f{display:grid;grid-template-columns:minmax(0,1fr) auto 120px 70px auto;gap:8px;align-items:center;font-size:13px;padding:6px 10px;border:1px solid var(--line2);border-radius:8px;background:#fff}
      .pc-f .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
      .pc-prog{height:6px;background:var(--line2);border-radius:4px;overflow:hidden}.pc-prog i{display:block;height:100%;background:var(--blue);width:0;transition:width .15s}
      .pc-f.ok .pc-prog i{background:var(--ok)}.pc-f.erro{color:var(--danger)}
      .pc-thumbs{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;align-items:flex-start}
      .pc-th{width:120px;height:96px;border:1px solid var(--line);border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#F6F8FB;font-size:12px;color:var(--ink2);text-align:center;text-decoration:none}
      .pc-th img{width:100%;height:100%;object-fit:cover}
      .pc-th.exp{border-style:dashed;padding:6px}
      .pc-reel-wrap{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}
      .pc-reel-card{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#0F172A;width:260px;max-width:100%}
      .pc-reel-card iframe,.pc-reel-card video{width:100%;height:380px;border:0;display:block;background:#000}
      .pc-reel-foot{display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:#FAFBFD;border-top:1px solid var(--line);font-size:12px}
      .pc-links{margin:6px 0 0;padding-left:18px;font-size:13px}
      .pc-ver{border-top:1px solid var(--line2);margin-top:10px;padding-top:10px}
      .pc-ver summary{cursor:pointer;font-size:13px;color:var(--ink2)}
      .pc-hist{margin:8px 0 0;padding:0;list-style:none;font-size:13px}
      .pc-hist li{padding:6px 0;border-top:1px solid var(--line2)}.pc-hist li:first-child{border-top:0}
      .pc-hist .c{display:block;margin-top:2px;white-space:pre-wrap;color:var(--ink)}
      .pc-dec{background:#FAFBFD;border:1px solid var(--line2);border-radius:10px;padding:10px 12px;margin-top:12px}
      .pc-dec textarea{width:100%;min-height:56px}
      .pc-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px}
      .pc-filtros label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--ink2)}
      .pc-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
      .pc-kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
      .pc-kpi b{display:block;font:700 26px/1 var(--display);font-variant-numeric:tabular-nums}.pc-kpi span{font-size:13px;color:var(--ink2)}
      .pc-kpi em{display:block;font-style:normal;font-size:12px;color:var(--ink2);margin-top:3px}
      .pc-tbl{width:100%;border-collapse:collapse;font-size:14px}
      .pc-tbl th{font-size:12.5px;color:var(--ink2);font-weight:600;text-align:left;padding:8px;border-bottom:1px solid var(--line)}
      .pc-tbl td{padding:8px;border-bottom:1px solid var(--line2)}.pc-tbl .num{text-align:right;font-variant-numeric:tabular-nums}
      .pc-barras{display:grid;gap:8px}.pc-barras .l{display:grid;grid-template-columns:160px minmax(0,1fr) 40px;gap:10px;align-items:center;font-size:13px}
      .pc-barras .b{height:14px;background:var(--line2);border-radius:4px;overflow:hidden}.pc-barras .b i{display:block;height:100%;background:var(--blue)}
      .pc-barras .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pc-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:900px){.pc-2{grid-template-columns:1fr}}
      .pc-vazio{padding:18px;text-align:center;color:var(--ink2);font-size:14px}
      /* Horários de pico */
      .pc-pico-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;background:rgba(37,99,235,0.1);color:var(--blue);font-size:13px;font-weight:600}
      .pc-pico-badge.destaque{background:rgba(234,88,12,0.12);color:#c2410c;border:1px solid rgba(234,88,12,0.25)}
      .pc-histog-wrap{overflow-x:auto;padding:6px 0 4px}
      .pc-histog{display:flex;align-items:flex-end;gap:5px;height:150px;min-width:620px;padding:16px 4px 0;border-bottom:2px solid var(--line)}
      .pc-col-h{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end;position:relative;cursor:pointer}
      .pc-col-h:hover .pc-col-bar{filter:brightness(1.15)}
      .pc-col-num{font-size:11px;font-weight:700;color:var(--ink2);margin-bottom:3px;line-height:1}
      .pc-col-h.pico .pc-col-num{color:#c2410c;font-size:12px}
      .pc-col-bar{width:100%;max-width:26px;min-width:8px;background:var(--blue);border-radius:4px 4px 0 0;transition:height .25s ease,background-color .2s ease}
      .pc-col-bar.zerada{background:var(--line2);height:3px !important;opacity:.45}
      .pc-col-h.pico .pc-col-bar{background:linear-gradient(180deg,#f97316 0%,#ea580c 100%);box-shadow:0 2px 6px rgba(234,88,12,.28)}
      .pc-col-rotulo{margin-top:6px;font-size:10.5px;color:var(--ink2);font-variant-numeric:tabular-nums;text-align:center}
      .pc-col-h.pico .pc-col-rotulo{color:#c2410c;font-weight:700}
      .pc-turnos-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:10px}
      .pc-turno-card{background:var(--card);border:1px solid var(--line2);border-radius:8px;padding:7px 10px;font-size:12px}
      .pc-turno-card b{display:block;font-size:15px;color:var(--ink);margin-top:2px}
      .pc-turno-card span{color:var(--ink2)}`;
    document.head.appendChild(st);
  }

  // ---------- Envio dos arquivos direto ao armazenamento ----------
  function enviarArquivo(file, onProg) {
    return new Promise(async (ok, erro) => {
      let t;
      try { t = await api("upload.token", { nome: file.name, tipo: file.type, tamanho: file.size }); } catch (e) { return erro(e); }
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", t.url, true);
      Object.entries(t.headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.setRequestHeader("x-content-type", t.tipo);
      xhr.setRequestHeader("x-content-length", String(file.size));
      xhr.setRequestHeader("x-api-blob-request-id", Math.random().toString(16).slice(2) + Date.now());
      xhr.setRequestHeader("x-api-blob-request-attempt", "0");
      xhr.upload.onprogress = e => { if (e.lengthComputable) onProg(e.loaded / e.total); };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? ok({ chave: t.chave, nome: file.name }) : erro(new Error("O armazenamento recusou o arquivo (" + xhr.status + ").")));
      xhr.onerror = () => erro(new Error("Falha de conexão no envio."));
      xhr.send(file);
    });
  }

  // Título padrão automático por cliente: "Peça #X | Nome do Cliente"
  function tituloPadraoCliente(clienteId) {
    const cli = (base?.clientes || []).find(c => c.id === clienteId);
    if (!cli) return "Peça #1 | Nome do Cliente";
    const prox = (Number((base?.seqClientes || {})[clienteId]) || 0) + 1;
    return `Peça #${prox} | ${cli.nome}`;
  }

  // Formulário de envio (nova peça ou nova versão). Devolve um controlador com o HTML montado no "alvo".
  function formEnvio(alvo, { titulo, peca, aoEnviar, aoCancelar }) {
    const nova = !peca;
    const arquivos = [];   // { file, chave, prog, erro, el }
    alvo.innerHTML = `<div class="pc-card form"><h3 style="margin:0 0 14px">${esc(titulo)}</h3><div class="pc-grid">
      ${nova ? `<div class="full">
        <div class="pc-step"><b>1. Cliente <span class="pc-req">*</span></b><span class="pc-sub">Obrigatório</span></div>
        <select data-f="cliente" style="width:100%;font-size:14.5px;padding:10px 12px;font-weight:500">
          <option value="">${base.clientes?.length ? "Escolha o cliente…" : "Nenhum cliente disponível"}</option>
          ${base.clientes.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join("")}
        </select>
      </div>` : ""}
      <div class="full">
        <div class="pc-step"><b>${nova ? "2. Material para aprovação (Arquivo ou Reels do Google Drive)" : "Material da nova versão"} <span class="pc-req">*</span></b><span class="pc-sub">Até ${base.maxArquivos} arquivos · JPG, PNG, PDF ou Vídeo · até ${base.maxMB} MB</span></div>
        <div class="pc-drop" data-f="drop">
          <div class="ico">📤</div>
          <div class="cta">Arraste os arquivos da peça aqui ou <u>clique para escolher no computador</u></div>
          <div class="hint">Imagens (JPG, PNG), PDF ou Vídeo (MP4, MOV) · Ou cole abaixo o link de Reels/Vídeo do Google Drive</div>
        </div>
        <input type="file" data-f="file" multiple accept=".jpg,.jpeg,.png,.pdf,.mp4,.mov,.webm,image/jpeg,image/png,application/pdf,video/mp4,video/quicktime,video/webm" hidden>
        <div class="pc-fs" data-f="lista"></div>
        <div class="pc-reels-box">
          <b>🎬 Carregar Reels / Vídeo por link do Google Drive</b>
          <div class="pc-sub" style="margin-bottom:6px">Cole o link compartilhado do Google Drive (<code>https://drive.google.com/file/d/...</code>). O vídeo será carregado como player de Reels direto na fila de aprovação!</div>
          <textarea data-f="links" rows="2" placeholder="https://drive.google.com/file/d/.../view?usp=sharing (um link por linha)" style="width:100%"></textarea>
          <div data-f="reels-preview" class="pc-sub" style="margin-top:4px;color:var(--ok);font-weight:600"></div>
        </div>
      </div>
      <div class="full pc-opc">
        <div class="pc-opc-h"><b>${nova ? "3. Detalhes adicionais" : "Detalhes adicionais"}</b><span class="pc-badge-opc">Tudo opcional</span></div>
        <div class="pc-grid">
          <label class="full">Título da peça <span class="pc-sub">(opcional)</span>
            <input data-f="titulo" maxlength="160" placeholder="${nova ? "Automático: Peça #1 | Nome do Cliente" : "Manter título atual"}" value="${!nova && peca ? esc(peca.titulo || "") : ""}">
            ${nova ? '<span class="pc-sub" data-f="titulo-hint">Se deixar em branco, será salvo como <b>Peça #X | Nome do Cliente</b>.</span>' : '<span class="pc-sub">Se desejar, ajuste o título da peça para esta nova versão.</span>'}
          </label>
          <label class="full">Observação / Legenda <span class="pc-sub">(opcional)</span>
            <textarea data-f="obs" rows="2" placeholder="${nova ? "Contexto, legenda ou orientações para quem vai aprovar" : "O que mudou nesta versão"}"></textarea>
          </label>
          ${nova ? `<div class="full"><label class="pc-sub" style="margin-bottom:6px;display:block">Quem vai aprovar? (opcional · todos os coordenadores têm direito de aprovar)</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;max-height:120px;overflow-y:auto">
              ${(base.usuarios || []).map(u => `<label style="display:inline-flex;gap:6px;align-items:center;padding:4px 8px;border:1px solid var(--line2);border-radius:6px;background:#FAFBFD;font-size:12.5px;cursor:pointer">
                <input type="checkbox" data-f="aprovador" value="${esc(u.login)}" style="min-height:0;width:14px;height:14px">
                <span>${esc(u.nome || u.login)}</span>
              </label>`).join("") || '<span class="pc-sub" style="padding:4px 0">Qualquer coordenador poderá aprovar.</span>'}
            </div>
          </div>` : ""}
        </div>
      </div></div>
      <div class="pc-bar"><button class="btn primary" type="button" data-f="ok">${nova ? "Enviar peça" : "Enviar nova versão"}</button><button class="btn" type="button" data-f="cancelar">Cancelar</button><span class="pc-sub" data-f="msg"></span></div>
      <p class="pc-sub" style="margin:8px 0 0">Os arquivos enviados ficam disponíveis por ${base.retencaoDias} dias. Links de Reels/Vídeos do Google Drive não expiram.</p></div>`;
    const $ = s => alvo.querySelector(`[data-f="${s}"]`);
    const msg = t => { $("msg").textContent = t; };
    const pintar = a => {
      a.el.className = "pc-f" + (a.erro ? " erro" : a.chave ? " ok" : "");
      a.el.innerHTML = `<span class="n" title="${esc(a.file.name)}">${esc(a.file.name)}</span><span class="pc-sub">${mb(a.file.size)}</span><span class="pc-prog"><i style="width:${Math.round(a.prog * 100)}%"></i></span>
        <span class="pc-sub">${a.erro ? "erro" : a.chave ? "enviado" : Math.round(a.prog * 100) + "%"}</span><button class="btn" type="button" style="padding:2px 8px;min-height:0" title="Remover">✕</button>`;
      a.el.querySelector("button").onclick = () => { arquivos.splice(arquivos.indexOf(a), 1); a.el.remove(); };
      if (a.erro) a.el.querySelector(".pc-sub").title = a.erro;
    };
    const atualizarTituloPadrao = () => {
      if (!nova) return;
      const cid = $("cliente").value;
      const padrao = tituloPadraoCliente(cid);
      $("titulo").placeholder = cid ? `Padrão automático: ${padrao}` : "Automático: Peça #1 | Nome do Cliente";
      if ($("titulo-hint")) {
        $("titulo-hint").innerHTML = cid
          ? `Se deixar em branco, será salvo como <b>${esc(padrao)}</b>.`
          : `Se deixar em branco, será salvo como <b>Peça #X | Nome do Cliente</b>.`;
      }
    };
    const adicionar = files => {
      for (const file of files) {
        if (arquivos.length >= base.maxArquivos) { msg(`No máximo ${base.maxArquivos} arquivos.`); break; }
        if (!/\.(jpe?g|png|pdf|mp4|mov|webm)$/i.test(file.name)) { msg(`"${file.name}": envie JPG, PNG, PDF ou Vídeo (MP4/MOV/WEBM).`); continue; }
        if (file.size > base.maxMB * 1048576) { msg(`"${file.name}" passa de ${base.maxMB} MB.`); continue; }
        const a = { file, prog: 0, chave: null, erro: null, el: document.createElement("div") };
        arquivos.push(a); $("lista").appendChild(a.el); pintar(a);
        a.promessa = enviarArquivo(file, p => { a.prog = p; pintar(a); })
          .then(r => { a.chave = r.chave; a.prog = 1; pintar(a); }, e => { a.erro = e.message; pintar(a); });
      }
    };
    $("drop").onclick = () => $("file").click();
    $("file").onchange = () => { adicionar([...$("file").files]); $("file").value = ""; };
    $("drop").ondragover = e => { e.preventDefault(); $("drop").classList.add("on"); };
    $("drop").ondragleave = () => $("drop").classList.remove("on");
    $("drop").ondrop = e => { e.preventDefault(); $("drop").classList.remove("on"); adicionar([...e.dataTransfer.files]); };
    $("links").oninput = () => {
      const ls = $("links").value.split(/\s+/).map(s => s.trim()).filter(Boolean);
      const comId = ls.filter(l => extrairDriveFileId(l));
      $("reels-preview").textContent = comId.length ? `✓ ${comId.length} vídeo(s)/Reels do Google Drive pronto(s) para incorporar como player.` : "";
    };
    if (nova) {
      $("cliente").onchange = () => {
        atualizarTituloPadrao();
        if ($("cliente").value && $("msg").textContent.includes("cliente")) msg("");
      };
      atualizarTituloPadrao();
    }
    $("cancelar").onclick = () => { alvo.innerHTML = ""; aoCancelar && aoCancelar(); };
    $("ok").onclick = async () => {
      const b = $("ok");
      if (nova && !$("cliente").value) {
        msg("Selecione o cliente da peça.");
        $("cliente").focus();
        return;
      }
      if (arquivos.some(a => !a.chave && !a.erro)) { msg("Aguarde o fim do envio dos arquivos…"); await Promise.all(arquivos.map(a => a.promessa)); }
      if (arquivos.some(a => a.erro)) return msg("Algum arquivo falhou. Remova-o ou envie de novo.");
      const links = $("links").value.split(/\s+/).map(s => s.trim()).filter(Boolean);
      if (!arquivos.length && !links.length) return msg("Anexe pelo menos um arquivo ou informe o link do Reels/Google Drive.");
      const corpo = { obs: $("obs").value, arquivos: arquivos.map(a => ({ chave: a.chave, nome: a.file.name })), links };
      if (nova) {
        const aprovadores = [...alvo.querySelectorAll('[data-f="aprovador"]:checked')].map(cb => cb.value);
        const tituloFinal = $("titulo").value.trim() || tituloPadraoCliente($("cliente").value);
        Object.assign(corpo, { titulo: tituloFinal, clienteId: $("cliente").value, aprovadores });
      } else {
        corpo.id = peca.id;
        const tit = $("titulo") ? $("titulo").value.trim() : "";
        if (tit) corpo.titulo = tit;
      }
      b.disabled = true; msg("Salvando…");
      try {
        const j = await api(nova ? "peca.enviar" : "peca.reenviar", corpo);
        if (nova && j.seqCliente && base?.seqClientes && corpo.clienteId) base.seqClientes[corpo.clienteId] = j.seqCliente;
        alvo.innerHTML = "";
        aoEnviar && aoEnviar(j.peca);
      } catch (e) { msg(e.message); b.disabled = false; }
    };
    alvo.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- Cartão de uma peça (usado no Envio e na Fila) ----------
  function versaoHtml(p, v) {
    const arqsImgPdf = (v.arquivos || []).filter(a => !String(a.tipo || "").startsWith("video/"));
    const arqsVideo = (v.arquivos || []).filter(a => String(a.tipo || "").startsWith("video/"));
    const thumbs = arqsImgPdf.map(a => a.expirado
      ? `<div class="pc-th exp" title="${esc(a.nome)}">arquivo expirado</div>`
      : a.tipo === "application/pdf"
        ? `<a class="pc-th" href="${arqUrl(p, v, a)}" target="_blank" rel="noopener" title="${esc(a.nome)}">PDF<br>${esc(a.nome.slice(0, 28))}</a>`
        : `<a class="pc-th" href="${arqUrl(p, v, a)}" target="_blank" rel="noopener" title="${esc(a.nome)}"><img loading="lazy" src="${arqUrl(p, v, a)}" alt="${esc(a.nome)}"></a>`).join("");

    // Vídeos enviados diretamente ou links de Reels/Vídeo do Google Drive
    const drivePlayers = [];
    const outrosLinks = [];
    for (const l of v.links || []) {
      const fid = extrairDriveFileId(l);
      if (fid) {
        drivePlayers.push(`<div class="pc-reel-card">
          <iframe src="https://drive.google.com/file/d/${encodeURIComponent(fid)}/preview" allow="autoplay; fullscreen" allowfullscreen loading="lazy" title="Reels / Vídeo do Google Drive"></iframe>
          <div class="pc-reel-foot">
            <span>🎬 <b>Reels / Vídeo (Drive)</b></span>
            <a href="${esc(l)}" target="_blank" rel="noopener" style="color:var(--blue);font-weight:600;text-decoration:none">Abrir no Drive ↗</a>
          </div>
        </div>`);
      } else {
        outrosLinks.push(l);
      }
    }
    const videoPlayers = arqsVideo.map(a => a.expirado
      ? `<div class="pc-th exp" title="${esc(a.nome)}">vídeo expirado</div>`
      : `<div class="pc-reel-card">
          <video controls preload="metadata" src="${arqUrl(p, v, a)}"></video>
          <div class="pc-reel-foot">
            <span title="${esc(a.nome)}">🎬 <b>${esc(a.nome.slice(0, 22))}</b></span>
            <a href="${arqUrl(p, v, a)}" target="_blank" rel="noopener" style="color:var(--blue);font-weight:600;text-decoration:none">Baixar ↗</a>
          </div>
        </div>`).join("");

    const playersHtml = (drivePlayers.length || videoPlayers) ? `<div class="pc-reel-wrap">${videoPlayers}${drivePlayers.join("")}</div>` : "";
    const linksHtml = outrosLinks.length ? `<ul class="pc-links">${outrosLinks.map(l => `<li><a href="${esc(l)}" target="_blank" rel="noopener">${esc(l.length > 70 ? l.slice(0, 70) + "…" : l)}</a></li>`).join("")}</ul>` : "";
    const exp = v.arquivos.length && !v.arquivos.every(a => a.expirado) ? ` · arquivos até ${brDia(v.expiraEm)}` : "";
    return `<div class="pc-sub">Versão ${v.n} · enviada em ${brHora(v.enviadaEm)}${exp}</div>${v.obs ? `<div style="font-size:13px;margin-top:4px;white-space:pre-wrap">${esc(v.obs)}</div>` : ""}
      ${thumbs ? `<div class="pc-thumbs">${thumbs}</div>` : ""}${playersHtml}${linksHtml}`;
  }
  function cartao(p, extra) {
    const atual = p.versoes[p.versoes.length - 1], anteriores = p.versoes.slice(0, -1).reverse();
    const hist = (p.historico || []).filter(h => h.tipo !== "envio" || h.comentario).map(h => {
      const ehCom = h.tipo === "comentario";
      const acao = ehCom ? "comentou" : (ACAO[h.tipo] || esc(h.tipo));
      const det = ehCom ? "" : ` a versão ${h.versao}`;
      return `<li><b>${esc(h.por?.nome || "")}</b> ${acao}${det} · <span class="pc-sub">${brHora(h.em)}</span>${h.comentario ? `<span class="c">${esc(h.comentario)}</span>` : ""}</li>`;
    }).join("");
    const aprovTxt = (p.aprovadores && p.aprovadores.length)
      ? ` · Aprovadores sugeridos: <b>${esc(p.aprovadores.map(a => a.nome).join(", "))}</b>`
      : " · Aprovador: <i>Qualquer coordenador</i>";
    const podeApagarPeca = !!(base && (base.ehGestao || base.funcao === "mestre"));
    const ehBloqueado = ["social", "atendimento"].includes(base && base.funcao);
    const souRemetente = !!(p.minha || (base && p.remetente && p.remetente.login === base.login));
    const podeEditarPeca = !ehBloqueado && (souRemetente || (base && (base.podeDecidir || base.ehGestao || base.funcao === "mestre")));
    const podeComentar = p.status !== "aprovada";
    const boxComentario = podeComentar ? `<div class="pc-coment-area" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line2)">
      <details style="font-size:13px" data-coment-wrap="${esc(p.id)}">
        <summary style="cursor:pointer;color:var(--blue);font-weight:600;user-select:none;display:inline-flex;align-items:center;gap:5px">💬 Adicionar comentário</summary>
        <div style="margin-top:8px">
          <textarea data-inp-coment="${esc(p.id)}" placeholder="Escreva uma observação ou comentário sobre este material…" style="width:100%;min-height:56px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;box-sizing:border-box"></textarea>
          <div class="pc-bar" style="margin-top:6px;justify-content:flex-end">
            <button class="btn small primary" type="button" data-enviar-coment="${esc(p.id)}">Enviar comentário</button>
          </div>
        </div>
      </details>
    </div>` : "";
    return `<div class="pc-card" data-id="${esc(p.id)}"><div class="pc-top"><div class="t">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>${esc(p.titulo)}</b><span class="pc-cli">${esc(p.clienteNome)}</span></div>
        <div class="pc-sub" style="margin-top:2px">Enviada por ${esc(p.remetente?.nome || "")}${p.versao > 1 ? ` · <b>v${p.versao}</b> (reenviada)` : ""}${aprovTxt}</div></div>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="st ${p.status}">${ST[p.status]}</span>
          ${podeEditarPeca ? `<button class="btn" type="button" data-x="editar-peca" data-id="${esc(p.id)}" title="Editar material e enviar nova versão" style="padding:3px 8px;min-height:0;font-size:12px;color:var(--blue);border-color:rgba(59,130,246,.35)">✏️ Editar</button>` : ""}
          ${podeApagarPeca ? `<button class="btn" type="button" data-del-peca="${esc(p.id)}" title="Apagar peça (exige senha mestre)" style="padding:3px 8px;min-height:0;font-size:12px;color:var(--danger)">🗑️ Apagar</button>` : ""}
        </div></div>
      <div style="margin-top:8px">${versaoHtml(p, atual)}</div>
      ${anteriores.length ? `<details class="pc-ver"><summary>Versões anteriores (${anteriores.length})</summary>${anteriores.map(v => `<div style="margin-top:8px">${versaoHtml(p, v)}</div>`).join("")}</details>` : ""}
      ${hist ? `<div class="pc-ver"><div class="pc-sub">Comentários e decisões</div><ul class="pc-hist">${hist}</ul></div>` : ""}
      ${boxComentario}
      ${extra || ""}
      <div data-box="edit-${esc(p.id)}"></div>
    </div>`;
  }

  // ======================================================================
  // ENVIO (remetente: vê e reenvia só as suas)
  // ======================================================================
  function envio(ctx) {
    const el = ctx.el;
    el.innerHTML = `<div class="pc-h"><div><h2>Envio de peças</h2><div class="pc-sub">Escolha o cliente, anexe o material (ou link de Reels do Google Drive) e envie para a fila de aprovação.</div></div><span class="sp"></span>
      <button class="btn primary" type="button" data-x="nova">Nova peça</button></div>
      <div data-box="form"></div>
      <div class="pc-filtros"><label>Status<select data-x="st"><option value="">Todas</option>${Object.entries(ST).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
        <label>Cliente<select data-x="cli"><option value="">Todos</option></select></label></div>
      <div data-box="lista"><div class="pc-vazio">Carregando…</div></div>`;
    const box = n => el.querySelector(`[data-box="${n}"]`), fv = n => el.querySelector(`[data-x="${n}"]`).value;
    let lista = [];
    const opcoes = (sel, pares) => { const v = sel.value; sel.innerHTML = sel.options[0].outerHTML + pares.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join(""); sel.value = pares.some(([k]) => k === v) ? v : ""; };
    async function carregar() {
      try { await carregarBase(); lista = (await api("pecas")).pecas.filter(p => p.minha); } catch (e) { box("lista").innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      const uniq = f => [...new Map(lista.map(f)).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
      opcoes(el.querySelector('[data-x="cli"]'), uniq(p => [p.clienteId, p.clienteNome]));
      render();
    }
    function render() {
      const l = lista.filter(p => (!fv("st") || p.status === fv("st")) && (!fv("cli") || p.clienteId === fv("cli")));
      box("lista").innerHTML = l.length ? l.map(p => cartao(p, ["aprovada", "reprovada", "alteracao_solicitada"].includes(p.status)
        ? `<div class="pc-bar"><button class="btn primary" type="button" data-x="reenviar" data-id="${esc(p.id)}">${p.status === "aprovada" ? "✏️ Editar material (Nova versão v" + (p.versao + 1) + ")" : "Enviar nova versão (v" + (p.versao + 1) + ")"}</button></div><div data-box="re-${esc(p.id)}"></div>` : "")).join("")
        : `<div class="pc-card pc-vazio">${lista.length ? "Nenhuma peça com esses filtros." : "Você ainda não enviou peças (ou as enviadas já passaram de " + (base?.retencaoDias || 7) + " dias)."}</div>`;
    }
    el.addEventListener("click", async ev => {
      const editBtn = ev.target.closest('[data-x="editar-peca"]');
      if (editBtn) {
        const id = editBtn.dataset.id || editBtn.closest("[data-id]")?.dataset.id;
        const p = lista.find(q => q.id === id);
        if (!p) return;
        const alvo = el.querySelector(`[data-box="edit-${CSS.escape(id)}"]`) || el.querySelector(`[data-box="re-${CSS.escape(id)}"]`);
        if (!alvo) return;
        if (alvo.children.length > 0) { alvo.innerHTML = ""; return; }
        await carregarBase();
        formEnvio(alvo, {
          titulo: `Editar material - ${p.titulo} (v${p.versao + 1})`,
          peca: p,
          aoEnviar: (novaPeca) => {
            ctx.toast(`Nova versão (v${novaPeca?.versao || (p.versao + 1)}) enviada`);
            carregar();
          },
          aoCancelar: () => { alvo.innerHTML = ""; }
        });
        return;
      }
      const comentBtn = ev.target.closest("[data-enviar-coment]");
      if (comentBtn) {
        const id = comentBtn.dataset.enviarComent;
        const card = ev.target.closest(".pc-card");
        const ta = card ? card.querySelector(`[data-inp-coment="${CSS.escape(id)}"]`) : null;
        const texto = (ta ? ta.value : "").trim();
        if (!texto) { ctx.toast("Escreva um comentário antes de enviar."); ta?.focus(); return; }
        comentBtn.disabled = true;
        try {
          await api("peca.comentar", { id, comentario: texto });
          ctx.toast("Comentário adicionado");
          carregar();
        } catch (e) {
          ctx.toast(e.message || "Erro ao adicionar comentário");
          comentBtn.disabled = false;
        }
        return;
      }
      const delBtn = ev.target.closest("[data-del-peca]");
      if (delBtn) {
        const id = delBtn.dataset.delPeca;
        const p = lista.find(q => q.id === id);
        const senhaMestre = await pedirSenhaMestre("Apagar peça", `Confirme a senha mestre para apagar "${p?.titulo || id}".`);
        if (!senhaMestre) return;
        try { await api("peca.excluir", { id, senhaMestre }); ctx.toast("Peça apagada"); carregar(); }
        catch (e) { ctx.toast(e.message); }
        return;
      }
      const x = ev.target.dataset.x;
      if (x === "nova" || x === "reenviar") { try { await carregarBase(); } catch (e) { ctx.toast(e.message); return; } }
      if (x === "nova") formEnvio(box("form"), { titulo: "Nova peça", aoEnviar: () => { ctx.toast("Peça enviada para a fila"); carregar(); } });
      if (x === "reenviar") {
        const id = ev.target.dataset.id || ev.target.closest("[data-id]").dataset.id, p = lista.find(q => q.id === id);
        const alvo = el.querySelector(`[data-box="re-${CSS.escape(id)}"]`) || el.querySelector(`[data-box="edit-${CSS.escape(id)}"]`);
        if (alvo) {
          formEnvio(alvo, {
            titulo: p.status === "aprovada" ? `Editar material - ${p.titulo} (v${p.versao + 1})` : `Nova versão de "${p.titulo}"`,
            peca: p,
            aoEnviar: () => { ctx.toast(`Versão ${p.versao + 1} enviada`); carregar(); },
            aoCancelar: () => { alvo.innerHTML = ""; }
          });
        }
      }
    });
    el.addEventListener("change", ev => { if (ev.target.dataset.x) render(); });
    return carregar;
  }

  // ======================================================================
  // FILA DE APROVAÇÃO (coordenador, mestre e gestão decidem)
  // ======================================================================
  function fila(ctx) {
    const el = ctx.el;
    el.innerHTML = `<div class="pc-h"><div><h2>Fila de aprovação</h2><div class="pc-sub" data-box="sub"></div></div><span class="sp"></span>
      <button class="btn" type="button" data-x="apagar-fila" style="color:var(--danger);border-color:rgba(192,39,26,.35)">🗑️ Apagar fila (Senha mestre)</button></div>
      <div class="pc-filtros">
        <label>Status<select data-x="st"><option value="pendente">Pendentes (inclui reenviadas)</option><option value="">Todas</option>
          <option value="aprovada">Aprovadas</option><option value="alteracao_solicitada">Alteração solicitada</option><option value="reprovada">Reprovadas</option></select></label>
        <label>Período<select data-x="f-per"><option value="">Todas as datas</option><option value="hoje">Hoje</option><option value="ontem">Ontem</option><option value="semana">Essa semana</option><option value="mes">Esse mês</option><option value="custom">Personalizado…</option></select></label>
        <label data-box="wrap-de" hidden>Data inicial<input type="date" data-x="f-de" style="padding:4px 8px;font-size:13px"></label>
        <label data-box="wrap-ate" hidden>Data final<input type="date" data-x="f-ate" style="padding:4px 8px;font-size:13px"></label>
        <label>Cliente<select data-x="cli"><option value="">Todos</option></select></label>
        <label>Remetente<select data-x="rem"><option value="">Todos</option></select></label>
        <button class="btn small" type="button" data-x="limpar-filtros-fila" style="align-self:flex-end">Limpar filtros</button>
      </div>
      <div data-box="lista"><div class="pc-vazio">Carregando…</div></div>`;
    const box = n => el.querySelector(`[data-box="${n}"]`), fv = n => el.querySelector(`[data-x="${n}"]`)?.value || "";
    let lista = [];
    const opcoes = (sel, pares) => { const v = sel.value; sel.innerHTML = sel.options[0].outerHTML + pares.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join(""); sel.value = pares.some(([k]) => k === v) ? v : ""; };
    const obterIntervaloFila = () => {
      const p = fv("f-per");
      if (p === "custom") {
        return { de: fv("f-de") || null, ate: fv("f-ate") || null };
      }
      return intervaloPeriodo(p);
    };
    const filtradasAtuais = () => {
      const { de, ate } = obterIntervaloFila();
      const st = fv("st");
      return lista.filter(p =>
        (!st || p.status === st) &&
        (!fv("cli") || p.clienteId === fv("cli")) &&
        (!fv("rem") || (p.remetente && p.remetente.login) === fv("rem")) &&
        pecaBatePeriodo(p, st, de, ate)
      );
    };
    async function carregar() {
      try { await carregarBase(); lista = (await api("pecas")).pecas; } catch (e) { box("lista").innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      box("sub").textContent = base.podeDecidir ? "Coordenadores e gestão podem aprovar, pedir alteração ou reprovar qualquer peça." : "Acompanhamento das peças.";
      const apagarBtn = el.querySelector('[data-x="apagar-fila"]');
      if (apagarBtn) apagarBtn.hidden = !(base && (base.ehGestao || base.funcao === "mestre"));
      const uniq = f => [...new Map(lista.map(f)).entries()].sort((a, b) => (a[1] || "").localeCompare(b[1] || "", "pt-BR"));
      opcoes(el.querySelector('[data-x="cli"]'), uniq(p => [p.clienteId || "", p.clienteNome || ""]));
      opcoes(el.querySelector('[data-x="rem"]'), uniq(p => [p.remetente?.login || "", p.remetente?.nome || p.remetente?.login || ""]).filter(x => x[0]));
      render();
    }
    function render() {
      const l = filtradasAtuais()
        .sort((a, b) => fv("st") === "pendente" ? a.atualizadoEm.localeCompare(b.atualizadoEm) : b.atualizadoEm.localeCompare(a.atualizadoEm));
      box("lista").innerHTML = l.length ? l.map(p => {
        const souAprovador = (p.aprovadores || []).some(a => a.login === base.login);
        const ehBloqueado = ["social", "atendimento"].includes(base && base.funcao);
        const podeDecidirEsta = !ehBloqueado && (base.podeDecidir || base.ehGestao || souAprovador);
        const souRemetente = !!(p.minha || (base && p.remetente && p.remetente.login === base.login));
        const podeEditarEsta = !ehBloqueado && (souRemetente || base.podeDecidir || base.ehGestao || base.funcao === "mestre");

        let acoesHtml = "";
        if (podeDecidirEsta && p.status === "pendente") {
          acoesHtml = `<div class="pc-dec">
          <textarea data-c="com" placeholder="Comentário (obrigatório para reprovar ou pedir alteração)"></textarea>
          <div class="pc-bar" style="margin-top:8px"><button class="btn primary" type="button" data-d="aprovada">Aprovar</button>
          <button class="btn" type="button" data-d="alteracao_solicitada">Pedir alteração</button><button class="btn" type="button" data-d="reprovada" style="color:var(--danger)">Reprovar</button>
          <span class="pc-sub" data-c="msg"></span></div></div>`;
        } else if (podeEditarEsta && p.status === "aprovada") {
          acoesHtml = `<div class="pc-bar" style="margin-top:10px">
            <button class="btn" type="button" data-x="editar-peca" data-id="${esc(p.id)}" style="display:inline-flex;align-items:center;gap:6px">✏️ Editar material aprovado (Nova versão v${p.versao + 1})</button>
          </div>`;
        }
        return cartao(p, acoesHtml);
      }).join("")
        : `<div class="pc-card pc-vazio">${
            lista.length
              ? (fv("st") === "pendente" && !fv("f-per") && !fv("cli") && !fv("rem")
                  ? `Não há peças pendentes de aprovação no momento. <div style="margin-top:10px"><button class="btn small" type="button" data-x="ver-todas">Ver todas as peças da fila (${lista.length})</button></div>`
                  : `Nenhuma peça encontrada com esses filtros. <div style="margin-top:10px"><button class="btn small" type="button" data-x="limpar-filtros-fila">Limpar filtros</button></div>`)
              : "Nenhuma peça na fila."
          }</div>`;
    }
    el.addEventListener("click", async ev => {
      const editBtn = ev.target.closest('[data-x="editar-peca"]');
      if (editBtn) {
        const id = editBtn.dataset.id || editBtn.closest("[data-id]")?.dataset.id;
        const p = lista.find(q => q.id === id);
        if (!p) return;
        const alvo = el.querySelector(`[data-box="edit-${CSS.escape(id)}"]`);
        if (!alvo) return;
        if (alvo.children.length > 0) { alvo.innerHTML = ""; return; }
        await carregarBase();
        formEnvio(alvo, {
          titulo: `Editar material - ${p.titulo} (v${p.versao + 1})`,
          peca: p,
          aoEnviar: (novaPeca) => {
            ctx.toast(`Nova versão (v${novaPeca?.versao || (p.versao + 1)}) enviada para a fila de aprovação`);
            carregar();
          },
          aoCancelar: () => { alvo.innerHTML = ""; }
        });
        return;
      }
      const comentBtn = ev.target.closest("[data-enviar-coment]");
      if (comentBtn) {
        const id = comentBtn.dataset.enviarComent;
        const card = ev.target.closest(".pc-card");
        const ta = card ? card.querySelector(`[data-inp-coment="${CSS.escape(id)}"]`) : null;
        const texto = (ta ? ta.value : "").trim();
        if (!texto) { ctx.toast("Escreva um comentário antes de enviar."); ta?.focus(); return; }
        comentBtn.disabled = true;
        try {
          await api("peca.comentar", { id, comentario: texto });
          ctx.toast("Comentário adicionado");
          carregar();
        } catch (e) {
          ctx.toast(e.message || "Erro ao adicionar comentário");
          comentBtn.disabled = false;
        }
        return;
      }
      const delBtn = ev.target.closest("[data-del-peca]");
      if (delBtn) {
        const id = delBtn.dataset.delPeca;
        const p = lista.find(q => q.id === id);
        const senhaMestre = await pedirSenhaMestre("Apagar peça", `Confirme a senha mestre para apagar "${p?.titulo || id}".`);
        if (!senhaMestre) return;
        try { await api("peca.excluir", { id, senhaMestre }); ctx.toast("Peça apagada"); carregar(); }
        catch (e) { ctx.toast(e.message); }
        return;
      }
      if (ev.target.closest('[data-x="apagar-fila"]')) {
        const visiveis = filtradasAtuais();
        if (!visiveis.length) { ctx.toast("Não há peças listadas para apagar."); return; }
        const senhaMestre = await pedirSenhaMestre("Apagar fila de peças", `Você está prestes a apagar ${visiveis.length} peça(s) exibida(s) na fila atual. Digite a senha mestre para confirmar.`);
        if (!senhaMestre) return;
        try {
          const r = await api("fila.apagar", { ids: visiveis.map(p => p.id), senhaMestre });
          ctx.toast(`${r.apagadas} peça(s) apagada(s) da fila`);
          carregar();
        } catch (e) { ctx.toast(e.message); }
        return;
      }
      if (ev.target.closest('[data-x="ver-todas"]')) {
        el.querySelector('[data-x="st"]').value = "";
        render();
        return;
      }
      if (ev.target.closest('[data-x="limpar-filtros-fila"]')) {
        el.querySelector('[data-x="st"]').value = "";
        el.querySelector('[data-x="f-per"]').value = "";
        const deEl = el.querySelector('[data-x="f-de"]'); if (deEl) deEl.value = "";
        const ateEl = el.querySelector('[data-x="f-ate"]'); if (ateEl) ateEl.value = "";
        const wDe = box("wrap-de"); if (wDe) wDe.hidden = true;
        const wAte = box("wrap-ate"); if (wAte) wAte.hidden = true;
        el.querySelector('[data-x="cli"]').value = "";
        el.querySelector('[data-x="rem"]').value = "";
        render();
        return;
      }
      const d = ev.target.dataset.d; if (!d) return;
      const card = ev.target.closest("[data-id]"), com = card.querySelector('[data-c="com"]').value.trim(), msg = card.querySelector('[data-c="msg"]');
      if (d !== "aprovada" && !com) { msg.textContent = "Escreva o comentário."; card.querySelector('[data-c="com"]').focus(); return; }
      card.querySelectorAll("[data-d]").forEach(b => { b.disabled = true; });
      try { await api("peca.decidir", { id: card.dataset.id, decisao: d, comentario: com }); ctx.toast(ST[d]); carregar(); }
      catch (e) { msg.textContent = e.message; card.querySelectorAll("[data-d]").forEach(b => { b.disabled = false; }); }
    });
    el.addEventListener("change", ev => {
      if (ev.target.dataset.x === "f-per") {
        const ehCustom = ev.target.value === "custom";
        const wDe = box("wrap-de"), wAte = box("wrap-ate");
        if (wDe) wDe.hidden = !ehCustom;
        if (wAte) wAte.hidden = !ehCustom;
      }
      if (ev.target.dataset.x) render();
    });
    return carregar;
  }

  // ======================================================================
  // DASHBOARD MENSAL (contadores permanentes, independentes da retenção dos arquivos)
  // ======================================================================
  function dash(ctx) {
    const el = ctx.el;
    el.innerHTML = `<div class="pc-h"><div><h2>Dashboard de aprovação</h2><div class="pc-sub" data-box="sub-dash">Dashboard analítico dinâmico, atualizado em tempo real com as peças e decisões do período.</div></div><span class="sp"></span></div>
      <div class="pc-card" style="padding:12px 14px;margin-bottom:14px">
        <div class="pc-filtros" style="margin-bottom:0">
          <label>Período<select data-x="f-per">
            <option value="mes">Mês inteiro</option>
            <option value="hoje">Hoje</option>
            <option value="ontem">Ontem</option>
            <option value="semana">Essa semana</option>
            <option value="este_mes">Esse mês</option>
            <option value="custom">Personalizado…</option>
          </select></label>
          <label data-box="wrap-mes">Mês<select data-x="mes"></select></label>
          <label data-box="wrap-de" hidden>Data inicial<input type="date" data-x="d-ini" style="padding:4px 8px;font-size:13px"></label>
          <label data-box="wrap-ate" hidden>Data final<input type="date" data-x="d-fim" style="padding:4px 8px;font-size:13px"></label>
          <label style="flex:1;min-width:210px">Cliente<select data-x="f-cli"><option value="">Todos os clientes</option></select></label>
          <label>Tipo de cliente<select data-x="f-tipo"><option value="">Todos os tipos</option></select></label>
          <label>Nível<select data-x="f-nivel"><option value="">Todos</option><option value="A">Nível A</option><option value="B">Nível B</option><option value="C">Nível C</option></select></label>
          <label>Atendimento<select data-x="f-at"><option value="">Todos</option></select></label>
          <button class="btn small" type="button" data-x="limpar-filtros" hidden>Limpar filtros</button>
        </div>
        <div data-box="aviso-filtro"></div>
      </div>
      <div class="pc-kpis" data-box="kpis"></div>
      <div class="pc-card" style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
          <div>
            <h3 style="margin:0;font-size:15px;display:flex;align-items:center;gap:6px">
              <span>🕒</span> Horários de pico de envio de material
            </h3>
            <div class="pc-sub">Volume de envio de peças e versões por horário ao longo do dia (horário de Brasília).</div>
          </div>
          <div data-box="pico-badge"></div>
        </div>
        <div data-box="pico-grafico"></div>
        <div data-box="pico-resumo" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line2)"></div>
      </div>
      <div class="pc-card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <div><h3 style="margin:0;font-size:15px">Envios e desempenho por cliente</h3><div class="pc-sub">Quantidade de peças enviadas, decisões e taxa de aprovação para cada cliente.</div></div>
        <label style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink2);cursor:pointer"><input type="checkbox" data-x="mostrar-zerados" style="min-height:0;width:14px;height:14px"> Mostrar clientes sem envios no mês</label>
      </div><div data-box="cli-barras" style="margin-bottom:14px"></div><div data-box="cli-tabela" style="overflow-x:auto"></div></div>
      <div class="pc-2"><div class="pc-card"><h3 style="margin:0 0 10px;font-size:15px">Peças aprovadas por usuário</h3><div data-box="barras"></div></div>
        <div class="pc-card"><h3 style="margin:0 0 10px;font-size:15px">Decisões por aprovador</h3><div data-box="dec"></div></div></div>
      <div class="pc-card"><h3 style="margin:0 0 10px;font-size:15px">Envios e aprovações por usuário</h3><div data-box="env"></div></div>
      <div data-box="limpeza"></div>`;
    const box = n => el.querySelector(`[data-box="${n}"]`), qx = n => el.querySelector(`[data-x="${n}"]`);
    const sel = qx("mes");
    let dados = null;
    const preencherSelect = (s, pares) => {
      const atual = s.value;
      s.innerHTML = s.options[0].outerHTML + pares.map(([k, rot]) => `<option value="${esc(k)}">${esc(rot)}</option>`).join("");
      s.value = pares.some(([k]) => k === atual) ? atual : "";
    };
    function agregarFiltrados(clientesFiltrados) {
      let pecas = 0, versoes = 0, aprovada = 0, reprovada = 0, alteracao_solicitada = 0, v1d = 0, v1a = 0;
      const porU = {}, porC = {};
      const horas = Array.from({ length: 24 }, (_, h) => ({
        hora: h,
        rotulo: String(h).padStart(2, "0") + ":00",
        total: 0,
        pecas: 0,
        versoes: 0,
      }));
      for (const c of clientesFiltrados) {
        pecas += c.pecas || 0;
        versoes += c.versoes || 0;
        aprovada += c.aprovada || 0;
        reprovada += c.reprovada || 0;
        alteracao_solicitada += c.alteracao_solicitada || 0;
        v1d += c.primeiraDecididas || 0;
        v1a += c.primeiraAprovadas || 0;
        if (Array.isArray(c.horas)) {
          c.horas.forEach((qtd, h) => { horas[h].total += (qtd || 0); });
        }
        for (const u of c.enviadas || []) {
          const x = (porU[u.login] ||= { login: u.login, nome: u.nome, pecas: 0, versoes: 0, aprovadas: 0 });
          x.pecas += u.pecas || 0;
          x.versoes += u.versoes || 0;
          x.aprovadas += u.aprovadas || 0;
        }
        for (const d of c.decisoes || []) {
          const x = (porC[d.login] ||= { login: d.login, nome: d.nome, aprovada: 0, reprovada: 0, alteracao_solicitada: 0, total: 0 });
          x.aprovada += d.aprovada || 0;
          x.reprovada += d.reprovada || 0;
          x.alteracao_solicitada += d.alteracao_solicitada || 0;
          x.total += d.total || 0;
        }
      }
      return {
        totais: {
          pecas, versoes, aprovada, reprovada, alteracao_solicitada,
          primeiraDecididas: v1d, primeiraAprovadas: v1a,
          taxaPrimeira: v1d ? Math.round(v1a / v1d * 1000) / 10 : null,
        },
        enviadas: Object.values(porU).sort((a, b) => (b.aprovadas || 0) - (a.aprovadas || 0) || b.pecas - a.pecas || b.versoes - a.versoes),
        decisoes: Object.values(porC).sort((a, b) => b.total - a.total),
        horas,
      };
    }
    function renderDash() {
      if (!dados) return;
      const fCli = qx("f-cli").value, fTipo = qx("f-tipo").value, fNivel = qx("f-nivel").value, fAt = qx("f-at").value;
      const mostrarZerados = qx("mostrar-zerados").checked;
      const temFiltro = !!(fCli || fTipo || fNivel || fAt);
      qx("limpar-filtros").hidden = !temFiltro;

      const todosClientes = dados.clientes || [];
      const clientesFiltrados = todosClientes.filter(c =>
        (!fCli || c.id === fCli) &&
        (!fTipo || c.tipo === fTipo) &&
        (!fNivel || c.nivel === fNivel) &&
        (!fAt || c.atendimento === fAt)
      );

      if (temFiltro) {
        const partes = [];
        if (fCli) { const cl = todosClientes.find(x => x.id === fCli); partes.push(`Cliente: ${cl ? cl.nome : fCli}`); }
        if (fTipo) partes.push(`Tipo: ${fTipo}`);
        if (fNivel) partes.push(`Nível ${fNivel}`);
        if (fAt) partes.push(`Atendimento: ${fAt}`);
        box("aviso-filtro").innerHTML = `<div style="margin-top:10px;padding:7px 11px;border-radius:8px;background:var(--blue-soft);color:var(--blue-dk);font-size:12.5px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <span><b>Filtro ativo:</b> ${esc(partes.join(" · "))} (${clientesFiltrados.length} cliente${clientesFiltrados.length === 1 ? "" : "s"})</span>
          <button class="btn small" type="button" data-x="limpar-filtros">Ver todos os clientes</button>
        </div>`;
      } else {
        box("aviso-filtro").innerHTML = "";
      }

      const escopo = temFiltro ? agregarFiltrados(clientesFiltrados) : { totais: dados.totais, enviadas: dados.enviadas, decisoes: dados.decisoes, horas: dados.horas };
      const t = escopo.totais;
      const clientesComEnvio = clientesFiltrados.filter(c => c.pecas > 0 || c.versoes > 0);
      box("kpis").innerHTML = [
        [t.pecas, "Peças enviadas", `${clientesComEnvio.length} cliente${clientesComEnvio.length === 1 ? "" : "s"} com envios`],
        [t.versoes, "Versões enviadas"],
        [t.aprovada, "Aprovadas"],
        [t.alteracao_solicitada, "Alteração solicitada"],
        [t.reprovada, "Reprovadas"],
        [t.taxaPrimeira == null ? "—" : t.taxaPrimeira.toLocaleString("pt-BR") + "%", "Aprovação na 1ª versão", t.primeiraDecididas ? `${t.primeiraAprovadas} de ${t.primeiraDecididas} peças decididas na 1ª versão` : "nenhuma decisão na 1ª versão"],
      ].map(([v, r, e]) => `<div class="pc-kpi"><b>${v}</b><span>${r}</span>${e ? `<em>${e}</em>` : ""}</div>`).join("");

      // Horários de pico de envio de material
      const horasAtuais = (escopo.horas || dados.horas || []);
      const totalEnvios = horasAtuais.reduce((acc, h) => acc + (h.total || 0), 0);
      const maxValor = Math.max(0, ...horasAtuais.map(h => h.total || 0));
      const picos = maxValor > 0 ? horasAtuais.filter(h => h.total === maxValor) : [];

      if (maxValor > 0) {
        const rotulosPico = picos.map(p => p.rotulo).join(" e ");
        box("pico-badge").innerHTML = `<div class="pc-pico-badge destaque">🔥 Horário de pico: <b>${esc(rotulosPico)}</b> (${maxValor} envio${maxValor > 1 ? "s" : ""})</div>`;
        box("pico-grafico").innerHTML = `<div class="pc-histog-wrap">
          <div class="pc-histog">
            ${horasAtuais.map(h => {
              const ehPico = h.total === maxValor && h.total > 0;
              const altPct = h.total > 0 ? Math.max(8, Math.round((h.total / maxValor) * 100)) : 0;
              const detalhe = `${h.rotulo} (${h.hora}h às ${h.hora}:59): ${h.total} material(is) enviado(s)${h.pecas ? ` · ${h.pecas} nova(s) peça(s)` : ""}${h.versoes ? ` · ${h.versoes} versão(ões)` : ""}`;
              return `<div class="pc-col-h${ehPico ? " pico" : ""}" title="${esc(detalhe)}">
                <span class="pc-col-num">${h.total > 0 ? h.total : ""}</span>
                <div class="pc-col-bar${h.total === 0 ? " zerada" : ""}" style="height:${altPct}%"></div>
                <span class="pc-col-rotulo">${String(h.hora).padStart(2, "0")}h</span>
              </div>`;
            }).join("")}
          </div>
        </div>`;

        const turnos = [
          { nome: "Madrugada", periodo: "00h - 05h59", icone: "🌌", qtd: horasAtuais.slice(0, 6).reduce((a, b) => a + (b.total || 0), 0) },
          { nome: "Manhã", periodo: "06h - 11h59", icone: "🌅", qtd: horasAtuais.slice(6, 12).reduce((a, b) => a + (b.total || 0), 0) },
          { nome: "Tarde", periodo: "12h - 17h59", icone: "☀️", qtd: horasAtuais.slice(12, 18).reduce((a, b) => a + (b.total || 0), 0) },
          { nome: "Noite", periodo: "18h - 23h59", icone: "🌙", qtd: horasAtuais.slice(18, 24).reduce((a, b) => a + (b.total || 0), 0) },
        ];
        const topHoras = [...horasAtuais].filter(h => h.total > 0).sort((a, b) => b.total - a.total).slice(0, 4);

        box("pico-resumo").innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
            <div style="font-size:12.5px;color:var(--ink2)">
              <b>Total no período:</b> ${totalEnvios} material(is) enviado(s)
              ${topHoras.length ? ` · <b>Top horários com maior fluxo:</b> ${topHoras.map((th, idx) => `${idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "•"} ${th.rotulo} (${th.total})`).join("  ")}` : ""}
            </div>
          </div>
          <div class="pc-turnos-grid">
            ${turnos.map(t => {
              const pct = totalEnvios ? Math.round((t.qtd / totalEnvios) * 100) : 0;
              return `<div class="pc-turno-card">
                <span>${t.icone} ${t.nome} <em style="font-style:normal;font-size:11px">(${t.periodo})</em></span>
                <b>${t.qtd} <small style="font-size:12px;font-weight:400;color:var(--ink2)">(${pct}%)</small></b>
              </div>`;
            }).join("")}
          </div>
        `;
      } else {
        box("pico-badge").innerHTML = `<div class="pc-pico-badge">Sem envios no período</div>`;
        box("pico-grafico").innerHTML = `<div class="pc-vazio">Nenhum envio de material registrado neste período/filtro.</div>`;
        box("pico-resumo").innerHTML = "";
      }

      // Barras e tabela de Clientes
      const listaCliVisivel = (fCli || mostrarZerados) ? clientesFiltrados : clientesComEnvio;
      const maxCli = Math.max(1, ...clientesComEnvio.map(c => c.pecas));
      box("cli-barras").innerHTML = clientesComEnvio.length
        ? `<div class="pc-barras">${clientesComEnvio.slice(0, 15).map(c => `<div class="l">
            <span class="nm" title="${esc(c.nome)}${c.tipo ? " · " + esc(c.tipo) : ""}"><a href="#" data-x="filtrar-cli" data-cid="${esc(c.id)}" style="color:inherit;text-decoration:none;font-weight:500">${esc(c.nome)}</a></span>
            <span class="b"><i style="width:${c.pecas / maxCli * 100}%"></i></span>
            <b class="num">${c.pecas}</b>
          </div>`).join("")}</div>`
        : "";

      box("cli-tabela").innerHTML = listaCliVisivel.length
        ? `<table class="pc-tbl"><thead><tr>
            <th>Cliente</th><th>Tipo / Nível</th><th>Atendimento</th>
            <th class="num">Peças</th><th class="num">Versões</th><th class="num">Aprovadas</th><th class="num">Alteração</th><th class="num">Reprovadas</th><th class="num">Pendentes</th><th class="num">1ª versão</th><th style="text-align:right">Filtro</th>
          </tr></thead><tbody>
          ${listaCliVisivel.map(c => {
            const ativo = fCli === c.id;
            return `<tr style="${ativo ? "background:var(--blue-soft)" : ""}">
              <td><b>${esc(c.nome)}</b></td>
              <td>${c.tipo ? `<span class="pc-cli" style="margin-right:4px">${esc(c.tipo)}</span>` : ""}${c.nivel ? `<span class="pc-badge-opc">Nível ${esc(c.nivel)}</span>` : (!c.tipo ? `<span class="pc-sub">—</span>` : "")}</td>
              <td>${esc(c.atendimento || "—")}</td>
              <td class="num"><b>${c.pecas}</b>${c.metaConteudos ? `<span class="pc-sub" title="Meta contratada na Carteira"> / ${c.metaConteudos}</span>` : ""}</td>
              <td class="num">${c.versoes}</td>
              <td class="num">${c.aprovada}</td>
              <td class="num">${c.alteracao_solicitada}</td>
              <td class="num">${c.reprovada}</td>
              <td class="num">${c.pendente || 0}</td>
              <td class="num">${c.taxaPrimeira == null ? "—" : c.taxaPrimeira.toLocaleString("pt-BR") + "%"}</td>
              <td style="text-align:right;white-space:nowrap"><button class="btn small${ativo ? " primary" : ""}" type="button" data-x="filtrar-cli" data-cid="${esc(c.id)}">${ativo ? "Limpar" : "Filtrar"}</button></td>
            </tr>`;
          }).join("")}
          </tbody></table>`
        : `<div class="pc-vazio">${temFiltro ? "Nenhum cliente encontrado com esses filtros." : "Nenhum cliente teve peças enviadas neste mês ainda (marque a opção acima para ver todos os clientes da carteira)."}</div>`;

      // Seções de Usuários e Aprovadores (mantidas e sensíveis ao filtro)
      // Substituição solicitada na Task 6: exibir peças aprovadas por usuário no lugar de apenas enviadas
      const listaAprovadasUsers = (escopo.enviadas || []).filter(u => (u.aprovadas || 0) > 0);
      const listaExibir = listaAprovadasUsers.length ? listaAprovadasUsers : (escopo.enviadas || []);
      const maxAprov = Math.max(1, ...listaExibir.map(u => u.aprovadas || 0));
      box("barras").innerHTML = listaExibir.length ? `<div class="pc-barras">${listaExibir.map(u => {
        const qtd = u.aprovadas || 0;
        return `<div class="l"><span class="nm" title="${esc(u.nome)}">${esc(u.nome)}</span><span class="b"><i style="width:${maxAprov > 0 ? (qtd / maxAprov * 100) : 0}%"></i></span><b class="num">${qtd}</b></div>`;
      }).join("")}</div>` : `<div class="pc-vazio">Nenhuma peça aprovada no período/filtro selecionado.</div>`;
      box("dec").innerHTML = escopo.decisoes.length ? `<table class="pc-tbl"><thead><tr><th>Quem decidiu</th><th class="num">Aprovadas</th><th class="num">Alteração</th><th class="num">Reprovadas</th><th class="num">Total</th></tr></thead><tbody>
        ${escopo.decisoes.map(c => `<tr><td>${esc(c.nome)}</td><td class="num">${c.aprovada}</td><td class="num">${c.alteracao_solicitada}</td><td class="num">${c.reprovada}</td><td class="num"><b>${c.total}</b></td></tr>`).join("")}</tbody></table>` : `<div class="pc-vazio">Sem decisões no período/filtro selecionado.</div>`;
      box("env").innerHTML = escopo.enviadas.length ? `<table class="pc-tbl"><thead><tr><th>Usuário</th><th class="num">Peças aprovadas</th><th class="num">Peças novas</th><th class="num">Versões enviadas</th></tr></thead><tbody>
        ${escopo.enviadas.map(u => `<tr><td>${esc(u.nome)}</td><td class="num"><b>${u.aprovadas || 0}</b></td><td class="num">${u.pecas}</td><td class="num">${u.versoes}</td></tr>`).join("")}
        <tr><td><b>Total</b></td><td class="num"><b>${t.aprovada}</b></td><td class="num"><b>${t.pecas}</b></td><td class="num"><b>${t.versoes}</b></td></tr></tbody></table>` : `<div class="pc-vazio">Sem envios no período/filtro selecionado.</div>`;
    }
    const obterParamsPeriodoDash = () => {
      const per = qx("f-per")?.value || "mes";
      if (per === "mes") {
        return sel.value ? { mes: sel.value } : {};
      }
      if (per === "custom") {
        const de = qx("d-ini")?.value || "";
        const ate = qx("d-fim")?.value || "";
        const p = {};
        if (de) p.de = de;
        if (ate) p.ate = ate;
        return p;
      }
      const interv = intervaloPeriodo(per);
      const p = {};
      if (interv.de) p.de = interv.de;
      if (interv.ate) p.ate = interv.ate;
      return p;
    };
    async function carregar() {
      let d;
      const params = obterParamsPeriodoDash();
      const qs = Object.entries(params).filter(([_, v]) => v).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join("");
      try {
        await carregarBase();
        d = await api("dashboard" + qs);
      } catch (e) {
        box("kpis").innerHTML = `<div class="note warn">${esc(e.message)}</div>`;
        return;
      }
      dados = d;
      if (d.meses && d.meses.length) {
        sel.innerHTML = d.meses.map(m => `<option value="${m}"${m === d.mes ? " selected" : ""}>${mesBr(m)}</option>`).join("");
      }
      const subEl = box("sub-dash");
      if (subEl) {
        if (d.de || d.ate) {
          const deTxt = d.de ? brDia(d.de + "T12:00:00Z") : "início";
          const ateTxt = d.ate ? brDia(d.ate + "T12:00:00Z") : "hoje";
          subEl.textContent = `Período selecionado: ${deTxt} até ${ateTxt}. Envios por cliente e usuário calculados nas datas correspondentes.`;
        } else {
          subEl.textContent = "Contagens do mês, gravadas a cada envio e decisão. Não zeram quando os arquivos expiram.";
        }
      }
      const clisOrdenados = [...(d.clientes || [])].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      preencherSelect(qx("f-cli"), clisOrdenados.map(c => [c.id, c.pecas ? `${c.nome} (${c.pecas})` : c.nome]));
      preencherSelect(qx("f-tipo"), (d.tiposCliente || []).map(tp => [tp, tp]));
      preencherSelect(qx("f-at"), (d.atendimentosCliente || []).map(at => [at, at]));
      renderDash();
      box("limpeza").innerHTML = (base && (base.ehGestao || base.funcao === "mestre")) ? `<p class="pc-sub">Arquivos com mais de ${base.retencaoDias} dias são apagados automaticamente todo dia. <button class="btn" type="button" data-x="limpar" style="padding:2px 10px;min-height:0">Rodar a limpeza agora</button> <button class="btn" type="button" data-x="limpar-testes" style="padding:2px 10px;min-height:0;margin-left:6px" title="Apaga peças e contadores de testes anteriores a 11/11/2026">Limpar testes anteriores a 11/11</button> <span data-box="lmsg"></span></p>` : "";
    }
    el.addEventListener("change", ev => {
      const x = ev.target.dataset.x;
      if (x === "f-per") {
        const v = ev.target.value;
        const wMes = box("wrap-mes"), wDe = box("wrap-de"), wAte = box("wrap-ate");
        if (wMes) wMes.hidden = v !== "mes";
        if (wDe) wDe.hidden = v !== "custom";
        if (wAte) wAte.hidden = v !== "custom";
        if (v !== "custom" || (qx("d-ini")?.value && qx("d-fim")?.value)) {
          carregar();
        }
      } else if (x === "d-ini" || x === "d-fim") {
        carregar();
      } else if (x === "mes") {
        carregar();
      } else if (["f-cli", "f-tipo", "f-nivel", "f-at", "mostrar-zerados"].includes(x)) {
        renderDash();
      }
    });
    el.addEventListener("click", async ev => {
      const btn = ev.target.closest("[data-x]"); if (!btn) return;
      const x = btn.dataset.x;
      if (x === "limpar-filtros") {
        qx("f-cli").value = ""; qx("f-tipo").value = ""; qx("f-nivel").value = ""; qx("f-at").value = "";
        renderDash();
        return;
      }
      if (x === "filtrar-cli") {
        ev.preventDefault();
        const cid = btn.dataset.cid || "";
        qx("f-cli").value = qx("f-cli").value === cid ? "" : cid;
        renderDash();
        return;
      }
      if (x === "limpar-testes") {
        btn.disabled = true;
        try {
          const r = await api("limpar.testes", {});
          box("lmsg").textContent = `${r.apagadas || 0} peça(s) de teste apagadas. Dashboard atualizado.`;
          ctx.toast("Testes anteriores a 11/11/2026 apagados e dashboard recalculado.");
          carregar();
        } catch (e) {
          box("lmsg").textContent = e.message;
        }
        btn.disabled = false;
        return;
      }
      if (x !== "limpar") return;
      btn.disabled = true;
      try { const r = await api("limpeza.executar", {}); box("lmsg").textContent = `${r.arquivosApagados + r.orfaosApagados} arquivo(s) apagado(s), ${r.pecasRemovidas} peça(s) saíram da fila.`; }
      catch (e) { box("lmsg").textContent = e.message; }
      btn.disabled = false;
    });
    return carregar;
  }

  const MONTAR = { envio, fila, pecasdash: dash };
  Object.entries(MONTAR).forEach(([id, montar]) => {
    let recarregar = null;
    // Cada perfil recebe só algumas destas abas: as que não existem para o usuário não são montadas.
    QZ.modulo({ id, iniciar(ctx) { if (!ctx.el) return; recarregar = montar(ctx); if (!ctx.el.hidden) recarregar(); }, aoMostrar() { if (recarregar) recarregar(); } });
  });
})();
