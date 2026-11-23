  // ---------- Envio dos arquivos direto ao armazenamento (com retry e fallback via servidor) ----------
  function extrairErroXhrBlob(status, responseText) {
    let code = "";
    let message = "";
    const bruto = String(responseText || "").trim();
    if (bruto.startsWith("{")) {
      try {
        const j = JSON.parse(bruto);
        code = String(j?.error?.code || j?.code || "").trim().toLowerCase();
        message = String(j?.error?.message || j?.message || j?.msg || "").trim();
      } catch {}
    }
    if (code === "content_type_not_allowed" || /content\s*type.*not allowed/i.test(message)) {
      return "O armazenamento recusou o formato/tipo do arquivo.";
    }
    if (code === "file_too_large" || status === 413) {
      return "O arquivo excede o tamanho máximo permitido.";
    }
    if (code === "rate_limited" || status === 429) {
      return "Muitos envios ao mesmo tempo. Aguarde alguns segundos e tente de novo.";
    }
    if (code === "forbidden" || code === "store_suspended" || status === 401 || status === 403) {
      return message
        ? `O armazenamento recusou a permissão de envio (${status}): ${message.slice(0, 120)}`
        : `O armazenamento recusou a permissão de envio (${status}).`;
    }
    if (code === "service_unavailable" || status >= 500) {
      return `O serviço de armazenamento está temporariamente indisponível (${status}).`;
    }
    if (message) {
      return `O armazenamento recusou o arquivo (${status}): ${message.slice(0, 140)}`;
    }
    return status ? `O armazenamento recusou o arquivo (${status}).` : "Falha de conexão com o armazenamento.";
  }

  function lerComoBase64(blob) {
    return new Promise((ok, erro) => {
      const fr = new FileReader();
      fr.onload = () => {
        const s = String(fr.result || "");
        const idx = s.indexOf(",");
        ok(idx >= 0 ? s.slice(idx + 1) : s);
      };
      fr.onerror = () => erro(new Error("Não deu para ler o arquivo selecionado."));
      fr.readAsDataURL(blob);
    });
  }

  async function otimizarImagemParaFallback(file, maxBytes) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, erro) => {
        const el = new Image();
        el.onload = () => ok(el);
        el.onerror = () => erro(new Error("Não foi possível processar a imagem para o envio alternativo."));
        el.src = url;
      });
      const wOrig = img.naturalWidth || img.width || 1;
      const hOrig = img.naturalHeight || img.height || 1;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Navegador não suporta otimização de imagem.");
      const stem = String(file.name || "imagem").replace(/\.[^.]+$/, "") || "imagem";
      const limites = [2400, 1800, 1400];
      const qualidades = [0.9, 0.82, 0.72];
      for (const maxLado of limites) {
        const escala = Math.min(1, maxLado / Math.max(wOrig, hOrig));
        const w = Math.max(1, Math.round(wOrig * escala));
        const h = Math.max(1, Math.round(hOrig * escala));
        canvas.width = w;
        canvas.height = h;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        for (const q of qualidades) {
          const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", q));
          if (blob && blob.size > 0 && blob.size <= maxBytes) {
            return { blob, nome: `${stem}.jpg` };
          }
        }
      }
      throw new Error(`A imagem ainda passa de ${Math.round(maxBytes / 1048576)} MB para envio alternativo. Envie via link do Google Drive.`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function enviarDiretoUmaTentativa(url, headers, tipo, storeId, file, attempt, onProg) {
    return new Promise((ok, erro) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url, true);
      Object.entries(headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.setRequestHeader("x-content-type", tipo);
      xhr.setRequestHeader("x-content-length", String(file.size));
      xhr.setRequestHeader("x-api-blob-request-id", `${storeId || "qz"}:${Date.now()}:${Math.random().toString(16).slice(2)}`);
      xhr.setRequestHeader("x-api-blob-request-attempt", String(attempt));
      xhr.upload.onprogress = e => { if (e.lengthComputable) onProg(e.loaded / e.total); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return ok();
        const err = new Error(extrairErroXhrBlob(xhr.status, xhr.responseText));
        err.status = xhr.status;
        err.retentavel = xhr.status >= 500 || xhr.status === 429;
        erro(err);
      };
      xhr.onerror = () => {
        const err = new Error("Falha de conexão no envio direto.");
        err.status = 0;
        err.retentavel = true;
        erro(err);
      };
      xhr.send(new Blob([file], { type: tipo }));
    });
  }

  let fallbackServidorAte = 0;

  async function enviarArquivo(file, onProg, onStatus) {
    const maxServConfig = (Number(base?.maxMBServidor) || 3) * 1048576;
    const maxServSeguro = Math.min(maxServConfig, Math.floor(2.8 * 1048576));
    const ehImagem = /\.(jpe?g|jfif|png|webp|gif)$/i.test(file.name) || String(file.type || "").startsWith("image/");

    const enviarViaFallback = async () => {
      const tentarEnvio = async (blob, nomeEnvio) => {
        const b64 = await lerComoBase64(blob);
        const r = await api("upload.arquivo", { nome: nomeEnvio, b64 });
        if (r?.armazenamento === "banco") fallbackServidorAte = Date.now() + 5 * 60 * 1000;
        return { chave: r.chave, nome: r.nome || nomeEnvio };
      };

      if (file.size <= maxServSeguro) {
        onStatus && onStatus("enviando (alternativo)…");
        onProg(0.6);
        try {
          return await tentarEnvio(file, file.name);
        } catch (err) {
          if (err?.status === 413 && ehImagem) {
            onStatus && onStatus("otimizando imagem…");
            onProg(0.4);
            const ot = await otimizarImagemParaFallback(file, maxServSeguro);
            onStatus && onStatus("enviando (alternativo)…");
            onProg(0.7);
            return await tentarEnvio(ot.blob, ot.nome);
          }
          throw err;
        }
      }
      if (ehImagem) {
        onStatus && onStatus("otimizando imagem…");
        onProg(0.4);
        const ot = await otimizarImagemParaFallback(file, maxServSeguro);
        onStatus && onStatus("enviando (alternativo)…");
        onProg(0.7);
        return await tentarEnvio(ot.blob, ot.nome);
      }
      return null;
    };

    if (Date.now() < fallbackServidorAte && (file.size <= maxServSeguro || ehImagem)) {
      return await enviarViaFallback();
    }

    let t = null;
    let erroDireto = null;
    try {
      t = await api("upload.token", { nome: file.name, tipo: file.type, tamanho: file.size });
    } catch (e) {
      if (e?.status === 400 || e?.status === 403) throw e;
      erroDireto = e;
    }

    if (t) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await enviarDiretoUmaTentativa(t.url, t.headers, t.tipo, t.storeId, file, attempt, onProg);
          return { chave: t.chave, nome: file.name };
        } catch (e) {
          erroDireto = e;
          if (e?.retentavel && attempt === 0) {
            await new Promise(r => setTimeout(r, 450));
            continue;
          }
          break;
        }
      }
    }

    // Fallback automático pelo servidor (same-origin) caso o PUT direto ao armazenamento falhe na rede/navegador
    if (file.size <= maxServSeguro || ehImagem) {
      try {
        const resFb = await enviarViaFallback();
        if (resFb) return resFb;
      } catch (eFb) {
        if (eFb?.message === "Não deu para concluir. Tente de novo." && erroDireto?.message) {
          throw new Error(erroDireto.message);
        }
        throw eFb;
      }
    }
    throw erroDireto || new Error(`Não foi possível enviar o arquivo. Se passar de ${Math.round(maxServConfig / 1048576)} MB, envie por link do Google Drive.`);
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
    const tipoMidiaPadrao = peca?.tipoMidia || "online";
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
        <div class="pc-step"><b>${nova ? "2. Tipo de peça" : "Tipo de peça"} <span class="pc-req">*</span></b><span class="pc-sub">Obrigatório · Selecione se a peça é Online ou Offline</span></div>
        <div class="pc-tipo-grid">
          <label class="pc-tipo-card ${tipoMidiaPadrao === "online" ? "ativo online" : ""}" data-tipo-card="online">
            <input type="radio" name="pc-tipo-midia" data-f="tipo-midia" value="online" ${tipoMidiaPadrao === "online" ? "checked" : ""}>
            <div>
              <b>🌐 Peça Online</b>
              <div class="pc-sub">Redes sociais, Reels, anúncios digitais, carrossel, stories, etc.</div>
            </div>
          </label>
          <label class="pc-tipo-card ${tipoMidiaPadrao === "offline" ? "ativo offline" : ""}" data-tipo-card="offline">
            <input type="radio" name="pc-tipo-midia" data-f="tipo-midia" value="offline" ${tipoMidiaPadrao === "offline" ? "checked" : ""}>
            <div>
              <b>📦 Peça Offline</b>
              <div class="pc-sub">Impressos, outdoors, folders, banners físicos, adesivos, eventos, etc.</div>
            </div>
          </label>
        </div>
      </div>
      <div class="full">
        <div class="pc-step"><b>${nova ? "3. Material para aprovação (Arquivo ou Reels do Google Drive)" : "Material da nova versão"} <span class="pc-req">*</span></b><span class="pc-sub">Até ${base.maxArquivos} arquivos · JPG, PNG, WEBP, GIF, PDF ou Vídeo · até ${base.maxMB} MB</span></div>
        <div class="pc-drop" data-f="drop">
          <div class="ico">📤</div>
          <div class="cta">Arraste os arquivos da peça aqui ou <u>clique para escolher no computador</u></div>
          <div class="hint">Imagens (JPG, PNG, WEBP, GIF), PDF ou Vídeo (MP4, MOV) · Ou cole abaixo o link do Google Drive</div>
        </div>
        <input type="file" data-f="file" multiple accept=".jpg,.jpeg,.jfif,.png,.webp,.gif,.pdf,.mp4,.mov,.webm,image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/quicktime,video/webm" hidden>
        <div class="pc-fs" data-f="lista"></div>
        <div class="pc-reels-box">
          <b>🎬 Link de material no Google Drive (Imagem, Reels ou Vídeo)</b>
          <div class="pc-sub" style="margin-bottom:6px">Cole o link compartilhado do Google Drive (<code>https://drive.google.com/file/d/...</code>) com permissão <b>"Qualquer pessoa com o link"</b>. Imagens abrem com visualização ampliada (pop-up) e vídeos carregam como player!</div>
          <textarea data-f="links" rows="2" placeholder="https://drive.google.com/file/d/.../view?usp=sharing (um link por linha)" style="width:100%"></textarea>
          <div data-f="reels-preview" class="pc-sub" style="margin-top:4px;color:var(--ok);font-weight:600"></div>
        </div>
      </div>
      <div class="full pc-opc">
        <div class="pc-opc-h"><b>${nova ? "4. Detalhes adicionais" : "Detalhes adicionais"}</b><span class="pc-badge-opc">Tudo opcional</span></div>
        <div class="pc-grid">
          <label class="full">Título da peça <span class="pc-sub">(opcional)</span>
            <input data-f="titulo" maxlength="160" placeholder="${nova ? "Automático: Peça #1 | Nome do Cliente" : "Manter título atual"}" value="${!nova && peca ? esc(peca.titulo || "") : ""}">
            ${nova ? '<span class="pc-sub" data-f="titulo-hint">Se deixar em branco, será salvo como <b>Peça #X | Nome do Cliente</b>.</span>' : '<span class="pc-sub">Se desejar, ajuste o título da peça para esta nova versão.</span>'}
          </label>
          <label class="full">Observação / Legenda <span class="pc-sub">(opcional)</span>
            <textarea data-f="obs" rows="2" placeholder="${nova ? "Contexto, legenda ou orientações para quem vai aprovar" : "O que mudou nesta versão"}"></textarea>
          </label>
          ${nova ? `<div class="full"><label class="pc-sub" style="margin-bottom:6px;display:block">Quem vai aprovar? (opcional · todos os coordenadores têm direito de aprovar)</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;padding:10px;border:1px solid var(--line);border-radius:8px;background:#fff;max-height:150px;overflow-y:auto">
              ${(base.usuarios || []).map(u => `<label style="display:inline-flex;gap:7px;align-items:center;padding:5px 10px 5px 6px;border:1px solid var(--line2);border-radius:999px;background:#FAFBFD;font-size:13px;font-weight:500;cursor:pointer">
                <input type="checkbox" data-f="aprovador" value="${esc(u.login)}" style="min-height:0;width:15px;height:15px">
                ${avatarHtml(u, "xs")}
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
    const atualizarCardsTipo = () => {
      const v = alvo.querySelector('[data-f="tipo-midia"]:checked')?.value || "online";
      alvo.querySelectorAll("[data-tipo-card]").forEach(card => {
        const eh = card.dataset.tipoCard === v;
        card.className = "pc-tipo-card" + (eh ? ` ativo ${v}` : "");
      });
    };
    alvo.querySelectorAll('[data-f="tipo-midia"]').forEach(r => {
      r.onchange = atualizarCardsTipo;
    });
    atualizarCardsTipo();
    const pintar = a => {
      a.el.className = "pc-f" + (a.erro ? " erro" : a.chave ? " ok" : "");
      const statusTexto = a.erro ? "erro" : a.chave ? "enviado" : (a.statusTxt || (Math.round(a.prog * 100) + "%"));
      a.el.innerHTML = `<span class="n" title="${esc(a.file.name)}">${esc(a.file.name)}</span>
        <span class="pc-sub">${mb(a.file.size)}</span>
        <span class="pc-prog"><i style="width:${Math.round(a.prog * 100)}%"></i></span>
        <span class="pc-sub" title="${esc(a.erro || statusTexto)}">${esc(statusTexto)}</span>
        <div class="pc-f-act">
          ${a.erro ? `<button class="btn small" type="button" data-f-act="retry" style="padding:2px 8px;min-height:0;font-size:12px" title="Tentar enviar novamente">↻ Tentar de novo</button>` : ""}
          <button class="btn" type="button" data-f-act="rm" style="padding:2px 8px;min-height:0" title="Remover">✕</button>
        </div>
        ${a.erro ? `<div class="pc-f-err">${esc(a.erro)}</div>` : ""}`;
      a.el.querySelector('[data-f-act="rm"]').onclick = () => { arquivos.splice(arquivos.indexOf(a), 1); a.el.remove(); };
      const retryBtn = a.el.querySelector('[data-f-act="retry"]');
      if (retryBtn) {
        retryBtn.onclick = () => {
          a.erro = null;
          a.prog = 0;
          a.statusTxt = "";
          pintar(a);
          iniciarEnvio(a);
        };
      }
    };
    const iniciarEnvio = a => {
      a.promessa = enviarArquivo(
        a.file,
        p => { a.prog = p; pintar(a); },
        s => { a.statusTxt = s; pintar(a); }
      ).then(
        r => { a.chave = r.chave; a.nomeFinal = r.nome || a.file.name; a.prog = 1; a.statusTxt = ""; pintar(a); },
        e => { a.erro = e?.message || "Falha no envio do arquivo."; a.statusTxt = ""; pintar(a); }
      );
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
        if (!/\.(jpe?g|jfif|png|webp|gif|pdf|mp4|mov|webm)$/i.test(file.name)) { msg(`"${file.name}": envie JPG, PNG, WEBP, GIF, PDF ou Vídeo (MP4/MOV/WEBM).`); continue; }
        if (file.size > base.maxMB * 1048576) { msg(`"${file.name}" passa de ${base.maxMB} MB.`); continue; }
        const a = { file, prog: 0, chave: null, nomeFinal: null, erro: null, statusTxt: "", el: document.createElement("div") };
        arquivos.push(a); $("lista").appendChild(a.el); pintar(a);
        iniciarEnvio(a);
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
      $("reels-preview").textContent = comId.length ? `✓ ${comId.length} link(s) do Google Drive pronto(s) para carregar.` : "";
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
      const radTipo = alvo.querySelector('[data-f="tipo-midia"]:checked');
      const tipoMidia = radTipo ? radTipo.value : "";
      if (!tipoMidia) {
        msg("Selecione se a peça é Online ou Offline.");
        return;
      }
      if (arquivos.some(a => !a.chave && !a.erro)) { msg("Aguarde o fim do envio dos arquivos…"); await Promise.all(arquivos.map(a => a.promessa)); }
      if (arquivos.some(a => a.erro)) return msg("Algum arquivo falhou. Remova-o ou envie de novo.");
      const links = $("links").value.split(/\s+/).map(s => s.trim()).filter(Boolean);
      if (!arquivos.length && !links.length) return msg("Anexe pelo menos um arquivo ou informe o link do Reels/Google Drive.");
      const corpo = { obs: $("obs").value, mencoes: coletarMencoesDoTextarea($("obs")), arquivos: arquivos.map(a => ({ chave: a.chave, nome: a.nomeFinal || a.file.name })), links, tipoMidia };
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
