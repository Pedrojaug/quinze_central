  function cartao(p, extra) {
    atualizarMapaPerfis();
    const atual = p.versoes[p.versoes.length - 1], anteriores = p.versoes.slice(0, -1).reverse();
    const { mediaHtml, metaHtml, temMidia } = versaoPartes(p, atual, false);
    const meuLogin = base?.login || "";
    const hist = (p.historico || []).filter(h => h.tipo !== "envio" || h.comentario).map(h => {
      const ehCom = h.tipo === "comentario";
      const acao = ehCom ? "comentou" : (ACAO[h.tipo] || esc(h.tipo));
      const det = ehCom ? "" : ` a versão ${h.versao}`;
      const mencoesEv = Array.isArray(h.mencoes) ? h.mencoes : [];
      const mencionouEu = mencoesEv.some(m => (m.login || m) === meuLogin);
      const autorInfo = resolverInfoUsuario(h.por);
      const pillsExtras = mencoesEv
        .filter(m => {
          const nm = (m.nome || m.login || "").toLowerCase();
          const cm = (h.comentario || "").toLowerCase();
          return nm && !cm.includes("@" + nm) && !cm.includes("@" + (m.login || "").toLowerCase());
        })
        .map(m => `<span class="pc-tag-mencao${(m.login || m) === meuLogin ? " eu" : ""}">@${esc(resolverInfoUsuario(m).nome)}</span>`)
        .join(" ");
      return `<li style="${mencionouEu ? "background:var(--amber-soft);padding:7px 9px;border-radius:6px;border-left:3px solid var(--amber-bd)" : ""}">
        <div class="pc-hist-item">
          ${avatarHtml(autorInfo, "md")}
          <div class="pc-hist-body">
            <div><b>${esc(autorInfo.nome)}</b> ${acao}${det} · <span class="pc-sub">${brHora(h.em)}</span>${pillsExtras ? ` ${pillsExtras}` : ""}</div>
            ${h.comentario ? `<span class="c">${formatarTextoComMencoes(h.comentario, mencoesEv)}</span>` : ""}
          </div>
        </div>
      </li>`;
    }).join("");
    const aprovTxt = (p.aprovadores && p.aprovadores.length)
      ? ` · Aprovadores sugeridos: <b>${esc(p.aprovadores.map(a => resolverInfoUsuario(a).nome).join(", "))}</b>`
      : " · Aprovador: <i>Qualquer coordenador</i>";
    const podeApagarPeca = !!(base && (base.ehGestao || base.funcao === "mestre"));
    const ehBloqueado = ["social", "atendimento"].includes(base && base.funcao);
    const souRemetente = !!(p.minha || (base && p.remetente && p.remetente.login === base.login));
    const podeEditarPeca = !ehBloqueado && (souRemetente || (base && (base.podeDecidir || base.ehGestao || base.funcao === "mestre")));
    const podeComentar = p.status !== "aprovada";
    const mencoesNaoLidas = mencoesNaoLidasDaPecaNoCliente(p);
    const temAlteracaoNaoLida = mencoesNaoLidas.some(h => h.tipo === "alteracao_solicitada");
    const temReprovacaoNaoLida = mencoesNaoLidas.some(h => h.tipo === "reprovada");
    const rotuloBannerCard = temAlteracaoNaoLida
      ? "🛠️ <b>Alteração solicitada neste material</b> por"
      : temReprovacaoNaoLida
        ? "❌ <b>Este material foi reprovado</b> por"
        : souRemetente
          ? "💬 <b>Novo comentário / marcação no seu material</b> por"
          : "🔔 <b>Você foi marcado neste material</b> por";
    const bannerMencao = mencoesNaoLidas.length ? `<div class="pc-card-mencao-banner">
      <span>${rotuloBannerCard} ${esc(mencoesNaoLidas.map(m => resolverInfoUsuario(m.por).nome).filter((v, i, a) => a.indexOf(v) === i).join(", "))}</span>
      <button class="btn small" type="button" data-marcar-mencao-lida="${esc(p.id)}" style="background:var(--card);border-color:var(--amber-bd);color:var(--amber);padding:2px 9px;min-height:0">✓ Marcar como visto</button>
    </div>` : "";
    const boxComentario = podeComentar ? `<div class="pc-coment-area" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line2)">
      <details style="font-size:13px" data-coment-wrap="${esc(p.id)}"${mencoesNaoLidas.length ? " open" : ""}>
        <summary style="cursor:pointer;color:var(--blue);font-weight:600;user-select:none;display:inline-flex;align-items:center;gap:5px">💬 Adicionar comentário / marcar aprovador</summary>
        <div style="margin-top:8px">
          <textarea data-inp-coment="${esc(p.id)}" placeholder="Escreva um comentário… Digite @ para mencionar alguém" style="width:100%;min-height:58px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;box-sizing:border-box"></textarea>
          <div class="pc-bar" style="margin-top:8px;justify-content:flex-end">
            <button class="btn small primary" type="button" data-enviar-coment="${esc(p.id)}">Enviar comentário</button>
          </div>
        </div>
      </details>
    </div>` : "";
    const ehOffline = (p.tipoMidia || "").toLowerCase() === "offline";
    const tagTipo = ehOffline
      ? `<span class="pc-tag-offline" title="Material Offline (impressos, outdoors, brindes, eventos, etc.)">📦 Offline</span>`
      : `<span class="pc-tag-online" title="Material Online (redes sociais, anúncios digitais, reels, etc.)">🌐 Online</span>`;

    const infoCol = `${metaHtml}
      ${anteriores.length ? `<details class="pc-ver"><summary>Versões anteriores (${anteriores.length})</summary>${anteriores.map(v => `<div style="margin-top:8px">${versaoHtml(p, v)}</div>`).join("")}</details>` : ""}
      ${hist ? `<div class="pc-ver"><div class="pc-sub">Comentários e decisões</div><ul class="pc-hist">${hist}</ul></div>` : ""}
      ${boxComentario}
      ${extra || ""}`;

    const corpoCard = temMidia
      ? `<div class="pc-split">
          <div class="pc-media-pane">${mediaHtml}</div>
          <div class="pc-info-pane">${infoCol}</div>
        </div>`
      : `<div style="margin-top:8px">${infoCol}</div>`;

    const remInfo = resolverInfoUsuario(p.remetente);

    return `<div class="pc-card${mencoesNaoLidas.length ? " mencionado-nao-lido" : ""}" id="peca-card-${esc(p.id)}" data-id="${esc(p.id)}">
      ${bannerMencao}
      <div class="pc-top"><div class="t">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>${esc(p.titulo)}</b><span class="pc-cli">${esc(p.clienteNome)}</span>${tagTipo}</div>
        <div class="pc-sub" style="margin-top:4px;display:flex;align-items:center;gap:5px;flex-wrap:wrap"><span>Enviada por</span>${avatarHtml(remInfo, "sm")}<b>${esc(remInfo.nome)}</b><span>${p.versao > 1 ? `· <b>v${p.versao}</b> (reenviada)` : ""}${aprovTxt}</span></div></div>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="st ${p.status}">${ST[p.status]}</span>
          ${podeEditarPeca ? `<button class="btn" type="button" data-x="editar-peca" data-id="${esc(p.id)}" title="Editar material e enviar nova versão" style="padding:3px 8px;min-height:0;font-size:12px;color:var(--blue);border-color:rgba(59,130,246,.35)">✏️ Editar</button>` : ""}
          ${podeApagarPeca ? `<button class="btn" type="button" data-del-peca="${esc(p.id)}" title="Apagar peça (exige senha mestre)" style="padding:3px 8px;min-height:0;font-size:12px;color:var(--danger)">🗑️ Apagar</button>` : ""}
        </div></div>
      ${corpoCard}
      <div data-box="edit-${esc(p.id)}"></div>
    </div>`;
  }

  const LIMITE_PAGINA_PECAS = 25;
  function rodapePaginacao(total, exibindo) {
    if (exibindo >= total) return "";
    const faltam = total - exibindo;
    const prox = Math.min(LIMITE_PAGINA_PECAS, faltam);
    return `<div class="pc-card pc-paginacao-rodape" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <span class="pc-sub">Exibindo <b>${exibindo}</b> de <b>${total}</b> materiais</span>
      <button class="btn primary" type="button" data-x="mostrar-mais">Mostrar mais ${prox} (${faltam} restante${faltam > 1 ? "s" : ""})</button>
    </div>`;
  }

  function assinaturaMidiaPeca(p) {
    const atual = p?.versoes?.[p.versoes.length - 1];
    if (!atual) return "";
    const arqs = (atual.arquivos || []).map(a => `${a.i}:${a.nome}:${a.expirado ? 1 : 0}:${a.temThumb ? 1 : 0}`).join(",");
    const lnks = (atual.links || []).join(",");
    const meta = Object.entries(atual.linksMeta || {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, m]) => `${k}=${m?.tipo || ""}:${m?.nome || ""}`)
      .join(",");
    return `${atual.n}|${arqs}|${lnks}|${meta}`;
  }

  function assinaturaCardPeca(p, extraSig = "") {
    atualizarMapaPerfis();
    const autores = new Set([p?.remetente?.login, ...(p?.aprovadores || []).map(a => a?.login), ...(p?.historico || []).map(h => h?.por?.login)].filter(Boolean));
    const avSig = [...autores].sort().map(lg => {
      const info = mapaPerfisUsuarios[lg];
      return `${lg}:${info?.nome || ""}:${(info?.avatar || "").length}`;
    }).join(",");
    const histSig = (p?.historico || []).map(h => `${h.id || h.em}:${h.tipo}:${(h.mencoes || []).length}:${(h.vistoPor || []).join(",")}`).join(";");
    return `${p?.id}|${p?.titulo}|${p?.clienteNome}|${p?.tipoMidia}|${p?.status}|${p?.versao}|${p?.atualizadoEm || ""}|${assinaturaMidiaPeca(p)}|${histSig}|${avSig}|${extraSig}`;
  }

  function renderizarListaPecasIncremental(container, visiveis, { montarCard, extraSigFn, rodapeHtml = "", vazioHtml = "" }) {
    if (!container) return;
    if (!Array.isArray(visiveis) || !visiveis.length) {
      container.innerHTML = vazioHtml;
      return;
    }
    container.querySelectorAll(":scope > .pc-vazio, :scope > .pc-paginacao-rodape").forEach(el => el.remove());
    const mapaExistentes = new Map();
    container.querySelectorAll(":scope > .pc-card[data-id]").forEach(c => {
      mapaExistentes.set(c.dataset.id, c);
    });
    const novosNos = [];
    for (const p of visiveis) {
      const cardSig = assinaturaCardPeca(p, extraSigFn ? extraSigFn(p) : "");
      const mediaSig = assinaturaMidiaPeca(p);
      const existente = mapaExistentes.get(p.id);
      if (existente && existente.dataset.cardSig === cardSig) {
        existente._pecaRef = p;
        mapaExistentes.delete(p.id);
        novosNos.push(existente);
        continue;
      }
      const tpl = document.createElement("template");
      tpl.innerHTML = montarCard(p).trim();
      const novoCard = tpl.content.firstElementChild;
      if (!novoCard) continue;
      if (existente) {
        if (existente.dataset.mediaSig === mediaSig) {
          const mediaAntiga = existente.querySelector(".pc-media-pane");
          const mediaNova = novoCard.querySelector(".pc-media-pane");
          if (mediaAntiga && mediaNova) mediaNova.replaceWith(mediaAntiga);
        }
        mapaExistentes.delete(p.id);
        existente.replaceWith(novoCard);
      }
      novoCard.dataset.cardSig = cardSig;
      novoCard.dataset.mediaSig = mediaSig;
      novoCard._pecaRef = p;
      novosNos.push(novoCard);
    }
    for (const sobrando of mapaExistentes.values()) sobrando.remove();
    novosNos.forEach((node, idx) => {
      const atualNaPos = container.children[idx] || null;
      if (atualNaPos !== node) container.insertBefore(node, atualNaPos);
    });
    if (rodapeHtml) {
      const tplRod = document.createElement("template");
      tplRod.innerHTML = rodapeHtml.trim();
      const rodEl = tplRod.content.firstElementChild;
      if (rodEl) {
        rodEl.classList.add("pc-paginacao-rodape");
        container.appendChild(rodEl);
      }
    }
  }

  // ---------- Badge de notificação nas abas Fila de aprovação e Envio e sincronização em tempo real ----------
  function atualizarBadgeFila(pecasLista) {
    if (!Array.isArray(pecasLista)) return;
    const qtdPendentes = pecasLista.filter(p => p && p.status === "pendente").length;
    const tabBtn = document.querySelector('nav.tabs button[data-tab="fila"]');
    if (tabBtn) {
      let badge = tabBtn.querySelector(".pc-tab-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "pc-tab-badge";
        tabBtn.appendChild(badge);
      }
      if (qtdPendentes > 0) {
        badge.textContent = String(qtdPendentes);
        badge.title = `${qtdPendentes} peça${qtdPendentes === 1 ? "" : "s"} pendente${qtdPendentes === 1 ? "" : "s"} de aprovação`;
        badge.hidden = false;
      } else {
        badge.textContent = "0";
        badge.hidden = true;
      }
    }
    // Badge na aba Envio para o designer ver peças suas com alteração solicitada ou comentários não lidos
    const tabEnvio = document.querySelector('nav.tabs button[data-tab="envio"]');
    if (tabEnvio) {
      const minhasComAlerta = pecasLista.filter(p => p && p.minha && (p.status === "alteracao_solicitada" || mencoesNaoLidasDaPecaNoCliente(p).length > 0)).length;
      let badgeEnv = tabEnvio.querySelector(".pc-tab-badge");
      if (!badgeEnv) {
        badgeEnv = document.createElement("span");
        badgeEnv.className = "pc-tab-badge";
        tabEnvio.appendChild(badgeEnv);
      }
      if (minhasComAlerta > 0) {
        badgeEnv.textContent = String(minhasComAlerta);
        badgeEnv.title = `${minhasComAlerta} peça${minhasComAlerta === 1 ? "" : "s"} sua${minhasComAlerta === 1 ? "" : "s"} com pedido de alteração ou comentário novo`;
        badgeEnv.hidden = false;
      } else {
        badgeEnv.textContent = "0";
        badgeEnv.hidden = true;
      }
    }
  }

  const assinaturaListaPecas = arr => {
    const pSig = Object.entries(mapaPerfisUsuarios || {}).map(([lg, u]) => `${lg}:${u.nome}:${(u.avatar || "").length}`).join(",");
    return pSig + "||" + (arr || []).map(p => {
      const hSig = (p.historico || []).map(h => `${h.id || h.em}:${(h.mencoes || []).length}:${(h.vistoPor || []).join(",")}`).join(";");
      return `${p.id}:${p.status}:${p.versao}:${p.atualizadoEm || ""}:${hSig}`;
    }).join("|");
  };

  // Controle de notificações em tempo real de menções (@) para o usuário logado
  const mencoesJaNotificadas = new Set();
  let primeiraCargaNotifConcluida = false;

  function verificarNovasMencoesNotificar(todasPecas, toastFn) {
    if (!base?.login || !Array.isArray(todasPecas)) return;
    const novasParaNotificar = [];
    for (const p of todasPecas) {
      const naoLidas = mencoesNaoLidasDaPecaNoCliente(p);
      for (const h of naoLidas) {
        const key = `${p.id}_${h.id || h.em}`;
        if (!mencoesJaNotificadas.has(key)) {
          mencoesJaNotificadas.add(key);
          if (primeiraCargaNotifConcluida) {
            novasParaNotificar.push({ peca: p, hist: h });
          }
        }
      }
    }
    primeiraCargaNotifConcluida = true;
    if (!novasParaNotificar.length) return;
    const ult = novasParaNotificar[novasParaNotificar.length - 1];
    const rot = rotuloEventoNotificacao(ult.peca, ult.hist);
    const msg = `${rot.icone} ${ult.hist.por?.nome || "Alguém"} ${rot.verbo} "${ult.peca.titulo}" (${ult.peca.clienteNome})`;
    if (typeof toastFn === "function") toastFn(msg);
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        const n = new Notification(`Central Quinze · ${rot.badge}`, {
          body: `${ult.hist.por?.nome || "Alguém"} ${rot.verbo} "${ult.peca.titulo}": ${(ult.hist.comentario || "").slice(0, 120)}`,
          tag: `qz-mencao-${ult.peca.id}`,
        });
        n.onclick = () => {
          window.focus();
          const card = document.getElementById(`peca-card-${ult.peca.id}`);
          if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
        };
      }
    } catch {}
  }

  function renderPainelNotificacoesMencoes(todasPecas) {
    if (!base?.login || !Array.isArray(todasPecas)) return "";
    const itens = [];
    for (const p of todasPecas) {
      for (const h of mencoesNaoLidasDaPecaNoCliente(p)) {
        itens.push({ peca: p, hist: h });
      }
    }
    if (!itens.length) return "";
    itens.sort((a, b) => (b.hist.em || "").localeCompare(a.hist.em || ""));
    const permNav = ("Notification" in window && Notification.permission === "default")
      ? `<button class="btn small" type="button" data-x="ativar-notif-nav" style="background:var(--card);border-color:var(--amber-bd);color:var(--amber)">🔔 Ativar alertas do navegador</button>`
      : "";
    return `<div class="pc-notif-panel">
      <div class="pc-notif-head">
        <b>🔔 Você tem ${itens.length} notificação${itens.length === 1 ? "" : "ões"} pendente${itens.length === 1 ? "" : "s"} (pedidos de alteração, comentários ou menções)</b>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          ${permNav}
          <button class="btn small" type="button" data-x="ler-todas-mencoes" style="background:var(--card);border-color:var(--amber-bd);color:var(--amber)">✓ Marcar todas como vistas</button>
        </div>
      </div>
      <div class="pc-notif-list">
        ${itens.slice(0, 8).map(({ peca, hist }) => {
          const autorInfo = resolverInfoUsuario(hist.por);
          const rot = rotuloEventoNotificacao(peca, hist);
          return `<div class="pc-notif-item">
          <div style="display:flex;align-items:flex-start;gap:12px;flex:1;min-width:200px">
            ${avatarHtml(autorInfo, "md")}
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <span style="font-size:11px;font-weight:700;padding:2px 7px;border-radius:6px;background:${rot.bg};color:${rot.cor}">${rot.icone} ${esc(rot.badge)}</span>
                <span><b>${esc(autorInfo.nome)}</b> ${esc(rot.verbo)} <b>${esc(peca.titulo)}</b></span>
                <span class="pc-cli">${esc(peca.clienteNome)}</span>
                <span class="pc-sub">· ${brHora(hist.em)}</span>
              </div>
              <div style="margin-top:4px;color:var(--ink)">${formatarTextoComMencoes(hist.comentario || "", hist.mencoes || [])}</div>
            </div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
            <button class="btn small primary" type="button" data-ir-peca="${esc(peca.id)}">Ver peça ↓</button>
            <button class="btn small" type="button" data-marcar-mencao-lida="${esc(peca.id)}">✓ Visto</button>
          </div>
        </div>`;
        }).join("")}
      </div>
    </div>`;
  }

  function usuarioInteragindoEm(rootEl) {
    if (!rootEl) return false;
    const dlgMidia = document.getElementById("qzDlgMidiaPecas");
    const dlgMestre = document.getElementById("qzDlgMestrePecas");
    if ((dlgMidia && dlgMidia.open) || (dlgMestre && dlgMestre.open)) return true;
    const ae = document.activeElement;
    if (ae && rootEl.contains(ae) && ["TEXTAREA", "INPUT", "SELECT"].includes(ae.tagName)) {
      if (ae.closest(".pc-card, .pc-dec, .pc-coment-area")) return true;
    }
    for (const ta of rootEl.querySelectorAll('textarea[data-c="com"], textarea[data-inp-coment]')) {
      if (ta.value && ta.value.trim()) return true;
    }
    for (const det of rootEl.querySelectorAll("details[open]")) {
      if (det.closest(".pc-card")) return true;
    }
    for (const boxEdit of rootEl.querySelectorAll('[data-box^="edit-"], [data-box^="re-"]')) {
      if (boxEdit.children.length > 0) return true;
    }
    for (const vid of rootEl.querySelectorAll("video")) {
      if (!vid.paused && !vid.ended) return true;
    }
    return false;
  }
