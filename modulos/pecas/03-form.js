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
        <div class="pc-step"><b>${nova ? "3. Material para aprovação (Arquivo ou Reels do Google Drive)" : "Material da nova versão"} <span class="pc-req">*</span></b><span class="pc-sub">Até ${base.maxArquivos} arquivos · JPG, PNG, PDF ou Vídeo · até ${base.maxMB} MB</span></div>
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
      const corpo = { obs: $("obs").value, mencoes: coletarMencoesDoTextarea($("obs")), arquivos: arquivos.map(a => ({ chave: a.chave, nome: a.file.name })), links, tipoMidia };
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
