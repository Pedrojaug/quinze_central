// 02 Aprovação de peças: Envio, Fila de aprovação e Dashboard mensal.
// Tudo pela rota /api/m?r=pec/... (o servidor confere quem envia, quem decide e quem vê).
// Os arquivos vão do navegador direto para o armazenamento, com um token de envio gerado pelo servidor para cada arquivo.
  window.__qzPec = true;
  const { esc, brHora, hojeSP: hojeSp, somarDias: somarDiasIso } = QZ.fmt;
  const brDia = iso => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");
  const mesBr = m => (m ? ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][+m.slice(5, 7) - 1] + " de " + m.slice(0, 4) : "");
  const mb = n => (n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
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
  const api = QZ.criarApi("pec");
  let base = null;
  let ultVersaoPecas = "";
  const carregarBase = async () => (base ||= await api("inicio"));
  const arqUrl = (p, v, a) => `/api/m?r=pec/peca.arquivo&id=${encodeURIComponent(p.id)}&v=${v.n}&i=${a.i}`;
  const ST = { pendente: "Pendente", aprovada: "Aprovada", reprovada: "Reprovada", alteracao_solicitada: "Alteração solicitada" };
  const ACAO = { envio: "enviou", reenvio: "reenviou", edicao_aprovada: "editou material aprovado", edicao: "editou material", aprovada: "aprovou", reprovada: "reprovou", alteracao_solicitada: "pediu alteração", comentario: "comentou" };

  // Extrai o ID do arquivo em links do Google Drive (ignora pastas e valida tamanho)
  function extrairDriveFileId(urlBruta) {
    const s = String(urlBruta || "").trim();
    if (!s) return "";
    let u;
    try { u = new URL(s); } catch { return ""; }
    if (!["https:", "http:"].includes(u.protocol)) return "";
    if (!/(^|\.)(drive|docs)\.google\.com$/i.test(u.hostname)) return "";
    if (/\/folders\//i.test(u.pathname)) return "";
    const m1 = /\/file\/d\/([A-Za-z0-9_-]{10,200})(?:[/?#]|$)/.exec(u.pathname);
    if (m1) return m1[1];
    if (/\/(?:document|spreadsheets|presentation|forms)\/d\//i.test(u.pathname)) return "";
    const idParam = u.searchParams.get("id") || "";
    if (/^[A-Za-z0-9_-]{10,200}$/.test(idParam)) return idParam;
    return "";
  }

  const urlImagemDrive = (fid, largura = 1600) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(fid)}&sz=w${Math.max(200, Math.min(2400, Math.round(Number(largura) || 1600)))}`;
  const urlPreviewDrive = fid => `https://drive.google.com/file/d/${encodeURIComponent(fid)}/preview`;
  const urlProxyDrive = (pecaId, fid) => `/api/m?r=pec/drive.arquivo&pecaId=${encodeURIComponent(pecaId)}&id=${encodeURIComponent(fid)}`;
  const cacheMetaDrive = {};
  const driveMetaConsultados = new Set();
  function obterMetaDrive(v, fid) {
    if (!fid) return null;
    const m = v?.linksMeta && v.linksMeta[fid];
    if (m && m.tipo && m.tipo !== "desconhecido") return m;
    const c = cacheMetaDrive[fid];
    if (c && c.tipo) return c;
    return m || null;
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

  // Visualizador ampliado (Lightbox) para imagens (com navegação em carrossel e zoom 100%), vídeos e players do Drive
  function abrirModalMidia({ tipo, url, titulo, linkExterno, labelExterno, galeria, indice, fallbackImgUrl, drivePreview }) {
    let dlg = document.getElementById("qzDlgMidiaPecas");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "qzDlgMidiaPecas";
      dlg.style.cssText = "border:1px solid var(--line);border-radius:14px;padding:0;max-width:min(1180px,95vw);width:95vw;max-height:94vh;box-shadow:0 24px 60px rgba(0,0,0,.28);background:var(--card);overflow:hidden";
      document.body.appendChild(dlg);
      dlg.addEventListener("click", ev => { if (ev.target === dlg) dlg.close(); });
      dlg.addEventListener("close", () => {
        dlg.querySelectorAll("video,iframe").forEach(el => { if (el.tagName === "VIDEO") el.pause(); else el.src = "about:blank"; });
      });
    }
    const lista = Array.isArray(galeria) && galeria.length > 1 ? galeria : null;
    let idx = lista ? Math.max(0, Math.min(lista.length - 1, Number(indice) || 0)) : 0;
    let zoomAtivo = false;

    const aplicarEstadoZoom = () => {
      const stage = dlg.querySelector("#qzStageMidiaPecas");
      const imgEl = dlg.querySelector("#qzImgMidiaPecas");
      const zoomBtn = dlg.querySelector("#qzZoomMidiaPecas");
      if (stage) stage.className = "pc-lightbox-stage" + (zoomAtivo ? " zoomed" : "");
      if (imgEl) imgEl.title = zoomAtivo ? "Clique para ajustar à tela" : "Clique para ampliar em 100%";
      if (zoomBtn) zoomBtn.textContent = zoomAtivo ? "↩ Ajustar à tela" : "🔍 Ampliar 100%";
    };

    const renderizar = () => {
      const atual = lista ? lista[idx] : { tipo, url, titulo, linkExterno, labelExterno, fallbackImgUrl, drivePreview };
      const tipoAtual = atual.tipo || tipo;
      if (tipoAtual !== "img") zoomAtivo = false;
      let corpo = "";
      if (tipoAtual === "img") {
        const fbImg = atual.fallbackImgUrl ? ` data-drive-img-fallback="${esc(atual.fallbackImgUrl)}"` : "";
        const fbPrev = atual.drivePreview ? ` data-drive-preview-fallback="${esc(atual.drivePreview)}"` : "";
        const extAttr = atual.linkExterno ? ` data-midia-ext="${esc(atual.linkExterno)}"` : "";
        const extLblAttr = atual.labelExterno ? ` data-midia-ext-label="${esc(atual.labelExterno)}"` : "";
        corpo = `<div id="qzStageMidiaPecas" class="pc-lightbox-stage${zoomAtivo ? " zoomed" : ""}">
          <img id="qzImgMidiaPecas" src="${esc(atual.url)}" alt="${esc(atual.titulo || "")}" referrerpolicy="no-referrer"${fbImg}${fbPrev}${extAttr}${extLblAttr} data-midia-titulo="${esc(atual.titulo || "")}" title="${zoomAtivo ? "Clique para ajustar à tela" : "Clique para ampliar em 100%"}">
        </div>`;
      } else if (tipoAtual === "video") {
        corpo = `<div style="background:#000;padding:8px"><video controls autoplay src="${esc(atual.url)}" style="width:100%;max-height:80vh;display:block;border-radius:6px"></video></div>`;
      } else if (tipoAtual === "drive") {
        corpo = `<div style="background:#000"><iframe src="${esc(atual.url)}" allow="autoplay; fullscreen" allowfullscreen style="width:100%;height:80vh;border:0;display:block"></iframe></div>`;
      }
      const zoomBtnHtml = tipoAtual === "img"
        ? `<button class="btn small" type="button" id="qzZoomMidiaPecas" title="Alternar entre ajuste à tela e tamanho real (100%)">${zoomAtivo ? "↩ Ajustar à tela" : "🔍 Ampliar 100%"}</button>`
        : "";
      const navHtml = lista ? `<div style="display:flex;align-items:center;gap:4px">
        <button class="btn small" type="button" id="qzPrevMidiaPecas" title="Imagem anterior (←)">◀</button>
        <span style="font-size:12px;color:var(--ink2);font-weight:600;min-width:44px;text-align:center">${idx + 1} / ${lista.length}</span>
        <button class="btn small" type="button" id="qzNextMidiaPecas" title="Próxima imagem (→)">▶</button>
      </div>` : "";
      dlg.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line);background:#FAFBFD;flex-wrap:wrap">
          <b style="font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:140px">${esc(atual.titulo || "Visualização do material")}</b>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap">
            ${navHtml}
            ${zoomBtnHtml}
            ${atual.linkExterno ? `<a class="btn small" href="${esc(atual.linkExterno)}" target="_blank" rel="noopener" style="text-decoration:none">${esc(atual.labelExterno || "Abrir original ↗")}</a>` : ""}
            <button class="btn small" type="button" id="qzFecharMidiaPecas" aria-label="Fechar">✕ Fechar</button>
          </div>
        </div>
        ${corpo}`;
      dlg.querySelector("#qzFecharMidiaPecas").onclick = () => dlg.close();
      const zoomBtn = dlg.querySelector("#qzZoomMidiaPecas");
      const imgEl = dlg.querySelector("#qzImgMidiaPecas");
      if (zoomBtn) zoomBtn.onclick = () => { zoomAtivo = !zoomAtivo; aplicarEstadoZoom(); };
      if (imgEl) imgEl.onclick = () => { zoomAtivo = !zoomAtivo; aplicarEstadoZoom(); };
      const prevBtn = dlg.querySelector("#qzPrevMidiaPecas");
      const nextBtn = dlg.querySelector("#qzNextMidiaPecas");
      if (prevBtn) prevBtn.onclick = () => { idx = (idx - 1 + lista.length) % lista.length; zoomAtivo = false; renderizar(); };
      if (nextBtn) nextBtn.onclick = () => { idx = (idx + 1) % lista.length; zoomAtivo = false; renderizar(); };
    };

    dlg._navMidia = lista ? (dir) => { idx = (idx + dir + lista.length) % lista.length; zoomAtivo = false; renderizar(); } : null;
    renderizar();
    if (!dlg.open) dlg.showModal();
  }

  if (!window.__qzPecMidiaListener) {
    window.__qzPecMidiaListener = true;
    const urlEfetivaMidia = el => {
      const card = el.closest(".pc-preview-single, .pc-th-card, .pc-th");
      const imgRel = el.tagName === "IMG" ? el : (card ? card.querySelector("img") : el.querySelector("img"));
      if ((el.dataset.driveImgFallbackUsed === "1" || imgRel?.dataset?.driveImgFallbackUsed === "1") && el.dataset.driveImgFallback) {
        return el.dataset.driveImgFallback;
      }
      return el.dataset.midiaUrl;
    };
    document.addEventListener("click", ev => {
      const btn = ev.target && ev.target.closest ? ev.target.closest("[data-midia-expandir]") : null;
      if (!btn) return;
      ev.preventDefault();
      let galeria = null, indice = 0;
      const btnUrl = urlEfetivaMidia(btn);
      if (btn.dataset.midiaTipo === "img") {
        const scope = btn.closest(".pc-thumbs-grid, .pc-thumbs, .pc-media-pane");
        if (scope) {
          const vistos = new Set();
          const itens = [];
          scope.querySelectorAll('[data-midia-expandir][data-midia-tipo="img"]').forEach(el => {
            const u = urlEfetivaMidia(el);
            if (!u || vistos.has(u)) return;
            vistos.add(u);
            itens.push({
              tipo: "img",
              url: u,
              titulo: el.dataset.midiaTitulo,
              linkExterno: el.dataset.midiaExt,
              labelExterno: el.dataset.midiaExtLabel,
              fallbackImgUrl: el.dataset.driveImgFallback || "",
              drivePreview: el.dataset.drivePreviewFallback || "",
            });
          });
          if (itens.length > 1) {
            galeria = itens;
            indice = Math.max(0, itens.findIndex(x => x.url === btnUrl));
          }
        }
      }
      abrirModalMidia({
        tipo: btn.dataset.midiaTipo,
        url: btnUrl,
        titulo: btn.dataset.midiaTitulo,
        linkExterno: btn.dataset.midiaExt,
        labelExterno: btn.dataset.midiaExtLabel,
        fallbackImgUrl: btn.dataset.driveImgFallback || "",
        drivePreview: btn.dataset.drivePreviewFallback || "",
        galeria,
        indice
      });
    });
    document.addEventListener("error", ev => {
      const img = ev.target;
      if (!img || img.tagName !== "IMG") return;
      const fallbackImg = img.dataset.driveImgFallback;
      if (fallbackImg && !img.dataset.driveImgFallbackUsed) {
        img.dataset.driveImgFallbackUsed = "1";
        const card = img.closest(".pc-preview-single, .pc-th-card, .pc-th");
        if (card) {
          card.querySelectorAll("[data-midia-expandir]").forEach(el => { el.dataset.driveImgFallbackUsed = "1"; });
        }
        img.src = fallbackImg;
        return;
      }
      const previewUrl = img.dataset.drivePreviewFallback;
      if (!previewUrl) return;
      const dlg = document.getElementById("qzDlgMidiaPecas");
      if (dlg && dlg.contains(img)) {
        const stage = img.closest("#qzStageMidiaPecas");
        if (stage) {
          stage.className = "";
          stage.style.cssText = "background:#000";
          stage.innerHTML = `<iframe src="${esc(previewUrl)}" allow="autoplay; fullscreen" allowfullscreen style="width:100%;height:80vh;border:0;display:block"></iframe>`;
          const zoomBtn = dlg.querySelector("#qzZoomMidiaPecas");
          if (zoomBtn) zoomBtn.hidden = true;
        }
        return;
      }
      const ext = img.dataset.midiaExt || previewUrl;
      const titulo = img.dataset.midiaTitulo || "Arquivo do Google Drive";
      const single = img.closest(".pc-preview-single");
      if (single && typeof renderCardDriveIframe === "function") {
        single.outerHTML = renderCardDriveIframe({ previewUrl, extUrl: ext, titulo, nome: titulo, tipo: "desconhecido", fid: "" });
        return;
      }
      const thCard = img.closest(".pc-th-card");
      if (thCard && typeof renderCardDriveIframe === "function") {
        thCard.outerHTML = renderCardDriveIframe({ previewUrl, extUrl: ext, titulo, nome: titulo, tipo: "desconhecido", fid: "" });
        return;
      }
      const thCompact = img.closest(".pc-th");
      if (thCompact) {
        thCompact.outerHTML = `<button type="button" class="pc-th" data-midia-expandir="1" data-midia-tipo="drive" data-midia-url="${esc(previewUrl)}" data-midia-titulo="${esc(titulo)}" data-midia-ext="${esc(ext)}" data-midia-ext-label="Abrir no Drive ↗" style="cursor:pointer;flex-direction:column;gap:4px"><span style="font-size:20px">📁</span><b>Drive</b></button>`;
      }
    }, true);
    document.addEventListener("keydown", ev => {
      const dlg = document.getElementById("qzDlgMidiaPecas");
      if (!dlg || !dlg.open || !dlg._navMidia) return;
      if (ev.key === "ArrowLeft") { ev.preventDefault(); dlg._navMidia(-1); }
      else if (ev.key === "ArrowRight") { ev.preventDefault(); dlg._navMidia(1); }
    });
  }
