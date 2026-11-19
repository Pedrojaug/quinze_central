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
          <label>Tipo de peça<select data-x="f-midia">
            <option value="">Tudo (Online e Offline)</option>
            <option value="online">🌐 Apenas peças online</option>
            <option value="offline">📦 Apenas peças offline</option>
          </select></label>
          <label style="flex:1;min-width:210px">Cliente<select data-x="f-cli"><option value="">Todos os clientes</option></select></label>
          <label>Tipo de cliente<select data-x="f-tipo"><option value="">Todos os tipos</option></select></label>
          <label>Nível<select data-x="f-nivel"><option value="">Todos</option><option value="A">Nível A</option><option value="B">Nível B</option><option value="C">Nível C</option><option value="D">Nível D</option></select></label>
          <label>Atendimento<select data-x="f-at"><option value="">Todos</option></select></label>
          <button class="btn small" type="button" data-x="limpar-filtros" hidden>Limpar filtros</button>
        </div>
        <div data-box="aviso-filtro"></div>
      </div>
      <div class="pc-kpis" data-box="kpis"></div>
      <div data-box="meta-carteira"></div>
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
      <div class="pc-2"><div class="pc-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <div>
            <h3 style="margin:0;font-size:15px" data-box="titulo-barras-user">Produção por usuário (Online + Offline)</h3>
            <div class="pc-sub" data-box="sub-barras-user">Soma de peças Online e Offline no mesmo número de produção do período.</div>
          </div>
          <select data-x="modo-barras-user" style="padding:3px 8px;min-height:28px;font-size:12px;font-weight:600">
            <option value="producao">Total produzido (enviadas)</option>
            <option value="aprovadas">Apenas já aprovadas</option>
          </select>
        </div>
        <div data-box="barras"></div>
      </div>
        <div class="pc-card"><h3 style="margin:0 0 10px;font-size:15px">Decisões por aprovador</h3><div data-box="dec"></div></div></div>
      <div class="pc-card"><h3 style="margin:0 0 10px;font-size:15px">Envios e aprovações por usuário (Online + Offline)</h3><div data-box="env"></div></div>
      <div data-box="limpeza"></div>`;
    const box = n => el.querySelector(`[data-box="${n}"]`), qx = n => el.querySelector(`[data-x="${n}"]`);
    const sel = qx("mes");
    let dados = null;
    const preencherSelect = (s, pares) => {
      const atual = s.value;
      s.innerHTML = s.options[0].outerHTML + pares.map(([k, rot]) => `<option value="${esc(k)}">${esc(rot)}</option>`).join("");
      s.value = pares.some(([k]) => k === atual) ? atual : "";
    };
    const calcPct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
    const fmtPct = v => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%");
    function agregarFiltrados(clientesFiltrados) {
      let pecas = 0, pecasOnline = 0, pecasOffline = 0, versoes = 0;
      let aprovada = 0, aprovadasOnline = 0, aprovadasOffline = 0;
      let reprovada = 0, alteracao_solicitada = 0, v1d = 0, v1a = 0;
      let metaConteudos = 0, metaConteudosBase = 0, metaMotions = 0, clientesComMeta = 0;
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
        pecasOnline += c.pecasOnline || 0;
        pecasOffline += c.pecasOffline || 0;
        versoes += c.versoes || 0;
        aprovada += c.aprovada || 0;
        aprovadasOnline += c.aprovadasOnline || 0;
        aprovadasOffline += c.aprovadasOffline || 0;
        reprovada += c.reprovada || 0;
        alteracao_solicitada += c.alteracao_solicitada || 0;
        v1d += c.primeiraDecididas || 0;
        v1a += c.primeiraAprovadas || 0;
        const mCli = Number(c.metaConteudos) || 0;
        metaConteudos += mCli;
        metaConteudosBase += Number(c.conteudos) || 0;
        metaMotions += Number(c.motions) || 0;
        if (mCli > 0) clientesComMeta++;
        if (Array.isArray(c.horas)) {
          c.horas.forEach((qtd, h) => { horas[h].total += (qtd || 0); });
        }
        for (const u of c.enviadas || []) {
          const x = (porU[u.login] ||= {
            login: u.login, nome: u.nome,
            pecas: 0, pecasOnline: 0, pecasOffline: 0,
            versoes: 0,
            aprovadas: 0, aprovadasOnline: 0, aprovadasOffline: 0,
          });
          x.pecas += u.pecas || 0;
          x.pecasOnline += u.pecasOnline || 0;
          x.pecasOffline += u.pecasOffline || 0;
          x.versoes += u.versoes || 0;
          x.aprovadas += u.aprovadas || 0;
          x.aprovadasOnline += u.aprovadasOnline || 0;
          x.aprovadasOffline += u.aprovadasOffline || 0;
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
          pecas, pecasOnline, pecasOffline, versoes,
          aprovada, aprovadasOnline, aprovadasOffline,
          reprovada, alteracao_solicitada,
          metaConteudos, metaConteudosBase, metaMotions, clientesComMeta,
          pctCarteira: calcPct(pecas, metaConteudos),
          pctCarteiraAprovada: calcPct(aprovada, metaConteudos),
          primeiraDecididas: v1d, primeiraAprovadas: v1a,
          taxaPrimeira: v1d ? Math.round(v1a / v1d * 1000) / 10 : null,
        },
        enviadas: Object.values(porU).sort((a, b) => b.pecas - a.pecas || (b.aprovadas || 0) - (a.aprovadas || 0) || b.versoes - a.versoes),
        decisoes: Object.values(porC).sort((a, b) => b.total - a.total),
        horas,
      };
    }
    function renderDash() {
      if (!dados) return;
      const fCli = qx("f-cli").value, fTipo = qx("f-tipo").value, fNivel = qx("f-nivel").value, fAt = qx("f-at").value;
      const fMidia = qx("f-midia")?.value || "";
      const mostrarZerados = qx("mostrar-zerados").checked;
      const temFiltro = !!(fCli || fTipo || fNivel || fAt || fMidia);
      qx("limpar-filtros").hidden = !temFiltro;

      const ehModoOffline = fMidia === "offline";
      if (ehModoOffline) el.classList.add("modo-offline");
      else el.classList.remove("modo-offline");

      const todosClientes = dados.clientes || [];
      const clientesFiltrados = todosClientes.filter(c =>
        (!fCli || c.id === fCli) &&
        (!fTipo || c.tipo === fTipo) &&
        (!fNivel || c.nivel === fNivel) &&
        (!fAt || c.atendimento === fAt)
      );

      if (temFiltro) {
        const partes = [];
        if (fMidia) partes.push(fMidia === "offline" ? "Canal: 📦 Peças Offline" : "Canal: 🌐 Peças Online");
        if (fCli) { const cl = todosClientes.find(x => x.id === fCli); partes.push(`Cliente: ${cl ? cl.nome : fCli}`); }
        if (fTipo) partes.push(`Tipo: ${fTipo}`);
        if (fNivel) partes.push(`Nível ${fNivel}`);
        if (fAt) partes.push(`Atendimento: ${fAt}`);
        const estiloAviso = ehModoOffline
          ? "background:#F3E8FF;color:#6B21A8;border:1px solid rgba(107,33,168,0.25)"
          : "background:var(--blue-soft);color:var(--blue-dk);border:1px solid rgba(6,96,255,0.18)";
        box("aviso-filtro").innerHTML = `<div style="margin-top:10px;padding:7px 11px;border-radius:8px;font-size:12.5px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;${estiloAviso}">
          <span><b>Filtro ativo:</b> ${esc(partes.join(" · "))} (${clientesFiltrados.length} cliente${clientesFiltrados.length === 1 ? "" : "s"})</span>
          <button class="btn small" type="button" data-x="limpar-filtros">Limpar filtros</button>
        </div>`;
      } else {
        box("aviso-filtro").innerHTML = "";
      }

      const escopo = temFiltro ? agregarFiltrados(clientesFiltrados) : { totais: dados.totais, enviadas: dados.enviadas, decisoes: dados.decisoes, horas: dados.horas };
      const t = escopo.totais;
      const metaTotal = t.metaConteudos || 0;
      const pctProd = t.pctCarteira != null ? t.pctCarteira : calcPct(t.pecas || 0, metaTotal);
      const pctAprov = t.pctCarteiraAprovada != null ? t.pctCarteiraAprovada : calcPct(t.aprovada || 0, metaTotal);
      const clientesComEnvio = clientesFiltrados.filter(c => c.pecas > 0 || c.versoes > 0);
      const pctProdTxt = metaTotal > 0 ? `${fmtPct(pctProd)} de ${metaTotal} na carteira` : "";
      const detPecasTotal = [
        (!fMidia && ((t.pecasOnline || 0) > 0 || (t.pecasOffline || 0) > 0))
          ? `🌐 ${t.pecasOnline || 0} online + 📦 ${t.pecasOffline || 0} offline · ${clientesComEnvio.length} cliente${clientesComEnvio.length === 1 ? "" : "s"}`
          : `${clientesComEnvio.length} cliente${clientesComEnvio.length === 1 ? "" : "s"} com envios`,
        pctProdTxt,
      ].filter(Boolean).join(" · ");
      const pctAprovTxt = metaTotal > 0 ? `${fmtPct(pctAprov)} de ${metaTotal} na carteira` : "";
      const detAprovTotal = [
        (!fMidia && ((t.aprovadasOnline || 0) > 0 || (t.aprovadasOffline || 0) > 0))
          ? `🌐 ${t.aprovadasOnline || 0} online + 📦 ${t.aprovadasOffline || 0} offline`
          : "",
        pctAprovTxt,
      ].filter(Boolean).join(" · ") || undefined;
      box("kpis").innerHTML = [
        [t.pecas, "Total produzido (On + Off)", detPecasTotal],
        [t.versoes, "Versões enviadas"],
        [t.aprovada, "Aprovadas", detAprovTotal],
        [t.alteracao_solicitada, "Alteração solicitada"],
        [t.reprovada, "Reprovadas"],
        [t.taxaPrimeira == null ? "—" : t.taxaPrimeira.toLocaleString("pt-BR") + "%", "Aprovação na 1ª versão", t.primeiraDecididas ? `${t.primeiraAprovadas} de ${t.primeiraDecididas} peças decididas na 1ª versão` : "nenhuma decisão na 1ª versão"],
      ].map(([v, r, e]) => `<div class="pc-kpi"><b>${v}</b><span>${r}</span>${e ? `<em>${e}</em>` : ""}</div>`).join("");

      // Card de Progresso em relação à Carteira
      const metaBox = box("meta-carteira");
      if (metaBox) {
        const carteiraLabel = dados.carteiraMes ? `Carteira de ${mesBr(dados.carteiraMes)}` : "Carteira atual";
        const temFiltroEscopo = !!(fCli || fTipo || fNivel || fAt);
        const recorteLabel = temFiltroEscopo ? " (recorte filtrado)" : "";
        const periodoCurto = !!(dados.de || dados.ate);
        if (metaTotal > 0) {
          const pecasTot = t.pecas || 0, pecasOn = t.pecasOnline || 0, pecasOff = t.pecasOffline || 0;
          const aprovTot = t.aprovada || 0, aprovOn = t.aprovadasOnline || 0, aprovOff = t.aprovadasOffline || 0;
          const pctOnline = calcPct(pecasOn, metaTotal);
          const pctOffline = calcPct(pecasOff, metaTotal);
          const pctShareOn = calcPct(pecasOn, pecasTot);
          const pctShareOff = calcPct(pecasOff, pecasTot);
          const pctAprovSobreProd = calcPct(aprovTot, pecasTot);
          const diffProd = metaTotal - pecasTot;
          const pctRestante = diffProd > 0 ? calcPct(diffProd, metaTotal) : 0;
          const baseDet = (t.metaConteudosBase || t.metaMotions) ? ` (${t.metaConteudosBase || 0} conteúdos + ${t.metaMotions || 0} motions)` : "";
          const avisosExtras = [];
          if (periodoCurto) avisosExtras.push("Comparado com a meta mensal da carteira");
          if (fMidia === "offline") avisosExtras.push("Filtro Offline ativo (a meta da carteira soma conteúdos + motions)");
          else if (fMidia === "online") avisosExtras.push("Filtro Online ativo");
          const qtdCliMeta = t.clientesComMeta || 0;

          const badgeStatus = pecasTot === 0
            ? `<span class="pc-meta-status" style="background:#F1F5F9;color:var(--ink2)">Nenhum envio no período</span>`
            : aprovTot === pecasTot
              ? `<span class="pc-meta-status ok">✓ 100% do produzido aprovado</span>`
              : aprovTot < pecasTot
                ? `<span class="pc-meta-status pend">${aprovTot} aprovadas (${fmtPct(pctAprov)} da carteira) · ${pecasTot - aprovTot} em fluxo</span>`
                : `<span class="pc-meta-status ok">✓ ${aprovTot} aprovadas no período (${fmtPct(pctAprov)} da carteira)</span>`;

          const wTotal = Math.min(100, Math.max(0, (pecasTot / metaTotal) * 100));
          let segsHtml = "";
          if (!fMidia) {
            const wOn = pecasTot > 0 ? +(wTotal * (pecasOn / pecasTot)).toFixed(2) : 0;
            const wOff = pecasTot > 0 ? Math.max(0, +(wTotal - wOn).toFixed(2)) : 0;
            if (wOn > 0) segsHtml += `<div class="pc-meta-seg online" style="width:${wOn}%" title="🌐 Online: ${pecasOn} peça${pecasOn === 1 ? "" : "s"} (${fmtPct(pctOnline)} da carteira)"></div>`;
            if (wOff > 0) segsHtml += `<div class="pc-meta-seg offline" style="width:${wOff}%" title="📦 Offline: ${pecasOff} peça${pecasOff === 1 ? "" : "s"} (${fmtPct(pctOffline)} da carteira)"></div>`;
          } else if (fMidia === "online") {
            if (wTotal > 0) segsHtml = `<div class="pc-meta-seg online" style="width:${wTotal.toFixed(2)}%" title="🌐 Online: ${pecasTot} peça${pecasTot === 1 ? "" : "s"} (${fmtPct(pctProd)} da carteira)"></div>`;
          } else if (wTotal > 0) {
            segsHtml = `<div class="pc-meta-seg offline" style="width:${wTotal.toFixed(2)}%" title="📦 Offline: ${pecasTot} peça${pecasTot === 1 ? "" : "s"} (${fmtPct(pctProd)} da carteira)"></div>`;
          }

          const blocoRestante = diffProd > 0
            ? `<div class="pc-meta-item rest">
                <div class="pc-meta-item-lbl">⏳ Restante da meta</div>
                <div class="pc-meta-item-val"><strong>${fmtPct(pctRestante)}</strong><small>para 100%</small></div>
                <div class="pc-meta-item-sub">Faltam <b>${diffProd}</b> peça${diffProd === 1 ? "" : "s"} para ${metaTotal}</div>
              </div>`
            : diffProd === 0
              ? `<div class="pc-meta-item rest ok">
                  <div class="pc-meta-item-lbl">🎉 Meta atingida</div>
                  <div class="pc-meta-item-val"><strong>100%</strong><small>concluído</small></div>
                  <div class="pc-meta-item-sub">Todas as <b>${metaTotal}</b> peças da carteira produzidas</div>
                </div>`
              : `<div class="pc-meta-item rest ok">
                  <div class="pc-meta-item-lbl">🎉 Meta superada</div>
                  <div class="pc-meta-item-val"><strong>+${Math.abs(diffProd)}</strong><small>peça${Math.abs(diffProd) === 1 ? "" : "s"} extra${Math.abs(diffProd) === 1 ? "" : "s"}</small></div>
                  <div class="pc-meta-item-sub">Meta de ${metaTotal} superada (${fmtPct(pctProd)})</div>
                </div>`;

          const blocosHtml = !fMidia
            ? `<div class="pc-meta-item online">
                <div class="pc-meta-item-lbl">🌐 Peças Online</div>
                <div class="pc-meta-item-val"><strong>${fmtPct(pctOnline)}</strong><small>da carteira</small></div>
                <div class="pc-meta-item-sub"><b>${pecasOn}</b> peça${pecasOn === 1 ? "" : "s"}${pecasTot > 0 ? ` (${fmtPct(pctShareOn)} do produzido)` : ""} · ${aprovOn} aprov.</div>
              </div>
              <div class="pc-meta-item offline">
                <div class="pc-meta-item-lbl">📦 Peças Offline</div>
                <div class="pc-meta-item-val"><strong>${fmtPct(pctOffline)}</strong><small>da carteira</small></div>
                <div class="pc-meta-item-sub"><b>${pecasOff}</b> peça${pecasOff === 1 ? "" : "s"}${pecasTot > 0 ? ` (${fmtPct(pctShareOff)} do produzido)` : ""} · ${aprovOff} aprov.</div>
              </div>
              <div class="pc-meta-item aprov">
                <div class="pc-meta-item-lbl">✅ Aprovadas</div>
                <div class="pc-meta-item-val"><strong>${aprovTot}</strong><small>${pecasTot > 0 ? `de ${pecasTot} (${fmtPct(pctAprovSobreProd)})` : "no período"}</small></div>
                <div class="pc-meta-item-sub">${aprovOn} online · ${aprovOff} offline${aprovTot !== pecasTot ? ` · ${fmtPct(pctAprov)} da carteira` : ""}</div>
              </div>
              ${blocoRestante}`
            : `<div class="pc-meta-item ${fMidia === "offline" ? "offline" : "online"}">
                <div class="pc-meta-item-lbl">${fMidia === "offline" ? "📦 Peças Offline" : "🌐 Peças Online"}</div>
                <div class="pc-meta-item-val"><strong>${fmtPct(pctProd)}</strong><small>da carteira</small></div>
                <div class="pc-meta-item-sub"><b>${pecasTot}</b> de ${metaTotal} peças contratadas</div>
              </div>
              <div class="pc-meta-item aprov">
                <div class="pc-meta-item-lbl">✅ Aprovadas</div>
                <div class="pc-meta-item-val"><strong>${aprovTot}</strong><small>${pecasTot > 0 ? `de ${pecasTot} (${fmtPct(pctAprovSobreProd)})` : "no período"}</small></div>
                <div class="pc-meta-item-sub">${fmtPct(pctAprov)} da carteira</div>
              </div>
              ${blocoRestante}`;

          metaBox.innerHTML = `<div class="pc-meta-card">
            <div class="pc-meta-head">
              <div>
                <h3 style="margin:0;font-size:15px">🎯 Progresso em relação à carteira${recorteLabel}</h3>
                <div class="pc-sub" style="margin-top:3px">${esc(carteiraLabel)} · Meta total: <b>${metaTotal}</b> peça${metaTotal === 1 ? "" : "s"}${esc(baseDet)} em ${qtdCliMeta} cliente${qtdCliMeta === 1 ? "" : "s"}${avisosExtras.length ? ` · <i>${esc(avisosExtras.join(" · "))}</i>` : ""}</div>
              </div>
              <div class="pc-meta-hero${(pctProd || 0) >= 100 ? " ok" : ""}">
                <div class="pc-meta-hero-row"><b>${fmtPct(pctProd)}</b><span class="pc-meta-hero-frac">${pecasTot} de ${metaTotal} peças</span></div>
                ${badgeStatus}
              </div>
            </div>
            <div class="pc-meta-track" title="Total produzido: ${fmtPct(pctProd)} (${pecasTot}/${metaTotal})">${segsHtml}</div>
            <div class="pc-meta-grid">${blocosHtml}</div>
          </div>`;
        } else {
          metaBox.innerHTML = `<div class="pc-meta-card" style="padding:11px 16px">
            <div class="pc-sub">🎯 <b>Progresso em relação à carteira:</b> Nenhuma meta de conteúdos definida na ${esc(carteiraLabel.toLowerCase())} para o recorte selecionado.</div>
          </div>`;
        }
      }

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
        ? `<div class="pc-barras">${clientesComEnvio.slice(0, 15).map(c => {
            const pctCli = c.pctCarteira != null ? c.pctCarteira : calcPct(c.pecas || 0, c.metaConteudos || 0);
            const numTxt = c.metaConteudos ? `${c.pecas} / ${c.metaConteudos} (${fmtPct(pctCli)})` : `${c.pecas}`;
            const midiaBarraTxt = (!fMidia && ((c.pecasOnline || 0) > 0 || (c.pecasOffline || 0) > 0))
              ? ` · 🌐 ${c.pecasOnline || 0} on + 📦 ${c.pecasOffline || 0} off`
              : "";
            return `<div class="l" style="grid-template-columns:160px minmax(0,1fr) auto">
            <span class="nm" title="${esc(c.nome)}${c.tipo ? " · " + esc(c.tipo) : ""}${c.metaConteudos ? ` · ${c.pecas} de ${c.metaConteudos} (${fmtPct(pctCli)})` : ""}${midiaBarraTxt}"><a href="#" data-x="filtrar-cli" data-cid="${esc(c.id)}" style="color:inherit;text-decoration:none;font-weight:500">${esc(c.nome)}</a></span>
            <span class="b"><i style="width:${c.pecas / maxCli * 100}%"></i></span>
            <b class="num" style="white-space:nowrap">${numTxt}</b>
          </div>`;
          }).join("")}</div>`
        : "";

      const clsPct = v => v == null ? "zero" : v >= 100 ? "ok" : v >= 50 ? "mid" : v > 0 ? "low" : "zero";
      const linhaTotalTabela = (rotulo, arr) => {
        let sPecas = 0, sOn = 0, sOff = 0, sMeta = 0, sVer = 0, sApr = 0, sAlt = 0, sRep = 0, sPend = 0, sV1d = 0, sV1a = 0;
        for (const c of arr) {
          sPecas += c.pecas || 0;
          sOn += c.pecasOnline || 0;
          sOff += c.pecasOffline || 0;
          sMeta += c.metaConteudos || 0;
          sVer += c.versoes || 0;
          sApr += c.aprovada || 0;
          sAlt += c.alteracao_solicitada || 0;
          sRep += c.reprovada || 0;
          sPend += c.pendente || 0;
          sV1d += c.primeiraDecididas || 0;
          sV1a += c.primeiraAprovadas || 0;
        }
        const pctArr = calcPct(sPecas, sMeta);
        const pctArrApr = calcPct(sApr, sMeta);
        const taxaArr = sV1d ? Math.round(sV1a / sV1d * 1000) / 10 : null;
        const midiaTotTxt = (!fMidia && (sOn > 0 || sOff > 0)) ? ` · 🌐 ${sOn} on + 📦 ${sOff} off` : "";
        return `<tr>
          <td colspan="3">${esc(rotulo)}</td>
          <td class="num">${sPecas}${sMeta ? `<span class="pc-sub"> / ${sMeta}</span>` : ""}</td>
          <td class="num">${sMeta ? `<span class="pc-pct-pill ${clsPct(pctArr)}" title="Produzidas: ${sPecas}/${sMeta} (${fmtPct(pctArr)})${midiaTotTxt} · Aprovadas: ${sApr}/${sMeta} (${fmtPct(pctArrApr)})">${fmtPct(pctArr)}</span>` : `<span class="pc-sub">—</span>`}</td>
          <td class="num">${sVer}</td>
          <td class="num">${sApr}</td>
          <td class="num">${sAlt}</td>
          <td class="num">${sRep}</td>
          <td class="num">${sPend}</td>
          <td class="num">${taxaArr == null ? "—" : taxaArr.toLocaleString("pt-BR") + "%"}</td>
          <td></td>
        </tr>`;
      };

      box("cli-tabela").innerHTML = listaCliVisivel.length
        ? `<table class="pc-tbl"><thead><tr>
            <th>Cliente</th><th>Tipo / Nível</th><th>Atendimento</th>
            <th class="num">Peças</th><th class="num">% Carteira</th><th class="num">Versões</th><th class="num">Aprovadas</th><th class="num">Alteração</th><th class="num">Reprovadas</th><th class="num">Pendentes</th><th class="num">1ª versão</th><th style="text-align:right">Filtro</th>
          </tr></thead><tbody>
          ${listaCliVisivel.map(c => {
            const ativo = fCli === c.id;
            const pctCli = c.pctCarteira != null ? c.pctCarteira : calcPct(c.pecas || 0, c.metaConteudos || 0);
            const pctCliApr = c.pctCarteiraAprovada != null ? c.pctCarteiraAprovada : calcPct(c.aprovada || 0, c.metaConteudos || 0);
            const midiaCliTxt = (!fMidia && ((c.pecasOnline || 0) > 0 || (c.pecasOffline || 0) > 0))
              ? ` · 🌐 ${c.pecasOnline || 0} on + 📦 ${c.pecasOffline || 0} off`
              : "";
            const pctCell = c.metaConteudos > 0
              ? `<span class="pc-pct-pill ${clsPct(pctCli)}" title="Produzidas: ${c.pecas}/${c.metaConteudos} (${fmtPct(pctCli)})${midiaCliTxt} · Aprovadas: ${c.aprovada}/${c.metaConteudos} (${fmtPct(pctCliApr)})">${fmtPct(pctCli)}</span>`
              : `<span class="pc-sub">—</span>`;
            return `<tr style="${ativo ? "background:var(--blue-soft)" : ""}">
              <td><b>${esc(c.nome)}</b></td>
              <td>${c.tipo ? `<span class="pc-cli" style="margin-right:4px">${esc(c.tipo)}</span>` : ""}${c.nivel ? `<span class="pc-badge-opc">Nível ${esc(c.nivel)}</span>` : (!c.tipo ? `<span class="pc-sub">—</span>` : "")}</td>
              <td>${esc(c.atendimento || "—")}</td>
              <td class="num"><b>${c.pecas}</b>${c.metaConteudos ? `<span class="pc-sub" title="Meta contratada na Carteira"> / ${c.metaConteudos}</span>` : ""}</td>
              <td class="num">${pctCell}</td>
              <td class="num">${c.versoes}</td>
              <td class="num">${c.aprovada}</td>
              <td class="num">${c.alteracao_solicitada}</td>
              <td class="num">${c.reprovada}</td>
              <td class="num">${c.pendente || 0}</td>
              <td class="num">${c.taxaPrimeira == null ? "—" : c.taxaPrimeira.toLocaleString("pt-BR") + "%"}</td>
              <td style="text-align:right;white-space:nowrap"><button class="btn small${ativo ? " primary" : ""}" type="button" data-x="filtrar-cli" data-cid="${esc(c.id)}">${ativo ? "Limpar" : "Filtrar"}</button></td>
            </tr>`;
          }).join("")}
          </tbody><tfoot>${
            listaCliVisivel.length === clientesFiltrados.length
              ? linhaTotalTabela(`Total (${listaCliVisivel.length} cliente${listaCliVisivel.length === 1 ? "" : "s"})`, listaCliVisivel)
              : linhaTotalTabela(`Subtotal exibido (${listaCliVisivel.length} com envio)`, listaCliVisivel) +
                linhaTotalTabela(`Total da carteira (${clientesFiltrados.length} cliente${clientesFiltrados.length === 1 ? "" : "s"})`, clientesFiltrados)
          }</tfoot></table>`
        : `<div class="pc-vazio">${temFiltro ? "Nenhum cliente encontrado com esses filtros." : "Nenhum cliente teve peças enviadas neste mês ainda (marque a opção acima para ver todos os clientes da carteira)."}</div>`;

      // Seções de Usuários e Aprovadores (mantidas e sensíveis ao filtro)
      // Contabiliza peças Online + Offline no mesmo número de produção do período (com detalhamento Online vs Offline)
      const modoBarras = qx("modo-barras-user")?.value || "producao";
      const ehModoAprov = modoBarras === "aprovadas";
      const titBarras = box("titulo-barras-user"), subBarras = box("sub-barras-user");
      if (titBarras) titBarras.textContent = ehModoAprov ? "Peças aprovadas por usuário (Online + Offline)" : "Produção por usuário (Online + Offline)";
      if (subBarras) subBarras.textContent = ehModoAprov
        ? "Total de materiais aprovados no período, somando peças Online e Offline."
        : "Total de peças produzidas (Online + Offline) no mesmo número de produção do período.";

      const valorBarraUser = u => ehModoAprov ? (u.aprovadas || 0) : (u.pecas || 0);
      const valOnUser = u => ehModoAprov ? (u.aprovadasOnline || 0) : (u.pecasOnline || 0);
      const valOffUser = u => ehModoAprov ? (u.aprovadasOffline || 0) : (u.pecasOffline || 0);

      const listaUsersOrdenada = [...(escopo.enviadas || [])]
        .filter(u => valorBarraUser(u) > 0 || (u.pecas || 0) > 0 || (u.aprovadas || 0) > 0)
        .sort((a, b) => valorBarraUser(b) - valorBarraUser(a) || (b.pecas || 0) - (a.pecas || 0));

      const maxBarra = Math.max(1, ...listaUsersOrdenada.map(valorBarraUser));
      const corBarra = ehModoOffline ? "#7E22CE" : (fMidia === "online" ? "var(--blue)" : "linear-gradient(90deg, var(--blue) 0%, #7E22CE 100%)");
      box("barras").innerHTML = listaUsersOrdenada.length ? `<div class="pc-barras">${listaUsersOrdenada.map(u => {
        const qtd = valorBarraUser(u);
        const on = valOnUser(u), off = valOffUser(u);
        const detTags = (!fMidia && (on > 0 || off > 0))
          ? `<span style="display:inline-flex;gap:4px;margin-left:6px;font-size:11px;font-weight:600;vertical-align:middle">${on > 0 ? `<span style="background:#EAF2FF;color:#0B57D0;padding:1px 6px;border-radius:4px" title="${on} Online">🌐 ${on}</span>` : ""}${off > 0 ? `<span style="background:#F3E8FF;color:#6B21A8;padding:1px 6px;border-radius:4px" title="${off} Offline">📦 ${off}</span>` : ""}</span>`
          : "";
        return `<div class="l" style="grid-template-columns:minmax(150px,auto) minmax(0,1fr) auto"><span class="nm" title="${esc(u.nome)}: ${qtd} total (${on} Online + ${off} Offline)">${esc(u.nome)}${detTags}</span><span class="b"><i style="width:${maxBarra > 0 ? (qtd / maxBarra * 100) : 0}%;background:${corBarra}"></i></span><b class="num" style="min-width:28px;${ehModoOffline ? "color:#6B21A8" : ""}">${qtd}</b></div>`;
      }).join("")}</div>` : `<div class="pc-vazio">Nenhuma peça registrada no período/filtro selecionado.</div>`;
      box("dec").innerHTML = escopo.decisoes.length ? `<table class="pc-tbl"><thead><tr><th>Quem decidiu</th><th class="num">Aprovadas</th><th class="num">Alteração</th><th class="num">Reprovadas</th><th class="num">Total</th></tr></thead><tbody>
        ${escopo.decisoes.map(c => `<tr><td>${esc(c.nome)}</td><td class="num">${c.aprovada}</td><td class="num">${c.alteracao_solicitada}</td><td class="num">${c.reprovada}</td><td class="num"><b>${c.total}</b></td></tr>`).join("")}</tbody></table>` : `<div class="pc-vazio">Sem decisões no período/filtro selecionado.</div>`;
      box("env").innerHTML = escopo.enviadas.length ? `<table class="pc-tbl"><thead><tr><th>Usuário</th><th class="num">Total produzido (On + Off)</th><th class="num">🌐 Online</th><th class="num">📦 Offline</th><th class="num">Peças aprovadas</th><th class="num">Versões enviadas</th></tr></thead><tbody>
        ${escopo.enviadas.map(u => `<tr><td><b>${esc(u.nome)}</b></td><td class="num"><b>${u.pecas || 0}</b></td><td class="num" style="color:#0B57D0">${u.pecasOnline || 0}</td><td class="num" style="color:#6B21A8">${u.pecasOffline || 0}</td><td class="num"><b>${u.aprovadas || 0}</b>${(u.aprovadasOnline || u.aprovadasOffline) ? ` <span class="pc-sub" style="font-size:11px">(${u.aprovadasOnline || 0} on · ${u.aprovadasOffline || 0} off)</span>` : ""}</td><td class="num">${u.versoes || 0}</td></tr>`).join("")}
        <tr><td><b>Total</b></td><td class="num"><b>${t.pecas || 0}</b></td><td class="num" style="color:#0B57D0"><b>${t.pecasOnline || 0}</b></td><td class="num" style="color:#6B21A8"><b>${t.pecasOffline || 0}</b></td><td class="num"><b>${t.aprovada || 0}</b></td><td class="num"><b>${t.versoes || 0}</b></td></tr></tbody></table>` : `<div class="pc-vazio">Sem envios no período/filtro selecionado.</div>`;
    }
    const obterParamsPeriodoDash = () => {
      const per = qx("f-per")?.value || "mes";
      const midia = qx("f-midia")?.value || "";
      let p = {};
      if (per === "mes") {
        p = sel.value ? { mes: sel.value } : {};
      } else if (per === "custom") {
        const de = qx("d-ini")?.value || "";
        const ate = qx("d-fim")?.value || "";
        if (de) p.de = de;
        if (ate) p.ate = ate;
      } else {
        const interv = intervaloPeriodo(per);
        if (interv.de) p.de = interv.de;
        if (interv.ate) p.ate = interv.ate;
      }
      if (midia) p.tipoMidia = midia;
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
      box("limpeza").innerHTML = (base && (base.ehGestao || base.funcao === "mestre")) ? `<p class="pc-sub">Arquivos com mais de ${base.retencaoDias} dias são apagados automaticamente todo dia. <button class="btn" type="button" data-x="limpar" style="padding:2px 10px;min-height:0">Rodar a limpeza agora</button> <span data-box="lmsg"></span></p>` : "";
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
      } else if (x === "mes" || x === "f-midia") {
        carregar();
      } else if (["f-cli", "f-tipo", "f-nivel", "f-at", "mostrar-zerados", "modo-barras-user"].includes(x)) {
        renderDash();
      }
    });
    el.addEventListener("click", async ev => {
      const btn = ev.target.closest("[data-x]"); if (!btn) return;
      const x = btn.dataset.x;
      if (x === "limpar-filtros") {
        qx("f-cli").value = ""; qx("f-tipo").value = ""; qx("f-nivel").value = ""; qx("f-at").value = "";
        const mEl = qx("f-midia");
        if (mEl && mEl.value) {
          mEl.value = "";
          carregar();
          return;
        }
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
      if (x !== "limpar") return;
      btn.disabled = true;
      try { const r = await api("limpeza.executar", {}); box("lmsg").textContent = `${r.arquivosApagados + r.orfaosApagados} arquivo(s) apagado(s), ${r.pecasArquivadas ?? r.pecasRemovidas} peça(s) arquivada(s) da fila (histórico do dashboard preservado).`; }
      catch (e) { box("lmsg").textContent = e.message; }
      btn.disabled = false;
    });
    return carregar;
  }
