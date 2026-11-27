// Formulário de abertura de chamado (/suporte)
(function () {
  const SUP = (window.__QZ_SUP = window.__QZ_SUP || {});
  const { esc } = SUP;

  const TIPO_DESC = {
    bug: { icone: "🐞", desc: "Algo não funciona, quebrou ou deu erro" },
    melhoria: { icone: "✨", desc: "Funciona hoje, mas pode ficar melhor" },
    sugestao: { icone: "💡", desc: "Ideia nova ou recurso para a Central" },
  };

  function areaInicial(meta, origemQuery) {
    const ids = new Set((meta.areas || []).map(a => a.id));
    if (origemQuery && ids.has(origemQuery)) return origemQuery;
    return "geral";
  }

  SUP.montarFormulario = function montarFormulario(container, state, { aoCriar }) {
    const qs = new URLSearchParams(location.search);
    const origemQuery = String(qs.get("origem") || "").trim();
    const origemUrlRaw = String(qs.get("url") || "").trim();

    let tipoSel = "bug";
    let urgenteSel = false;
    let arquivos = [];

    function metaTecnicaAtual() {
      return {
        navegador: String(navigator.userAgent || "").slice(0, 160),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        tema: document.documentElement.dataset.theme || "light",
      };
    }

    function render() {
      const u = state.meta.usuario || {};
      const areas = state.meta.areas || [];
      const tipos = state.meta.tipos || [];
      const maxAnexos = state.meta.maxAnexos || 5;
      const areaPadrao = areaInicial(state.meta, origemQuery);

      container.innerHTML = `
        <div class="sup-card">
          <div class="sup-card-head">
            <h2>Abrir chamado</h2>
            <p>Relate um erro, peça uma melhoria ou envie uma sugestão direto para o desenvolvimento.</p>
          </div>
          <div class="sup-user-strip">
            <div><span>Solicitante:</span> <b>${esc(u.nome || u.login)}</b> <span class="muted">(${esc(u.login || "")})</span></div>
            <div><span>Função:</span> <b>${esc(u.perfil || u.funcao || "Equipe")}</b></div>
          </div>
          <form id="supForm" novalidate>
            <div class="sup-err" id="supFormErr" role="alert" hidden></div>

            <div class="sup-field">
              <span class="sup-label">Tipo de chamado</span>
              <div class="sup-tipo-grid" id="supTipoGrid">
                ${tipos.map(t => {
                  const info = TIPO_DESC[t.id] || { icone: "•", desc: "" };
                  return `<button type="button" class="sup-choice ${t.id === tipoSel ? "is-on" : ""}" data-tipo="${esc(t.id)}">
                    <b>${info.icone} ${esc(t.rotulo)}</b>
                    <small>${esc(info.desc)}</small>
                  </button>`;
                }).join("")}
              </div>
            </div>

            <div class="sup-field">
              <label class="sup-label" for="supArea">Onde aconteceu / Área</label>
              <select class="sup-select" id="supArea" required>
                ${areas.map(a => `<option value="${esc(a.id)}"${a.id === areaPadrao ? " selected" : ""}>${esc(a.rotulo)}</option>`).join("")}
              </select>
              <div class="sup-hint">Se não for um módulo específico (ex.: perfil, tela inicial ou layout geral), escolha a opção correspondente acima.</div>
            </div>

            <div class="sup-field">
              <span class="sup-label">É urgente?</span>
              <div class="sup-urg-grid" id="supUrgGrid">
                <button type="button" class="sup-choice ${!urgenteSel ? "is-on" : ""}" data-urg="0">
                  <b>Normal</b>
                  <small>Posso continuar trabalhando enquanto é ajustado</small>
                </button>
                <button type="button" class="sup-choice is-urg ${urgenteSel ? "is-on" : ""}" data-urg="1">
                  <b>🚨 Sim, é urgente</b>
                  <small>Está travando meu trabalho agora</small>
                </button>
              </div>
            </div>

            <div class="sup-field">
              <label class="sup-label" for="supDesc">Explique o problema ou a sugestão</label>
              <textarea class="sup-textarea" id="supDesc" maxlength="4000" required placeholder="O que você estava fazendo, o que esperava que acontecesse e o que aconteceu (ou descreva a ideia)..."></textarea>
            </div>

            <div class="sup-field">
              <span class="sup-label">Prints (opcional, até ${maxAnexos} imagens)</span>
              <div class="sup-drop" id="supDrop" tabindex="0" role="button" aria-label="Adicionar prints">
                <b>📸 Clique para escolher, arraste aqui ou cole um print (Ctrl+V)</b>
                <span>PNG, JPG ou WebP · sem precisar de conta Google</span>
                <input type="file" id="supFileIn" accept="image/png,image/jpeg,image/webp" multiple hidden>
              </div>
              <div class="sup-thumbs" id="supThumbs"></div>
            </div>

            <div class="sup-form-foot">
              <span class="sup-hint" id="supStatusEnvio" style="margin:0"></span>
              <button type="submit" class="btn primary" id="supEnviar">Enviar chamado</button>
            </div>
          </form>
        </div>
      `;

      const errEl = container.querySelector("#supFormErr");
      const thumbsEl = container.querySelector("#supThumbs");
      const fileIn = container.querySelector("#supFileIn");
      const dropEl = container.querySelector("#supDrop");
      const statusEl = container.querySelector("#supStatusEnvio");
      const submitBtn = container.querySelector("#supEnviar");

      function showErr(msg) {
        errEl.textContent = msg || "";
        errEl.hidden = !msg;
      }

      function renderThumbs() {
        thumbsEl.innerHTML = arquivos.map((a, idx) => `
          <div class="sup-thumb">
            <img src="${esc(a.preview)}" alt="${esc(a.nome)}" data-zoom="${idx}">
            <button type="button" class="sup-thumb-rm" data-rm="${idx}" title="Remover imagem" aria-label="Remover imagem">×</button>
          </div>
        `).join("");
      }

      async function adicionarArquivos(fileList) {
        showErr("");
        for (const f of [...(fileList || [])]) {
          if (arquivos.length >= maxAnexos) {
            showErr(`Limite de ${maxAnexos} imagens por chamado atingido.`);
            break;
          }
          try {
            const item = await SUP.comprimirPrint(f);
            arquivos.push(item);
          } catch (e) {
            showErr(e.message || "Não foi possível anexar uma das imagens.");
          }
        }
        renderThumbs();
      }

      container.querySelector("#supTipoGrid").addEventListener("click", ev => {
        const b = ev.target.closest("[data-tipo]");
        if (!b) return;
        tipoSel = b.dataset.tipo;
        container.querySelectorAll("#supTipoGrid [data-tipo]").forEach(x => x.classList.toggle("is-on", x === b));
      });

      container.querySelector("#supUrgGrid").addEventListener("click", ev => {
        const b = ev.target.closest("[data-urg]");
        if (!b) return;
        urgenteSel = b.dataset.urg === "1";
        container.querySelectorAll("#supUrgGrid [data-urg]").forEach(x => x.classList.toggle("is-on", x === b));
      });

      dropEl.addEventListener("click", () => fileIn.click());
      dropEl.addEventListener("keydown", ev => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); fileIn.click(); }
      });
      fileIn.addEventListener("change", () => {
        if (fileIn.files?.length) adicionarArquivos(fileIn.files);
        fileIn.value = "";
      });
      dropEl.addEventListener("dragover", ev => { ev.preventDefault(); dropEl.classList.add("is-over"); });
      dropEl.addEventListener("dragleave", () => dropEl.classList.remove("is-over"));
      dropEl.addEventListener("drop", ev => {
        ev.preventDefault();
        dropEl.classList.remove("is-over");
        if (ev.dataTransfer?.files?.length) adicionarArquivos(ev.dataTransfer.files);
      });

      thumbsEl.addEventListener("click", ev => {
        const rm = ev.target.closest("[data-rm]");
        if (rm) {
          arquivos.splice(Number(rm.dataset.rm), 1);
          renderThumbs();
          return;
        }
        const zm = ev.target.closest("[data-zoom]");
        if (zm) {
          const item = arquivos[Number(zm.dataset.zoom)];
          if (item) SUP.abrirLightbox(item.preview);
        }
      });

      if (SUP._pasteHandler) document.removeEventListener("paste", SUP._pasteHandler);
      SUP._pasteHandler = ev => {
        if (!document.body.contains(container) || container.hidden) return;
        const items = ev.clipboardData?.items;
        if (!items) return;
        const imgs = [];
        for (const it of items) {
          if (it.kind === "file" && /^image\//i.test(it.type)) {
            const f = it.getAsFile();
            if (f) imgs.push(f);
          }
        }
        if (imgs.length) {
          ev.preventDefault();
          adicionarArquivos(imgs);
          SUP.toast(`${imgs.length} print${imgs.length > 1 ? "s colados" : " colado"}!`);
        }
      };
      document.addEventListener("paste", SUP._pasteHandler);

      container.querySelector("#supForm").addEventListener("submit", async ev => {
        ev.preventDefault();
        showErr("");
        const area = container.querySelector("#supArea").value;
        const descricao = container.querySelector("#supDesc").value.trim();
        if (descricao.length < 8) {
          showErr("Descreva o problema ou sugestão com pelo menos 8 caracteres.");
          container.querySelector("#supDesc").focus();
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Enviando…";
        statusEl.textContent = "Registrando chamado…";

        try {
          const res = await SUP.api("criar", {
            tipo: tipoSel,
            area,
            urgente: urgenteSel,
            descricao,
            origemUrl: origemUrlRaw,
            metaTecnica: metaTecnicaAtual(),
          });
          let chamado = res.chamado;
          const falhasPrint = [];
          for (let i = 0; i < arquivos.length; i++) {
            statusEl.textContent = `Enviando print ${i + 1} de ${arquivos.length}…`;
            try {
              const up = await SUP.api("anexo", {
                chamadoId: chamado.id,
                nome: arquivos[i].nome,
                base64: arquivos[i].base64,
              });
              if (up.anexo) chamado.anexos = [...(chamado.anexos || []), up.anexo];
            } catch (e) {
              falhasPrint.push(e.message || `Print ${i + 1}`);
            }
          }

          container.querySelector("#supDesc").value = "";
          arquivos = [];
          renderThumbs();
          statusEl.textContent = "";
          if (falhasPrint.length) {
            SUP.toast(`Chamado #${chamado.id} enviado, mas ${falhasPrint.length} print(s) falhou.`);
          } else {
            SUP.toast(`Chamado #${chamado.id} enviado!`);
          }
          aoCriar(chamado);
        } catch (e) {
          showErr(e.message || "Não foi possível enviar o chamado.");
          statusEl.textContent = "";
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = "Enviar chamado";
        }
      });
    }

    render();
  };
})();
