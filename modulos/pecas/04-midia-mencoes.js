  // ---------- Cartão de uma peça (usado no Envio e na Fila) ----------
  function renderCardDriveIframe({ previewUrl, extUrl, titulo, nome, tipo, fid }) {
    const icone = tipo === "video" ? "🎬" : tipo === "pdf" ? "📄" : "📁";
    const rotuloBase = tipo === "video"
      ? "Reels / Vídeo (Drive)"
      : tipo === "pdf"
        ? "Documento PDF (Drive)"
        : "Arquivo (Google Drive)";
    const textoFoot = nome ? esc(nome) : rotuloBase;
    const attrPendente = tipo === "desconhecido" && fid ? ` data-drive-pendente="${esc(fid)}"` : "";
    return `<div class="pc-reel-card"${attrPendente}>
      <div class="pc-reel-frame">
        <iframe src="${esc(previewUrl)}" allow="autoplay; fullscreen" allowfullscreen loading="lazy" title="${esc(rotuloBase)}"></iframe>
        <button type="button" class="pc-expand-fab" data-midia-expandir="1" data-midia-tipo="drive" data-midia-url="${esc(previewUrl)}" data-midia-titulo="${esc(titulo)}" data-midia-ext="${esc(extUrl)}" data-midia-ext-label="Abrir no Drive ↗" title="Abrir visualização ampliada">⛶ Ampliar</button>
      </div>
      <div class="pc-reel-foot">
        <span title="${esc(nome || rotuloBase)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${icone} <b>${textoFoot}</b></span>
        <div class="pc-reel-actions">
          <button type="button" class="pc-btn-expand" data-midia-expandir="1" data-midia-tipo="drive" data-midia-url="${esc(previewUrl)}" data-midia-titulo="${esc(titulo)}" data-midia-ext="${esc(extUrl)}" data-midia-ext-label="Abrir no Drive ↗">⛶ Expandir</button>
          <a href="${esc(extUrl)}" target="_blank" rel="noopener" style="color:var(--blue);font-weight:600;text-decoration:none">Abrir no Drive ↗</a>
        </div>
      </div>
    </div>`;
  }

  function versaoPartes(p, v, compacto) {
    const arqsImgPdf = (v.arquivos || []).filter(a => !String(a.tipo || "").startsWith("video/"));
    const arqsVideo = (v.arquivos || []).filter(a => String(a.tipo || "").startsWith("video/"));

    const drivePlayers = [];
    const outrosLinks = [];
    const itensVisualizaveis = [];

    for (const a of arqsImgPdf) {
      if (a.expirado) {
        itensVisualizaveis.push({ expirado: true, a });
        continue;
      }
      const u = arqUrl(p, v, a);
      if (a.tipo === "application/pdf") {
        itensVisualizaveis.push({ pdf: true, a, url: u });
      } else {
        itensVisualizaveis.push({
          img: true,
          nome: a.nome,
          thumbUrl: u,
          fullUrl: u,
          extUrl: u,
          extLabel: "Abrir original ↗",
          linkFootLabel: "Abrir ↗",
        });
      }
    }

    for (const l of v.links || []) {
      const fid = extrairDriveFileId(l);
      if (!fid) {
        outrosLinks.push(l);
        continue;
      }
      const meta = obterMetaDrive(v, fid);
      const tipoDrive = meta?.tipo || "desconhecido";
      const nomeDrive = meta?.nome || "";
      const previewUrl = urlPreviewDrive(fid);
      if (tipoDrive === "imagem") {
        itensVisualizaveis.push({
          img: true,
          nome: nomeDrive || "Imagem (Google Drive)",
          thumbUrl: urlImagemDrive(fid, 1200),
          fullUrl: urlImagemDrive(fid, 2400),
          fallbackImgUrl: urlProxyDrive(p.id, fid),
          drivePreview: previewUrl,
          extUrl: l,
          extLabel: "Abrir no Drive ↗",
          linkFootLabel: "Abrir no Drive ↗",
        });
      } else {
        drivePlayers.push(renderCardDriveIframe({
          previewUrl,
          extUrl: l,
          titulo: nomeDrive ? `${p.titulo} · ${nomeDrive}` : `${p.titulo} · Drive`,
          nome: nomeDrive,
          tipo: tipoDrive,
          fid,
        }));
      }
    }

    const videoPlayers = arqsVideo.map(a => {
      if (a.expirado) return `<div class="pc-th exp" title="${esc(a.nome)}">vídeo expirado</div>`;
      const u = arqUrl(p, v, a);
      return `<div class="pc-reel-card">
        <video controls preload="metadata" src="${u}"></video>
        <div class="pc-reel-foot">
          <span title="${esc(a.nome)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🎬 <b>${esc(a.nome)}</b></span>
          <div class="pc-reel-actions">
            <button type="button" class="pc-btn-expand" data-midia-expandir="1" data-midia-tipo="video" data-midia-url="${u}" data-midia-titulo="${esc(a.nome)}" data-midia-ext="${u}" data-midia-ext-label="Baixar ↗">⛶ Expandir</button>
            <a href="${u}" target="_blank" rel="noopener" style="color:var(--blue);font-weight:600;text-decoration:none">Baixar ↗</a>
          </div>
        </div>
      </div>`;
    });

    let thumbsHtml = "";
    if (itensVisualizaveis.length) {
      if (compacto) {
        thumbsHtml = `<div class="pc-thumbs">${itensVisualizaveis.map(it => {
          if (it.expirado) return `<div class="pc-th exp" title="${esc(it.a.nome)}">arquivo expirado</div>`;
          if (it.pdf) return `<a class="pc-th" href="${esc(it.url)}" target="_blank" rel="noopener" title="${esc(it.a.nome)}">PDF<br>${esc(it.a.nome.slice(0, 28))}</a>`;
          const fbImg = it.fallbackImgUrl ? ` data-drive-img-fallback="${esc(it.fallbackImgUrl)}"` : "";
          const fbPrev = it.drivePreview ? ` data-drive-preview-fallback="${esc(it.drivePreview)}"` : "";
          return `<button type="button" class="pc-th" style="padding:0;cursor:zoom-in" title="${esc(it.nome)} (clique para ampliar)" data-midia-expandir="1" data-midia-tipo="img" data-midia-url="${esc(it.fullUrl)}" data-midia-titulo="${esc(it.nome)}" data-midia-ext="${esc(it.extUrl)}" data-midia-ext-label="${esc(it.extLabel)}"${fbImg}${fbPrev}>
            <img loading="lazy" referrerpolicy="no-referrer" src="${esc(it.thumbUrl)}" alt="${esc(it.nome)}"${fbImg}${fbPrev} data-midia-titulo="${esc(it.nome)}" data-midia-ext="${esc(it.extUrl)}">
          </button>`;
        }).join("")}</div>`;
      } else if (itensVisualizaveis.length === 1 && itensVisualizaveis[0].img && !drivePlayers.length && !videoPlayers.length) {
        const it = itensVisualizaveis[0];
        const fbImg = it.fallbackImgUrl ? ` data-drive-img-fallback="${esc(it.fallbackImgUrl)}"` : "";
        const fbPrev = it.drivePreview ? ` data-drive-preview-fallback="${esc(it.drivePreview)}"` : "";
        thumbsHtml = `<div class="pc-preview-single">
          <img loading="lazy" referrerpolicy="no-referrer" src="${esc(it.thumbUrl)}" alt="${esc(it.nome)}" data-midia-expandir="1" data-midia-tipo="img" data-midia-url="${esc(it.fullUrl)}" data-midia-titulo="${esc(it.nome)}" data-midia-ext="${esc(it.extUrl)}" data-midia-ext-label="${esc(it.extLabel)}"${fbImg}${fbPrev}>
          <div class="pc-preview-foot">
            <span class="nm" title="${esc(it.nome)}">${esc(it.nome)}</span>
            <div class="pc-reel-actions">
              <button type="button" class="pc-btn-expand" data-midia-expandir="1" data-midia-tipo="img" data-midia-url="${esc(it.fullUrl)}" data-midia-titulo="${esc(it.nome)}" data-midia-ext="${esc(it.extUrl)}" data-midia-ext-label="${esc(it.extLabel)}"${fbImg}${fbPrev}>🔍 Ampliar</button>
              <a href="${esc(it.extUrl)}" target="_blank" rel="noopener" class="pc-btn-link">${esc(it.linkFootLabel)}</a>
            </div>
          </div>
        </div>`;
      } else {
        thumbsHtml = `<div class="pc-thumbs-grid">${itensVisualizaveis.map(it => {
          if (it.expirado) return `<div class="pc-th exp" title="${esc(it.a.nome)}">arquivo expirado</div>`;
          if (it.pdf) {
            return `<div class="pc-th-card">
              <a class="pv" href="${esc(it.url)}" target="_blank" rel="noopener" style="cursor:pointer;flex-direction:column;gap:4px">
                <span style="font-size:24px">📄</span>
                <b>PDF</b>
              </a>
              <div class="ft"><span title="${esc(it.a.nome)}">${esc(it.a.nome)}</span><a href="${esc(it.url)}" target="_blank" rel="noopener" class="pc-btn-link">Abrir ↗</a></div>
            </div>`;
          }
          const fbImg = it.fallbackImgUrl ? ` data-drive-img-fallback="${esc(it.fallbackImgUrl)}"` : "";
          const fbPrev = it.drivePreview ? ` data-drive-preview-fallback="${esc(it.drivePreview)}"` : "";
          return `<div class="pc-th-card">
            <div class="pv" data-midia-expandir="1" data-midia-tipo="img" data-midia-url="${esc(it.fullUrl)}" data-midia-titulo="${esc(it.nome)}" data-midia-ext="${esc(it.extUrl)}" data-midia-ext-label="${esc(it.extLabel)}"${fbImg}${fbPrev}>
              <img loading="lazy" referrerpolicy="no-referrer" src="${esc(it.thumbUrl)}" alt="${esc(it.nome)}"${fbImg}${fbPrev} data-midia-titulo="${esc(it.nome)}" data-midia-ext="${esc(it.extUrl)}">
            </div>
            <div class="ft">
              <span title="${esc(it.nome)}">${esc(it.nome)}</span>
              <a href="${esc(it.extUrl)}" target="_blank" rel="noopener" class="pc-btn-link" title="Abrir em nova aba">↗</a>
            </div>
          </div>`;
        }).join("")}</div>`;
      }
    }

    const playersHtml = (drivePlayers.length || videoPlayers.length) ? `<div class="pc-reel-wrap">${videoPlayers.join("")}${drivePlayers.join("")}</div>` : "";
    const mediaHtml = `${thumbsHtml}${playersHtml}`;
    const temMidia = Boolean(mediaHtml);

    const linksHtml = outrosLinks.length ? `<ul class="pc-links">${outrosLinks.map(l => `<li><a href="${esc(l)}" target="_blank" rel="noopener">${esc(l.length > 70 ? l.slice(0, 70) + "…" : l)}</a></li>`).join("")}</ul>` : "";
    const exp = v.arquivos.length && !v.arquivos.every(a => a.expirado) ? ` · arquivos até ${brDia(v.expiraEm)}` : "";
    const metaHtml = `<div class="pc-sub">Versão ${v.n} · enviada em ${brHora(v.enviadaEm)}${exp}</div>${v.obs ? `<div class="pc-obs-box">${formatarTextoComMencoes(v.obs)}</div>` : ""}${linksHtml}`;

    return { mediaHtml, metaHtml, temMidia };
  }
  function versaoHtml(p, v) {
    const { mediaHtml, metaHtml } = versaoPartes(p, v, true);
    return `${metaHtml}${mediaHtml ? `<div style="margin-top:8px">${mediaHtml}</div>` : ""}`;
  }

  async function resolverMetadadosDrivePendentes(pecasVisiveis, rootEl) {
    if (!Array.isArray(pecasVisiveis) || !pecasVisiveis.length || !rootEl) return;
    const idsPendentes = [];
    const vistos = new Set();
    for (const p of pecasVisiveis) {
      for (const v of p?.versoes || []) {
        for (const l of v?.links || []) {
          const fid = extrairDriveFileId(l);
          if (!fid || vistos.has(fid)) continue;
          const meta = obterMetaDrive(v, fid);
          if ((!meta || !meta.tipo) && !driveMetaConsultados.has(fid)) {
            vistos.add(fid);
            idsPendentes.push(fid);
            if (idsPendentes.length >= 30) break;
          }
        }
        if (idsPendentes.length >= 30) break;
      }
      if (idsPendentes.length >= 30) break;
    }
    if (!idsPendentes.length) return;
    idsPendentes.forEach(fid => driveMetaConsultados.add(fid));
    let r;
    try {
      r = await api("drive.meta", { ids: idsPendentes });
    } catch {
      idsPendentes.forEach(fid => driveMetaConsultados.delete(fid));
      return;
    }
    const metaMapa = r && r.meta && typeof r.meta === "object" ? r.meta : {};
    for (const [fid, m] of Object.entries(metaMapa)) {
      if (m && typeof m === "object") cacheMetaDrive[fid] = m;
    }
    for (const p of pecasVisiveis) {
      const atual = p?.versoes?.[p.versoes.length - 1];
      if (!atual || !Array.isArray(atual.links) || !atual.links.length) continue;
      const teveClassificacao = atual.links.some(l => {
        const fid = extrairDriveFileId(l);
        const m = fid && metaMapa[fid];
        return m && (["imagem", "video", "pdf"].includes(m.tipo) || m.nome);
      });
      if (!teveClassificacao) continue;
      const card = rootEl.querySelector(`#peca-card-${CSS.escape(p.id)}`);
      const mediaPane = card ? card.querySelector(".pc-media-pane") : null;
      if (mediaPane) {
        mediaPane.innerHTML = versaoPartes(p, atual, false).mediaHtml;
      }
    }
  }

  // ---------- Avatares de usuários (foto ou iniciais com cor determinística) ----------
  const CORES_AVATAR_PECAS = [
    ["#0660FF", "#0049CC"],
    ["#0E8A7B", "#0A695E"],
    ["#7E22CE", "#581C87"],
    ["#D97706", "#B45309"],
    ["#E11D48", "#BE123C"],
    ["#2563EB", "#1D4ED8"],
    ["#059669", "#047857"],
    ["#9333EA", "#6B21A8"],
    ["#EA580C", "#C2410C"],
    ["#0284C7", "#0369A1"],
  ];
  let mapaPerfisUsuarios = {};

  function atualizarMapaPerfis(perfisNovos) {
    if (perfisNovos && typeof perfisNovos === "object") {
      mapaPerfisUsuarios = { ...mapaPerfisUsuarios, ...perfisNovos };
    }
    for (const u of (base?.equipe || base?.usuarios || [])) {
      if (u && u.login) {
        mapaPerfisUsuarios[u.login] = {
          nome: u.nome || mapaPerfisUsuarios[u.login]?.nome || u.login,
          avatar: u.avatar !== undefined ? u.avatar : (mapaPerfisUsuarios[u.login]?.avatar || null),
          funcao: u.funcao || mapaPerfisUsuarios[u.login]?.funcao || "",
        };
      }
    }
  }

  function iniciaisDe(nome, login) {
    if (window.QZ_userInitials) return window.QZ_userInitials(nome, login);
    const txt = String(nome || login || "").trim();
    if (!txt) return "?";
    const clean = txt.replace(/@.*$/, "").replace(/[._-]/g, " ").trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function corParDe(seed) {
    if (window.QZ_userColorPair) return window.QZ_userColorPair(seed);
    const s = String(seed || "").toLowerCase();
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return CORES_AVATAR_PECAS[Math.abs(h) % CORES_AVATAR_PECAS.length];
  }

  function resolverInfoUsuario(ref) {
    const login = String(ref?.login || (typeof ref === "string" ? ref : "") || "").trim();
    const cadastrado = login ? mapaPerfisUsuarios[login] : null;
    const nome = cadastrado?.nome || ref?.nome || login || "Usuário";
    const avatar = cadastrado?.avatar || ref?.avatar || null;
    return { login, nome, avatar };
  }

  function avatarHtml(ref, tamanho = "md") {
    const { login, nome, avatar } = resolverInfoUsuario(ref);
    if (avatar && /^data:image\//.test(avatar)) {
      return `<span class="pc-av ${tamanho}" title="${esc(nome)}" style="background:#E2E8F0"><img src="${esc(avatar)}" alt="${esc(nome)}"></span>`;
    }
    const [c1, c2] = corParDe(login || nome);
    return `<span class="pc-av ${tamanho}" title="${esc(nome)}" style="background:linear-gradient(135deg,${c1} 0%,${c2} 100%)">${esc(iniciaisDe(nome, login))}</span>`;
  }

  // ---------- Menções (@) em comentários e decisões ----------
  function candidatosMencaoParaPeca(p) {
    atualizarMapaPerfis();
    const eq = (base?.equipe && base.equipe.length ? base.equipe : base?.usuarios) || [];
    const aprovSug = new Set((p?.aprovadores || []).map(a => a.login));
    const remLogin = p?.remetente?.login || "";
    const meuLogin = base?.login || "";
    return eq
      .filter(u => u.login && u.login !== meuLogin)
      .map(u => {
        const info = resolverInfoUsuario(u);
        const ehSugerido = aprovSug.has(u.login);
        const ehRemetente = u.login === remLogin;
        const ehAprovador = !!(u.podeDecidir || ["coordenador", "mestre", "gestao"].includes(u.funcao));
        const papelTxt = ehSugerido ? "⭐ Aprovador da peça" : ehAprovador ? "Coordenador / Aprovador" : ehRemetente ? "Remetente da peça" : (u.funcao || "Equipe");
        const ordem = ehSugerido ? 1 : ehAprovador ? 2 : ehRemetente ? 3 : 4;
        return { login: u.login, nome: info.nome, avatar: info.avatar, funcao: u.funcao, ehSugerido, ehAprovador, ehRemetente, papelTxt, ordem };
      })
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
  }

  function formatarTextoComMencoes(textoBruto, mencoesEvento = []) {
    let html = esc(textoBruto || "");
    const eq = (base?.equipe && base.equipe.length ? base.equipe : base?.usuarios) || [];
    const mapa = new Map();
    for (const u of eq) if (u.login) mapa.set(u.login, u.nome || u.login);
    for (const m of mencoesEvento || []) if (m && m.login) mapa.set(m.login, m.nome || m.login);

    const meuLogin = base?.login || "";
    const todos = [...mapa.entries()].map(([login, nome]) => ({ login, nome })).sort((a, b) => b.nome.length - a.nome.length);
    for (const u of todos) {
      const alvos = [esc(u.nome), esc(u.login)].filter(Boolean);
      for (const alvo of alvos) {
        const escRe = alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(^|[\\s([{"'])@${escRe}(?=$|[\\s.,!?;:)\\]}"'])`, "gi");
        const cls = u.login === meuLogin ? "pc-tag-mencao eu" : "pc-tag-mencao";
        html = html.replace(re, (_, pre) => `${pre}<span class="${cls}" title="${esc(u.login)}">@${esc(u.nome)}</span>`);
      }
    }
    return html;
  }

  function inserirMencaoNoTextarea(ta, login, nome) {
    if (!ta) return;
    const mencaoTxt = `@${nome} `;
    const val = ta.value || "";
    const start = typeof ta.selectionStart === "number" ? ta.selectionStart : val.length;
    const end = typeof ta.selectionEnd === "number" ? ta.selectionEnd : val.length;
    const antes = val.slice(0, start);
    const depois = val.slice(end);
    // Se estiver completando um @parcial digitado no cursor, substitui o @parcial
    const mAt = /(^|[\s([{"'])@([^\s@]{0,35})$/.exec(antes);
    let novoAntes, posCursor;
    if (mAt) {
      const corte = antes.length - mAt[2].length - 1;
      novoAntes = antes.slice(0, corte) + mencaoTxt;
      posCursor = novoAntes.length;
    } else {
      const sep = antes.length && !/\s$/.test(antes) ? " " : "";
      novoAntes = antes + sep + mencaoTxt;
      posCursor = novoAntes.length;
    }
    ta.value = novoAntes + depois;
    const conj = new Set((ta.dataset.mencoesLogins || "").split(",").filter(Boolean));
    conj.add(login);
    ta.dataset.mencoesLogins = [...conj].join(",");
    ta.focus();
    try { ta.setSelectionRange(posCursor, posCursor); } catch {}
    sincronizarMencoesTextarea(ta);
  }

  const normMencao = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function sincronizarMencoesTextarea(ta) {
    if (!ta) return;
    const valNorm = normMencao(ta.value);
    const atuais = (ta.dataset.mencoesLogins || "").split(",").map(s => s.trim()).filter(Boolean);
    const mantidos = atuais.filter(lg => {
      const info = resolverInfoUsuario(lg);
      const nmNorm = normMencao(info.nome);
      return (nmNorm && valNorm.includes("@" + nmNorm)) || valNorm.includes("@" + lg.toLowerCase());
    });
    ta.dataset.mencoesLogins = [...new Set(mantidos)].join(",");
  }

  function coletarMencoesDoTextarea(ta) {
    if (!ta) return [];
    sincronizarMencoesTextarea(ta);
    return (ta.dataset.mencoesLogins || "").split(",").map(s => s.trim()).filter(Boolean);
  }

  // Menu flutuante de autocomplete ao digitar @ em qualquer textarea de comentário ou parecer de peça
  if (!window.__qzPecMencaoListener) {
    window.__qzPecMencaoListener = true;
    let popEl = null, taAtual = null, itensAtuais = [], idxAtivo = 0;

    const fecharPop = () => {
      if (popEl) popEl.hidden = true;
      taAtual = null;
      itensAtuais = [];
    };

    const garantirPop = () => {
      if (!popEl) {
        popEl = document.createElement("div");
        popEl.className = "pc-ac-pop";
        popEl.hidden = true;
        document.body.appendChild(popEl);
      }
      return popEl;
    };

    const renderPop = () => {
      if (!popEl || !itensAtuais.length) { fecharPop(); return; }
      popEl.innerHTML = itensAtuais.map((u, i) => `<button type="button" class="pc-ac-item${i === idxAtivo ? " on" : ""}" data-ac-idx="${i}">
        <span style="display:inline-flex;align-items:center;gap:7px">${avatarHtml(u, "sm")}${u.ehSugerido ? "⭐ " : ""}<b>@${esc(u.nome)}</b></span>
        <small>${esc(u.papelTxt)}</small>
      </button>`).join("");
      popEl.querySelectorAll("[data-ac-idx]").forEach(b => {
        b.onmousedown = ev => {
          ev.preventDefault();
          const u = itensAtuais[Number(b.dataset.acIdx)];
          if (u && taAtual) inserirMencaoNoTextarea(taAtual, u.login, u.nome);
          fecharPop();
        };
      });
    };

    document.addEventListener("click", ev => {
      if (popEl && !popEl.hidden && !popEl.contains(ev.target)) fecharPop();
    });

    document.addEventListener("input", ev => {
      const ta = ev.target;
      if (!ta || ta.tagName !== "TEXTAREA") return;
      if (!ta.matches('[data-inp-coment], [data-c="com"], [data-f="obs"]')) return;
      sincronizarMencoesTextarea(ta);
      const pos = typeof ta.selectionStart === "number" ? ta.selectionStart : ta.value.length;
      const antes = ta.value.slice(0, pos);
      const m = /(^|[\s([{"'])@([^\s@]{0,35})$/.exec(antes);
      if (!m) { fecharPop(); return; }
      const termo = m[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const card = ta.closest(".pc-card");
      const pecaCtx = card && card._pecaRef ? card._pecaRef : null;
      const cands = candidatosMencaoParaPeca(pecaCtx).filter(u => {
        const nm = u.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return !termo || nm.includes(termo) || u.login.toLowerCase().includes(termo);
      });
      if (!cands.length) { fecharPop(); return; }
      taAtual = ta;
      itensAtuais = cands;
      idxAtivo = 0;
      const p = garantirPop();
      const rect = ta.getBoundingClientRect();
      p.style.left = Math.max(10, Math.min(window.innerWidth - 290, rect.left + 12)) + "px";
      p.style.top = Math.min(window.innerHeight - 250, rect.bottom + 4) + "px";
      p.hidden = false;
      renderPop();
    });

    document.addEventListener("keydown", ev => {
      if (!popEl || popEl.hidden || !taAtual || !itensAtuais.length) return;
      if (ev.key === "ArrowDown") { ev.preventDefault(); idxAtivo = (idxAtivo + 1) % itensAtuais.length; renderPop(); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); idxAtivo = (idxAtivo - 1 + itensAtuais.length) % itensAtuais.length; renderPop(); }
      else if (ev.key === "Enter" || ev.key === "Tab") {
        ev.preventDefault();
        const u = itensAtuais[idxAtivo];
        if (u) inserirMencaoNoTextarea(taAtual, u.login, u.nome);
        fecharPop();
      } else if (ev.key === "Escape") {
        fecharPop();
      }
    });
  }

  function eventoNotificaUsuarioCliente(p, h, meuLogin) {
    if (!meuLogin || !h || h.por?.login === meuLogin) return false;
    const ms = Array.isArray(h.mencoes) ? h.mencoes : [];
    if (ms.some(m => (m.login || m) === meuLogin)) return true;
    const souRem = !!(p?.minha || p?.remetente?.login === meuLogin);
    if (souRem && ["comentario", "alteracao_solicitada", "reprovada"].includes(h.tipo)) return true;
    return false;
  }

  function mencoesNaoLidasDaPecaNoCliente(p) {
    const meuLogin = base?.login;
    if (!meuLogin || !Array.isArray(p?.historico)) return [];
    return p.historico.filter(h => {
      if (!eventoNotificaUsuarioCliente(p, h, meuLogin)) return false;
      const vistos = Array.isArray(h.vistoPor) ? h.vistoPor : [];
      return !vistos.includes(meuLogin);
    });
  }

  function usuarioFoiMencionadoNaPeca(p) {
    const meuLogin = base?.login;
    if (!meuLogin || !Array.isArray(p?.historico)) return false;
    return p.historico.some(h => eventoNotificaUsuarioCliente(p, h, meuLogin));
  }

  function rotuloEventoNotificacao(p, h) {
    const souRem = !!(p?.minha || p?.remetente?.login === base?.login);
    if (h.tipo === "alteracao_solicitada") {
      return { icone: "🛠️", badge: "Alteração solicitada", cor: "#1D4F91", bg: "#E5EFFC", verbo: souRem ? "pediu alteração na sua peça" : "pediu alteração e marcou você em" };
    }
    if (h.tipo === "reprovada") {
      return { icone: "❌", badge: "Peça reprovada", cor: "#A12020", bg: "#FDE8E8", verbo: souRem ? "reprovou sua peça" : "reprovou e marcou você em" };
    }
    const ms = Array.isArray(h.mencoes) ? h.mencoes : [];
    const marcouExplicito = (h.comentario || "").includes("@") && ms.some(m => (m.login || m) === base?.login);
    if (souRem && !marcouExplicito) {
      return { icone: "💬", badge: "Novo comentário", cor: "#0B57D0", bg: "#EAF2FF", verbo: "comentou na sua peça" };
    }
    return { icone: "🔔", badge: "Menção (@)", cor: "#92400E", bg: "#FEF3C7", verbo: "mencionou você em" };
  }
