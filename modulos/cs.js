// 04 CS / Sucesso do Cliente: NPS Média e Reclamações (todos os perfis).
// Tudo pela rota /api/m?r=cs/... (a IA roda no servidor; a chave nunca chega aqui).
(function () {
  if (window.__qzCs) return; window.__qzCs = true;

  const { esc, br, brHora, mesBr } = QZ.fmt;
  const num1 = v => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
  const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const api = QZ.criarApi("cs");

  if (!document.getElementById("qzCsCss")) {
    const st = document.createElement("style"); st.id = "qzCsCss";
    st.textContent = `
      .cs-h{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px}.cs-h h2{margin:0}.cs-h .sp{flex:1}
      .cs-sub{font-size:12.5px;color:var(--ink2)}
      .cs-card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin-bottom:14px}
      .cs-card h3{margin:0 0 10px;font-size:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .cs-card.lock{opacity:.55}.cs-card.lock *{pointer-events:none}
      .cs-card.ok .cs-n{background:var(--green)}
      .cs-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
      .cs-grid label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--ink2)}.cs-grid .full{grid-column:1/-1}
      .cs-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
      .st{font-size:12px;padding:2px 8px;border-radius:20px;white-space:nowrap;font-weight:600;background:var(--line2);display:inline-block}
      .st.em_andamento,.st.media,.st.neutro{background:var(--amber-soft);color:var(--amber)}
      .st.resolvida,.st.baixa,.st.promotor{background:var(--green-soft);color:var(--green)}
      .st.aberta,.st.alta,.st.detrator{background:var(--danger-soft);color:var(--danger)}
      .cs-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:10px;margin-bottom:14px}
      .cs-kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
      .cs-kpi b{display:block;font:700 26px/1 var(--display);font-variant-numeric:tabular-nums}.cs-kpi span{font-size:13px;color:var(--ink2)}
      .cs-tbl{width:100%;border-collapse:collapse;font-size:14px}
      .cs-tbl th{font-size:12.5px;color:var(--ink2);font-weight:600;text-align:left;padding:8px;border-bottom:1px solid var(--line)}
      .cs-tbl td{padding:8px;border-bottom:1px solid var(--line2);vertical-align:top}.cs-tbl .num{text-align:right;font-variant-numeric:tabular-nums}
      .cs-tbl .acts{text-align:right;white-space:nowrap}.cs-tbl .acts .btn{padding:4px 9px;font-size:13px;min-height:0;margin-left:4px}
      .cs-wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}
      .cs-pontos{margin:0;padding-left:20px}.cs-pontos li{margin-bottom:8px}
      .cs-chart svg{width:100%;height:220px;display:block}
      .cs-fbar{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:12px;align-items:end}
      .cs-fbar label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--ink2);font-weight:600}
      .cs-pgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
      .cs-pbox{border:1px solid var(--line2);border-radius:8px;padding:12px;background:var(--surface)}
      .cs-pbox h4{margin:0 0 8px;font-size:13.5px;line-height:1.35;color:var(--ink)}
      .cs-bar-bg{height:8px;background:var(--line2);border-radius:99px;overflow:hidden;margin:6px 0}
      .cs-bar-fg{height:100%;background:var(--blue);border-radius:99px}
      .cs-opt-row{display:flex;align-items:center;gap:8px;font-size:12.5px;margin-top:5px}
      .cs-opt-row .lbl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cs-opt-row .track{width:90px;height:6px;background:var(--line2);border-radius:99px;overflow:hidden}
      .cs-opt-row .fill{height:100%;background:var(--blue);border-radius:99px}
      .cs-resp-item{border:1px solid var(--line2);border-radius:8px;padding:12px 14px;margin-bottom:10px;background:var(--card)}
      .cs-resp-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between}
      .cs-resp-qa{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;margin-top:10px;padding-top:10px;border-top:1px dashed var(--line2);font-size:13px}
      .cs-resp-qa div{background:var(--surface-2);padding:6px 8px;border-radius:6px;border:1px solid var(--line2)}
      .cs-resp-qa small{display:block;color:var(--ink2);font-size:11.5px;margin-bottom:2px}`;
    document.head.appendChild(st);
  }

  // ======================================================================
  // NPS MÉDIA E RESULTADOS DAS PESQUISAS
  // ======================================================================
  const PERFIL_LBL = { promotor: "Promotor (9–10)", neutro: "Neutro (7–8)", detrator: "Detrator (0–6)" };
  const perfilNota = n => (n >= 9 ? "promotor" : n >= 7 ? "neutro" : "detrator");

  function npsMedia(ctx) {
    const el = ctx.el; let dados = null, painelAberto = null; // 'importar' | 'manual' | null
    const ano = new Date().getFullYear();
    el.innerHTML = `<div class="cs-h"><div><h2>NPS Média e Resultados</h2><div class="cs-sub">Consolidação das respostas do Google Forms e pesquisas futuras · NPS = % promotores (9–10) − % detratores (0–6).</div></div><span class="sp"></span>
      <button class="btn primary" type="button" id="mBtnImp">📥 Importar CSV / Planilha do Forms</button>
      <button class="btn" type="button" id="mSync">🔄 Sincronizar Planilhas</button>
      <button class="btn" type="button" id="mBtnMan">➕ Registrar resposta</button></div>
      <div id="mSyncMsg" class="cs-sub" style="margin:-6px 0 10px"></div>
      <div id="mPainel"></div>
      <div class="cs-fbar">
        <label>Pesquisa / Formulário<select id="mPesq"><option value="">Todas as pesquisas</option></select></label>
        <label>Cliente<select id="mCli"><option value="">Todos os clientes</option></select></label>
        <label>Atendimento<select id="mAtend"><option value="">Todo o time</option></select></label>
        <label>Classificação NPS<select id="mPerf"><option value="">Todas (Promotores, Neutros e Detratores)</option><option value="promotor">Promotores (9 a 10)</option><option value="neutro">Neutros (7 a 8)</option><option value="detrator">Detratores (0 a 6)</option></select></label>
        <label>De<input type="month" id="mDe" value="${ano}-01"></label>
        <label>Até<input type="month" id="mAte" value="${mesAtual()}"></label>
        <div><button class="btn" type="button" id="mLimpar" style="width:100%">Limpar filtros</button></div>
      </div>
      <div id="mAviso"></div>
      <div class="cs-kpis" id="mKpis"></div>
      <div class="cs-card" id="mCardPerg"><h3>📊 Resultados por pergunta do formulário <span class="cs-sub" id="mPergSub" style="font-weight:400"></span></h3><div id="mPergBox"></div></div>
      <div class="cs-card"><h3>🏢 Desempenho por cliente <span class="cs-sub" style="font-weight:400">(clique em “Filtrar” para isolar um cliente)</span></h3>
        <div class="cs-wrap" style="border:0"><table class="cs-tbl"><thead><tr><th>Cliente</th><th>Atendimento</th><th class="num">Respostas</th><th class="num">Nota Serviços</th><th class="num">Média NPS</th><th class="num">Score NPS</th><th class="num">Prom.</th><th class="num">Neut.</th><th class="num">Detr.</th><th>Última resp.</th><th></th></tr></thead><tbody id="mCliRows"></tbody></table></div></div>
      <div class="cs-card cs-chart"><h3>📈 Evolução mensal</h3><div id="mChart"></div></div>
      <div class="cs-card"><h3>💡 Pontos de melhoria e síntese <span class="sp" style="flex:1"></span><button class="btn" type="button" id="mRel">Gerar relatório com IA</button></h3><div id="mRelBox"></div></div>
      <div class="cs-card"><h3>🗂️ Respostas individuais dos clientes <span class="cs-sub" id="mRespCount" style="font-weight:400"></span></h3><div id="mRespList"></div></div>`;

    const $ = s => el.querySelector(s);
    const filtro = () => ({
      de: $("#mDe").value,
      ate: $("#mAte").value,
      cliente: $("#mCli").value,
      pesquisa: $("#mPesq").value,
      atendimento: $("#mAtend").value,
      perfil: $("#mPerf").value
    });

    function popularSelect(selEl, opcoes, valorAtual, padraoTxt) {
      const v = valorAtual ?? selEl.value;
      selEl.innerHTML = `<option value="">${padraoTxt}</option>` + opcoes.map(([k, l]) => `<option value="${esc(k)}"${k === v ? " selected" : ""}>${esc(l)}</option>`).join("");
    }

    async function carregar() {
      const f = filtro();
      try { dados = await api("respostas&" + new URLSearchParams(f)); } catch (e) { $("#mAviso").innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      popularSelect($("#mPesq"), (dados.pesquisas || []).map(p => [p.id, `${p.titulo || "Pesquisa"} (${mesBr(p.mes)})`]), f.pesquisa, "Todas as pesquisas");
      popularSelect($("#mCli"), (dados.clientes || []).map(c => [c.id, `${c.nome}${c.respostas ? ` (${c.respostas})` : ""}`]), f.cliente, "Todos os clientes");
      popularSelect($("#mAtend"), (dados.atendimentos || []).map(a => [a, a]), f.atendimento, "Todo o time");
      $("#mAviso").innerHTML = "";

      const t = dados.total;
      $("#mKpis").innerHTML = `
        <div class="cs-kpi"><b>${t.totalRespostas ?? t.n}</b><span>Respostas</span></div>
        <div class="cs-kpi"><b>${num1(t.nps)}</b><span>Score NPS (−100 a 100)</span></div>
        <div class="cs-kpi"><b>${num1(t.media)}</b><span>Média Recomendação (0–10)</span></div>
        <div class="cs-kpi"><b>${num1(t.mediaServicos)}</b><span>Nota Serviços (0–10)</span></div>
        <div class="cs-kpi"><b style="color:var(--green)">${t.promotores}</b><span>Promotores (9–10)</span></div>
        <div class="cs-kpi"><b style="color:var(--amber)">${t.neutros}</b><span>Neutros (7–8)</span></div>
        <div class="cs-kpi"><b style="color:var(--danger)">${t.detratores}</b><span>Detratores (0–6)</span></div>`;

      renderPerguntas(dados.porPergunta || []);
      renderPorCliente(dados.porCliente || [], f.cliente);
      grafico(dados.porMes || []);
      renderRelatorio(dados);
      renderRespostasIndividuais(dados.listaRespostas || []);
      if (painelAberto) renderPainel();
    }

    function renderPerguntas(lista) {
      $("#mPergSub").textContent = lista.length ? `(${lista.reduce((s, q) => Math.max(s, q.n || 0), 0)} resposta(s) analisada(s))` : "";
      if (!lista.length) {
        $("#mPergBox").innerHTML = `<p class="cs-sub" style="margin:0">Ainda não há respostas suficientes neste filtro para consolidar por pergunta.</p>`;
        return;
      }
      $("#mPergBox").innerHTML = `<div class="cs-pgrid">${lista.map(q => {
        if (q.tipo === "escala" || q.tipo === "nps") {
          const max = q.escalaMax || 5;
          const pct = q.media != null ? Math.max(0, Math.min(100, (q.media / max) * 100)) : 0;
          const cor = pct >= 80 ? "#1B8A4B" : pct >= 60 ? "#1F6FEB" : pct >= 40 ? "#E0A100" : "#C93B3B";
          return `<div class="cs-pbox">
            <h4>${esc(q.pergunta)}</h4>
            <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:13px">
              <span>Média: <b style="font-size:16px">${num1(q.media)}</b> <span class="cs-sub">/ ${max}</span></span>
              <span class="cs-sub">${q.n} resp.</span>
            </div>
            <div class="cs-bar-bg"><div class="cs-bar-fg" style="width:${pct.toFixed(1)}%;background:${cor}"></div></div>
          </div>`;
        }
        return `<div class="cs-pbox">
          <h4>${esc(q.pergunta)}</h4>
          ${(q.opcoes || []).map(o => `<div class="cs-opt-row" title="${esc(o.valor)}: ${o.count} (${o.pct}%)">
              <span class="lbl">${esc(o.valor)}</span>
              <div class="track"><div class="fill" style="width:${o.pct}%"></div></div>
              <b style="min-width:52px;text-align:right">${o.count} <span class="cs-sub">(${o.pct}%)</span></b>
            </div>`).join("")}
        </div>`;
      }).join("")}</div>`;
    }

    function renderPorCliente(lista, cliFiltro) {
      $("#mCliRows").innerHTML = lista.length ? lista.map(c => {
        const cid = c.clienteId || c.chave;
        const stCls = c.nps >= 50 ? "promotor" : c.nps >= 0 ? "neutro" : "detrator";
        const ativo = cliFiltro && (cliFiltro === cid || cliFiltro === c.nome);
        return `<tr style="${ativo ? "background:var(--blue-soft)" : ""}">
          <td><b>${esc(c.nome)}</b></td>
          <td>${esc(c.atendimento || "—")}</td>
          <td class="num">${c.n}</td>
          <td class="num">${num1(c.mediaServicos)}</td>
          <td class="num">${num1(c.media)}</td>
          <td class="num"><span class="st ${stCls}">${num1(c.nps)}</span></td>
          <td class="num">${c.promotores}</td>
          <td class="num">${c.neutros}</td>
          <td class="num">${c.detratores}</td>
          <td>${br(c.ultimaEm) || "—"}</td>
          <td class="acts"><button class="btn" type="button" data-fcli="${esc(cid)}">${ativo ? "Mostrar todos" : "Filtrar"}</button></td>
        </tr>`;
      }).join("") : `<tr><td colspan="11" class="empty">Sem respostas no período ou com os filtros selecionados. Use “📥 Importar respostas” ou “➕ Registrar resposta” acima.</td></tr>`;
    }

    function renderRelatorio(dados) {
      const r = dados.relatorio;
      $("#mRel").textContent = r ? "Gerar de novo com IA" : "Gerar relatório com IA";
      $("#mRel").disabled = !dados.ia;
      const abertasHtml = dados.abertas?.length ? `<div style="margin-top:10px"><b style="font-size:13px">Comentários e sugestões abertas (${dados.abertas.length}):</b><ul style="margin:6px 0 0;padding-left:18px;font-size:13.5px">${dados.abertas.slice(0, 15).map(a => `<li style="margin-bottom:4px"><b>${esc(a.cliente || "Cliente")}</b>${a.atendimento ? ` (${esc(a.atendimento)})` : ""}: ${esc(a.valor)}</li>`).join("")}</ul></div>` : "";
      $("#mRelBox").innerHTML = (dados.ia ? "" : `<div class="note warn" style="margin-bottom:8px">A IA ainda não está ligada (falta a chave OPENAI_API_KEY na Vercel). Abaixo estão os comentários abertos recebidos.</div>`)
        + (r ? `<ol class="cs-pontos">${r.pontos.map(p => `<li><b>${esc(p.titulo)}</b><br><span class="cs-sub" style="font-size:14px">${esc(p.detalhe)}</span></li>`).join("")}</ol>
          <p class="cs-sub">Gerado em ${brHora(r.geradoEm)} por ${esc(r.geradoPor?.nome || "")}, a partir de ${r.respostasAnalisadas} respostas.</p>`
          : `<p class="cs-sub" style="margin:0">${dados.abertas.length ? `${dados.abertas.length} comentário(s) aberto(s) no período.` : "Sem comentários abertos no período."}</p>`)
        + abertasHtml;
    }

    function renderRespostasIndividuais(lista) {
      $("#mRespCount").textContent = lista.length ? `(${lista.length} exibida${lista.length > 1 ? "s" : ""})` : "";
      if (!lista.length) {
        $("#mRespList").innerHTML = `<p class="cs-sub" style="margin:0">Nenhuma resposta encontrada para os filtros selecionados.</p>`;
        return;
      }
      $("#mRespList").innerHTML = lista.map(r => {
        const temNps = r.nota !== null && r.nota !== undefined;
        const pCls = temNps ? perfilNota(r.nota) : "";
        const det = (r.respostas || []).filter(d => d.valor && !/nome da sua empresa/i.test(d.pergunta));
        return `<div class="cs-resp-item" data-rid="${esc(r.id)}">
          <div class="cs-resp-head">
            <div>
              <b style="font-size:15px">${esc(r.clienteNome)}</b>
              ${r.atendimento ? `<span class="st" style="margin-left:6px">Atend.: ${esc(r.atendimento)}</span>` : ""}
              ${temNps
                ? `<span class="st ${pCls}" style="margin-left:6px">NPS: ${r.nota} · ${PERFIL_LBL[pCls] || ""}</span>`
                : `<span class="st" style="margin-left:6px">Sem nota NPS</span>`}
              ${r.notaServicos != null ? `<span class="st" style="margin-left:6px">Serviços: ${r.notaServicos}/10</span>` : ""}
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <span class="cs-sub">${brHora(r.recebidaEm) || mesBr(r.mes)} · ${esc(r.pesquisaTitulo || "")}</span>
              ${r.clienteId ? `<button class="btn" type="button" data-fcli="${esc(r.clienteId)}" style="padding:3px 8px;font-size:12px">Filtrar cliente</button>` : ""}
              <button class="btn" type="button" data-delresp="${esc(r.id)}" title="Excluir resposta" style="padding:3px 8px;font-size:12px">✕</button>
            </div>
          </div>
          ${r.comentario ? `<div style="margin-top:8px;font-size:13.5px;background:var(--amber-soft);border-left:3px solid var(--amber-bd);padding:6px 10px;border-radius:4px"><b>Sugestão / Comentário:</b> ${esc(r.comentario)}</div>` : ""}
          ${det.length ? `<details style="margin-top:8px"><summary class="cs-sub" style="cursor:pointer;font-weight:600;color:var(--blue)">Ver todas as respostas do formulário (${det.length} itens)</summary>
            <div class="cs-resp-qa">${det.map(d => `<div><small>${esc(d.pergunta)}</small><b>${esc(d.valor)}</b></div>`).join("")}</div>
          </details>` : ""}
        </div>`;
      }).join("");
    }

    function parsePreviewTabela(texto) {
      const limpo = String(texto || "").replace(/^\uFEFF/, "").trim();
      if (!limpo) return null;
      const firstLine = limpo.split(/\r?\n/)[0] || "";
      const tabs = (firstLine.match(/\t/g) || []).length;
      const semis = (firstLine.match(/;/g) || []).length;
      const commas = (firstLine.match(/,/g) || []).length;
      const sep = tabs >= semis && tabs >= commas && tabs > 0 ? "\t" : (semis > commas ? ";" : ",");
      const rows = [];
      let row = [], cur = "", inQ = false;
      for (let i = 0; i < limpo.length; i++) {
        const ch = limpo[i];
        if (inQ) {
          if (ch === '"' && limpo[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') inQ = false;
          else cur += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === sep) { row.push(cur.trim()); cur = ""; }
        else if (ch === "\n" || ch === "\r") {
          if (ch === "\r" && limpo[i + 1] === "\n") i++;
          row.push(cur.trim());
          if (row.some(Boolean)) rows.push(row);
          row = []; cur = "";
        } else cur += ch;
      }
      row.push(cur.trim());
      if (row.some(Boolean)) rows.push(row);
      if (rows.length < 2) return null;
      const headers = rows[0].map((h, i) => h || `Coluna ${i + 1}`);
      const guess = rx => headers.find(h => rx.test(h)) || "";
      return {
        headers,
        totalLinhas: rows.length - 1,
        amostra: rows.slice(1, 3),
        sugestao: {
          colData: guess(/carimbo|timestamp|\bdata\b/i),
          colEmpresa: guess(/empresa|cliente|organiza|nome da sua/i),
          colNps: guess(/probabilidade|recomendar|indicar|\bnps\b/i),
          colAtendimento: guess(/profissional|atend|respons[aá]vel|\bcs\b|gestor/i),
        },
      };
    }

    function renderPainel() {
      if (!painelAberto || !dados) { $("#mPainel").innerHTML = ""; return; }
      const pesqOpts = (dados.pesquisas || []).map(p => `<option value="${esc(p.id)}">${esc(p.titulo || "Pesquisa")} (${mesBr(p.mes)})</option>`).join("");
      const cliOpts = (dados.clientes || []).map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join("");
      if (painelAberto === "importar") {
        $("#mPainel").innerHTML = `<div class="cs-card" style="border-color:var(--blue)">
          <h3>📥 Importar respostas do Google Forms (CSV ou Planilha)</h3>
          <p class="cs-sub" style="margin-top:0">Funciona com <b>qualquer formulário</b>, mesmo que as perguntas mudem todo mês. Envie o arquivo <code>.csv</code> baixado do Google Forms, carregue um link do Google Sheets ou cole os dados abaixo para conferir as colunas antes de importar.</p>
          <div class="cs-grid">
            <label>1. Enviar arquivo .CSV / .TSV do Google Forms<input type="file" id="impFile" accept=".csv,.tsv,.txt"></label>
            <label>Ou link da Planilha Google Sheets (pública para leitura)
              <div style="display:flex;gap:6px">
                <input id="impUrl" placeholder="https://docs.google.com/spreadsheets/d/.../edit" style="flex:1">
                <button class="btn" type="button" id="impLerUrl">Ler link</button>
              </div>
            </label>
            <label class="full">Ou cole aqui o conteúdo copiado da Planilha / CSV (com a linha de cabeçalho)<textarea id="impCsv" rows="4" placeholder="Carimbo de data/hora, Nome da empresa, Nota..."></textarea></label>
          </div>
          <div class="cs-bar">
            <button class="btn" type="button" id="impAnalisar">Analisar colunas e pré-visualizar</button>
            <button class="btn" type="button" id="impCancel">Fechar</button>
            <span class="cs-sub" id="impMsg"></span>
          </div>
          <div id="impPasso2" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
            <h4 style="margin:0 0 6px;font-size:14px">2. Confirmação automática das colunas (<span id="impResumo"></span>)</h4>
            <p class="cs-sub" style="margin:0 0 10px">Já pré-selecionamos as colunas principais para você. Ajuste apenas se alguma estiver trocada; todas as outras perguntas da planilha virarão métricas automaticamente.</p>
            <div class="cs-grid">
              <label>Pesquisa de destino
                <select id="impPesq">
                  ${pesqOpts}
                  <option value="__nova__">➕ Criar nova pesquisa para esta planilha…</option>
                </select>
              </label>
              <label>Coluna do Cliente / Empresa
                <select id="impColEmpresa"></select>
              </label>
              <label id="impNovaBox" style="display:none">Nome da nova pesquisa<input id="impNovaTitulo" value="Pesquisa ${esc(mesBr(mesAtual()))}"></label>
              <label id="impNovaMesBox" style="display:none">Mês de referência da nova pesquisa<input type="month" id="impNovaMes" value="${mesAtual()}"></label>
              <label id="impCliFixoBox" class="full" style="display:none">Qual cliente da carteira respondeu esta planilha?<select id="impCliFixoId"><option value="">Selecione o cliente…</option>${cliOpts}</select></label>
              <label>Coluna da Nota Principal / NPS (0 a 10)<select id="impColNps"></select></label>
              <label>Coluna da Data / Carimbo<select id="impColData"></select></label>
              <label>Coluna de Atendimento (opcional)<select id="impColAtend"></select></label>
              <label id="impMesPadraoBox" style="display:none">Mês padrão (quando não há data)<input type="month" id="impMesPadrao" value="${mesAtual()}"></label>
            </div>
            <div id="impExtras" class="cs-sub" style="margin-top:10px;background:var(--surface-2);border:1px solid var(--line);padding:8px 10px;border-radius:6px"></div>
            <div class="cs-bar" style="margin-top:12px">
              <button class="btn primary" type="button" id="impOk">Confirmar e importar respostas</button>
              <span class="cs-sub" id="impMsg2"></span>
            </div>
          </div>
        </div>`;

        const atualizarExtras = headers => {
          const usados = new Set([$("#impColData").value, $("#impColEmpresa").value, $("#impColAtend").value].filter(v => v && v !== "__fixo__"));
          const extras = headers.filter(h => !usados.has(h));
          $("#impExtras").innerHTML = extras.length
            ? `<b>Perguntas que gerarão métricas automaticamente (${extras.length}):</b> ${extras.map(h => `<code>${esc(h)}</code>`).join(" · ")}`
            : `<b>Aviso:</b> nenhuma pergunta extra além dos campos principais foi detectada.`;
          $("#impCliFixoBox").style.display = $("#impColEmpresa").value === "__fixo__" ? "" : "none";
          $("#impMesPadraoBox").style.display = !$("#impColData").value ? "" : "none";
        };

        let parsedAtual = null;
        const abrirPasso2 = () => {
          const parsed = parsePreviewTabela($("#impCsv").value);
          if (!parsed) {
            $("#impMsg").textContent = "Cole ou carregue um arquivo com cabeçalho e pelo menos 1 linha de resposta.";
            $("#impPasso2").style.display = "none";
            return;
          }
          parsedAtual = parsed;
          $("#impResumo").textContent = `${parsed.totalLinhas} resposta(s) · ${parsed.headers.length} coluna(s)`;
          const opts = (sel, extra) => extra + parsed.headers.map(h => `<option value="${esc(h)}"${h === sel ? " selected" : ""}>${esc(h)}</option>`).join("");
          $("#impColEmpresa").innerHTML = opts(parsed.sugestao.colEmpresa, `<option value="__fixo__">— Usar um cliente fixo da carteira —</option>`);
          if (!parsed.sugestao.colEmpresa) $("#impColEmpresa").value = "__fixo__";
          $("#impColNps").innerHTML = opts(parsed.sugestao.colNps, `<option value="__sem_nps__">— Este formulário não tem nota NPS —</option>`);
          if (!parsed.sugestao.colNps) $("#impColNps").value = "__sem_nps__";
          $("#impColData").innerHTML = opts(parsed.sugestao.colData, `<option value="">— Usar mês padrão —</option>`);
          $("#impColAtend").innerHTML = opts(parsed.sugestao.colAtendimento, `<option value="">— Não há coluna de atendimento —</option>`);
          $("#impPasso2").style.display = "";
          $("#impMsg").textContent = "Colunas detectadas! Confira abaixo e clique em Confirmar.";
          atualizarExtras(parsed.headers);
        };

        $("#impPesq").onchange = () => {
          const nova = $("#impPesq").value === "__nova__";
          $("#impNovaBox").style.display = nova ? "" : "none";
          $("#impNovaMesBox").style.display = nova ? "" : "none";
        };
        ["#impColEmpresa", "#impColData", "#impColAtend", "#impColNps"].forEach(id => {
          $(id).onchange = () => { if (parsedAtual) atualizarExtras(parsedAtual.headers); };
        });
        $("#impAnalisar").onclick = abrirPasso2;
        const fInput = $("#impFile");
        if (fInput) fInput.onchange = ev => {
          const f = ev.target.files?.[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = () => { $("#impCsv").value = String(reader.result || ""); abrirPasso2(); };
          reader.readAsText(f, "utf-8");
        };
        $("#impLerUrl").onclick = async () => {
          const url = $("#impUrl").value.trim();
          if (!url) { $("#impMsg").textContent = "Cole o link da planilha do Google Sheets primeiro."; return; }
          $("#impLerUrl").disabled = true; $("#impMsg").textContent = "Lendo planilha do Google Sheets…";
          try {
            const j = await api("planilha.ler", { planilhaUrl: url });
            $("#impCsv").value = j.texto || "";
            abrirPasso2();
          } catch (e) { $("#impMsg").textContent = e.message; }
          $("#impLerUrl").disabled = false;
        };
        $("#impCancel").onclick = () => { painelAberto = null; renderPainel(); };
        $("#impOk").onclick = async () => {
          const pesqId = $("#impPesq").value;
          const colEmp = $("#impColEmpresa").value;
          const cliFixo = $("#impCliFixoId").value;
          if (colEmp === "__fixo__" && !cliFixo) {
            $("#impMsg2").textContent = "Selecione o cliente da carteira ou escolha a coluna com o nome da empresa.";
            return;
          }
          if (pesqId === "__nova__" && !$("#impNovaTitulo").value.trim()) {
            $("#impMsg2").textContent = "Informe um nome para a nova pesquisa.";
            return;
          }
          $("#impOk").disabled = true; $("#impMsg2").textContent = "Importando e gerando métricas…";
          try {
            const colNps = $("#impColNps").value;
            const j = await api("respostas.importar", {
              pesquisaId: pesqId,
              novaPesquisaTitulo: pesqId === "__nova__" ? $("#impNovaTitulo").value.trim() : "",
              novaPesquisaMes: pesqId === "__nova__" ? $("#impNovaMes").value : "",
              texto: $("#impCsv").value,
              mapeamento: {
                colData: $("#impColData").value,
                colEmpresa: colEmp === "__fixo__" ? "" : colEmp,
                clienteFixoId: colEmp === "__fixo__" ? cliFixo : "",
                colNps: colNps === "__sem_nps__" ? "" : colNps,
                semNps: colNps === "__sem_nps__",
                colAtendimento: $("#impColAtend").value,
                mesPadrao: $("#impMesPadrao").value || mesAtual(),
              },
            });
            ctx.toast(`${j.novas} nova(s) resposta(s) importada(s) (de ${j.lidas} lida(s))`);
            painelAberto = null; renderPainel(); carregar();
          } catch (e) {
            $("#impOk").disabled = false; $("#impMsg2").textContent = e.message;
          }
        };
        return;
      }

      if (painelAberto === "manual") {
        const pId = $("#mPesq").value || dados.pesquisas?.[0]?.id || "form_nps_quinze_oficial";
        const pesq = (dados.pesquisas || []).find(x => x.id === pId) || dados.pesquisas?.[0] || { id: "form_nps_quinze_oficial", perguntas: [] };
        const cliOpts = (dados.clientes || []).map(c => `<option value="${esc(c.id)}" data-nome="${esc(c.nome)}">${esc(c.nome)}</option>`).join("");
        const qs = (pesq.perguntas || []).filter(q => !/nome da sua empresa|profissional.*atende/i.test(q.texto));
        $("#mPainel").innerHTML = `<div class="cs-card" style="border-color:var(--blue)">
          <h3>➕ Registrar resposta de pesquisa manualmente</h3>
          <div class="cs-grid">
            <label>Pesquisa / Formulário<select id="manPesq">${(dados.pesquisas || []).map(p => `<option value="${esc(p.id)}"${p.id === pesq.id ? " selected" : ""}>${esc(p.titulo || "Pesquisa")}</option>`).join("")}</select></label>
            <label>Cliente da Carteira<select id="manCli"><option value="">Outro / Digitar manualmente</option>${cliOpts}</select></label>
            <label>Nome da Empresa *<input id="manNome" placeholder="Ex.: Clínica Exemplo"></label>
            <label>Atendimento responsável<input id="manAtend" placeholder="Ex.: LAÍS, EDUARDO, MARCOS..."></label>
            <label>Data da resposta<input type="date" id="manData" value="${new Date().toISOString().slice(0, 10)}"></label>
            ${qs.map((q, idx) => {
              if (q.tipo === "nps") return `<label>${esc(q.texto)} (0 a 10) *<input type="number" min="0" max="10" id="manNps" data-mq="${idx}" data-mtxt="${esc(q.texto)}" value="10"></label>`;
              if (q.tipo === "escala") return `<label>${esc(q.texto)} (até ${q.escalaMax || 5})<select data-mq="${idx}" data-mtxt="${esc(q.texto)}" data-esc="${q.escalaMax || 5}">${Array.from({ length: (q.escalaMax || 5) + (q.escalaMax === 10 ? 1 : 0) }, (_, i) => (q.escalaMax === 10 ? i : i + 1)).reverse().map(n => `<option value="${n}">${n}</option>`).join("")}</select></label>`;
              if (q.tipo === "multipla") return `<label>${esc(q.texto)}<select data-mq="${idx}" data-mtxt="${esc(q.texto)}">${(q.opcoes || []).map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select></label>`;
              return `<label class="full">${esc(q.texto)}<textarea rows="2" data-mq="${idx}" data-mtxt="${esc(q.texto)}"></textarea></label>`;
            }).join("")}
            ${!qs.some(q => q.tipo === "nps") ? `<label>Nota NPS Recomendação (0 a 10) *<input type="number" min="0" max="10" id="manNps" value="10"></label>` : ""}
          </div>
          <div class="cs-bar">
            <button class="btn primary" type="button" id="manOk">Salvar resposta</button>
            <button class="btn" type="button" id="manCancel">Cancelar</button>
            <span class="cs-sub" id="manMsg"></span>
          </div>
        </div>`;
        $("#manPesq").onchange = () => { $("#mPesq").value = $("#manPesq").value; renderPainel(); };
        $("#manCli").onchange = () => {
          const opt = $("#manCli").selectedOptions?.[0];
          if (opt && opt.value) $("#manNome").value = opt.dataset.nome || "";
        };
        $("#manCancel").onclick = () => { painelAberto = null; renderPainel(); };
        $("#manOk").onclick = async () => {
          $("#manOk").disabled = true; $("#manMsg").textContent = "Salvando…";
          const respostas = [];
          const atendVal = $("#manAtend").value.trim();
          if (atendVal) respostas.push({ pergunta: "Quem é o profissional da Quinze que atende sua conta?", valor: atendVal });
          el.querySelectorAll("[data-mq]").forEach(inp => {
            if (inp.id === "manNps") return;
            const val = String(inp.value || "").trim();
            if (val) respostas.push({ pergunta: inp.dataset.mtxt, valor: val });
          });
          try {
            await api("resposta.registrar", {
              pesquisaId: $("#manPesq").value,
              clienteId: $("#manCli").value,
              clienteNome: $("#manNome").value,
              atendimento: atendVal,
              data: $("#manData").value,
              nota: Number($("#manNps")?.value ?? 10),
              respostas
            });
            ctx.toast("Resposta registrada com sucesso");
            painelAberto = null; renderPainel(); carregar();
          } catch (e) {
            $("#manOk").disabled = false; $("#manMsg").textContent = e.message;
          }
        };
      }
    }

    function grafico(meses) {
      if (!meses.length) { $("#mChart").innerHTML = `<p class="cs-sub">Sem dados no período.</p>`; return; }
      const W = 640, H = 220, L = 40, R = 14, T = 14, B = 34;
      const x = i => L + (meses.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (meses.length - 1));
      const y = v => T + (100 - v) / 200 * (H - T - B);
      const yM = v => T + (10 - v) / 10 * (H - T - B);
      const grade = [-100, -50, 0, 50, 100].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="var(--ink2)">${v}</text>`).join("");
      const linha = (fn, k, cor) => `<polyline fill="none" stroke="${cor}" stroke-width="2.5" points="${meses.map((m, i) => `${x(i)},${fn(m[k] ?? 0)}`).join(" ")}"/>` + meses.map((m, i) => `<circle cx="${x(i)}" cy="${fn(m[k] ?? 0)}" r="4" fill="${cor}"><title>${mesBr(m.chave)}: ${k === "nps" ? "NPS " + num1(m.nps) : "média " + num1(m.media)} (${m.n} resp.)</title></circle>`).join("");
      $("#mChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="NPS por mês">${grade}${linha(y, "nps", "#1F6FEB")}${linha(yM, "media", "#E0A100")}
        ${meses.map((m, i) => `<text x="${x(i)}" y="${H - 12}" font-size="11" text-anchor="middle" fill="var(--ink2)">${mesBr(m.chave)}</text>`).join("")}</svg>
        <div class="cs-sub"><span style="color:#1F6FEB">●</span> NPS (escala −100 a 100) &nbsp; <span style="color:#E0A100">●</span> Nota média (escala 0 a 10)</div>`;
    }

    ["#mDe", "#mAte", "#mCli", "#mPesq", "#mAtend", "#mPerf"].forEach(s => $(s).addEventListener("change", carregar));
    $("#mLimpar").onclick = () => {
      $("#mPesq").value = ""; $("#mCli").value = ""; $("#mAtend").value = ""; $("#mPerf").value = "";
      $("#mDe").value = `${ano}-01`; $("#mAte").value = mesAtual();
      carregar();
    };
    $("#mSync").onclick = async () => {
      $("#mSync").disabled = true; $("#mSyncMsg").textContent = "Sincronizando respostas dos formulários e planilhas vinculadas…";
      try {
        const j = await api("forms.sync", {});
        $("#mSyncMsg").textContent = `${j.novas} resposta(s) nova(s) lida(s) de ${j.formularios} pesquisa(s)${j.erros?.length ? ` · avisos: ${j.erros.join("; ")}` : " · caso o Forms ainda não tenha planilha pública vinculada, use “📥 Importar respostas”."}`;
      } catch (e) { $("#mSyncMsg").textContent = e.message; }
      $("#mSync").disabled = false; carregar();
    };
    $("#mBtnImp").onclick = () => { painelAberto = painelAberto === "importar" ? null : "importar"; renderPainel(); };
    $("#mBtnMan").onclick = () => { painelAberto = painelAberto === "manual" ? null : "manual"; renderPainel(); };
    $("#mRel").onclick = async () => {
      $("#mRel").disabled = true; $("#mRelBox").insertAdjacentHTML("afterbegin", `<p class="cs-sub" id="mRelEsp">A IA está lendo as respostas…</p>`);
      try { await api("relatorio.gerar", filtro()); ctx.toast("Relatório gerado"); } catch (e) { ctx.toast(e.message); }
      carregar();
    };
    el.addEventListener("click", async ev => {
      const fc = ev.target.closest("[data-fcli]");
      if (fc) {
        const cid = fc.dataset.fcli;
        $("#mCli").value = $("#mCli").value === cid ? "" : cid;
        carregar();
        return;
      }
      const del = ev.target.closest("[data-delresp]");
      if (del) {
        if (!del.dataset.armado) { del.dataset.armado = "1"; del.textContent = "Confirmar?"; return; }
        try { await api("resposta.excluir", { id: del.dataset.delresp }); ctx.toast("Resposta excluída"); carregar(); } catch (e) { ctx.toast(e.message); }
      }
    });
    return carregar;
  }

  // ======================================================================
  // RECLAMAÇÕES
  // ======================================================================
  const GRAV = { baixa: "Baixa", media: "Média", alta: "Alta" };
  const ST_R = { aberta: "Aberta", em_andamento: "Em andamento", resolvida: "Resolvida" };
  function reclamacoes(ctx) {
    const el = ctx.el; let dados = null;
    el.innerHTML = `<div class="cs-h"><div><h2>Reclamações</h2><div class="cs-sub">Registros pontuais da rotina, fora da pesquisa. Editam: quem registrou, o Mestre e a gestão.</div></div><span class="sp"></span>
      <button class="btn primary" type="button" id="rNova">Registrar reclamação</button></div>
      <div id="rForm"></div>
      <div class="cs-h"><select id="fCli"><option value="">Todos os clientes</option></select><select id="fGrav"><option value="">Toda gravidade</option>${Object.entries(GRAV).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        <select id="fSt"><option value="">Todos os status</option>${Object.entries(ST_R).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        <label class="cs-sub">De <input type="date" id="fDe"></label><label class="cs-sub">Até <input type="date" id="fAte"></label></div>
      <div class="cs-wrap"><table class="cs-tbl"><thead><tr><th>Data</th><th>Cliente</th><th>Canal</th><th>Gravidade</th><th>Descrição</th><th>Responsável</th><th>Status</th><th></th></tr></thead><tbody id="rRows"><tr><td colspan="8" class="empty">Carregando…</td></tr></tbody></table></div>`;
    const $ = s => el.querySelector(s);
    async function carregar() {
      try { dados = await api("reclamacoes"); } catch (e) { $("#rRows").innerHTML = `<tr><td colspan="8" class="empty">${esc(e.message)}</td></tr>`; return; }
      if ($("#fCli").options.length <= 1) $("#fCli").insertAdjacentHTML("beforeend", dados.clientes.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join(""));
      render();
    }
    function render() {
      const f = { cli: $("#fCli").value, g: $("#fGrav").value, s: $("#fSt").value, de: $("#fDe").value, ate: $("#fAte").value };
      const l = dados.reclamacoes.filter(r => (!f.cli || r.clienteId === f.cli) && (!f.g || r.gravidade === f.g) && (!f.s || r.status === f.s) && (!f.de || r.data >= f.de) && (!f.ate || r.data <= f.ate));
      $("#rRows").innerHTML = l.length ? l.map(r => `<tr data-id="${esc(r.id)}"><td>${br(r.data)}</td><td><b>${esc(r.clienteNome)}</b></td><td>${esc(r.canal)}</td><td><span class="st ${r.gravidade}">${GRAV[r.gravidade]}</span></td>
        <td>${esc(r.descricao)}${r.resolucao ? `<div class="cs-sub">Resolução${r.dataResolucao ? " (" + br(r.dataResolucao) + ")" : ""}: ${esc(r.resolucao)}</div>` : ""}<div class="cs-sub">registrada por ${esc(r.criadoPor?.nome || "")}</div></td>
        <td>${esc(r.responsavel?.nome || "—")}</td><td><span class="st ${r.status}">${ST_R[r.status]}</span></td>
        <td class="acts">${r.podeEditar ? `<button class="btn" data-a="ed">Editar</button>` : ""}</td></tr>`).join("") : `<tr><td colspan="8" class="empty">Nenhuma reclamação ${dados.reclamacoes.length ? "com esses filtros" : "registrada"}.</td></tr>`;
    }
    function historico(cid, atual) {
      const h = dados.reclamacoes.filter(r => r.clienteId === cid && r.id !== atual);
      $("#rHist").innerHTML = !cid ? "" : h.length ? `<div class="note" style="margin-top:10px"><b>Histórico deste cliente (${h.length}):</b><ul style="margin:6px 0 0;padding-left:18px">${h.map(r => `<li>${br(r.data)} · ${GRAV[r.gravidade]} · ${ST_R[r.status]}: ${esc(r.descricao.slice(0, 120))}</li>`).join("")}</ul></div>` : `<p class="cs-sub">Nenhuma reclamação anterior deste cliente.</p>`;
    }
    function form(r) {
      r = r || { data: dados.hoje, status: "aberta", gravidade: "media", canal: "WhatsApp" };
      const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, l]) => `<option value="${esc(k)}"${k === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
      $("#rForm").innerHTML = `<div class="cs-card" style="border-color:var(--blue)"><h3>${r.id ? "Editar reclamação" : "Registrar reclamação"}</h3><div class="cs-grid">
        <label>Cliente (Carteira)${sel("eCli", [["", "Escolha"], ...dados.clientes.map(c => [c.id, c.nome]), ...(r.clienteId && !dados.clientes.some(c => c.id === r.clienteId) ? [[r.clienteId, r.clienteNome]] : [])], r.clienteId || "")}</label>
        <label>Data<input type="date" id="eData" value="${r.data || ""}"></label>
        <label>Canal${sel("eCanal", dados.canais.map(c => [c, c]), r.canal)}</label>
        <label>Gravidade${sel("eGrav", Object.entries(GRAV), r.gravidade)}</label>
        <label>Responsável${sel("eResp", [["", "—"], ...dados.usuarios.map(u => [u.login, u.nome])], r.responsavel?.login || "")}</label>
        <label>Status${sel("eSt", Object.entries(ST_R), r.status)}</label>
        <label class="full">Descrição<textarea id="eDesc" rows="3">${esc(r.descricao || "")}</textarea></label>
        <label class="full" id="eResL">Resolução (obrigatória ao marcar como resolvida)<textarea id="eRes" rows="2">${esc(r.resolucao || "")}</textarea></label>
        <label id="eDrL">Data de resolução<input type="date" id="eDr" value="${r.dataResolucao || ""}"></label></div>
        <div id="rHist"></div>
        <div class="cs-bar"><button class="btn primary" type="button" id="eOk">Salvar</button><button class="btn" type="button" id="eNo">Cancelar</button>
        ${r.id ? `<span style="flex:1"></span><button class="btn" type="button" id="eDel">Excluir</button>` : ""}<span class="cs-sub" id="eMsg"></span></div></div>`;
      const st = () => { $("#eDrL").hidden = $("#eSt").value !== "resolvida"; };
      $("#eSt").onchange = st; st();
      $("#eCli").onchange = () => historico($("#eCli").value, r.id); historico(r.clienteId, r.id);
      $("#eNo").onclick = () => { $("#rForm").innerHTML = ""; };
      $("#eOk").onclick = async () => {
        try { await api("reclamacao.salvar", { id: r.id, clienteId: $("#eCli").value, data: $("#eData").value, canal: $("#eCanal").value, gravidade: $("#eGrav").value,
            responsavel: $("#eResp").value, status: $("#eSt").value, descricao: $("#eDesc").value, resolucao: $("#eRes").value, dataResolucao: $("#eDr").value });
          ctx.toast("Reclamação salva"); $("#rForm").innerHTML = ""; carregar(); } catch (e) { $("#eMsg").textContent = e.message; }
      };
      let armado = false;
      if (r.id) $("#eDel").onclick = async ev => {
        if (!armado) { armado = true; ev.target.textContent = "Clique de novo para excluir"; return; }
        try { await api("reclamacao.excluir", { id: r.id }); ctx.toast("Excluída"); $("#rForm").innerHTML = ""; carregar(); } catch (e) { $("#eMsg").textContent = e.message; }
      };
    }
    $("#rNova").onclick = () => dados && form(null);
    ["#fCli", "#fGrav", "#fSt", "#fDe", "#fAte"].forEach(s => $(s).addEventListener("change", () => dados && render()));
    el.addEventListener("click", ev => { if (ev.target.dataset.a === "ed") form(dados.reclamacoes.find(r => r.id === ev.target.closest("tr").dataset.id)); });
    return carregar;
  }

  const MONTAR = { npsmedia: npsMedia, reclamacoes };
  Object.entries(MONTAR).forEach(([id, montar]) => {
    let recarregar = null;
    QZ.modulo({ id, iniciar(ctx) { recarregar = montar(ctx); if (!ctx.el.hidden) recarregar(); }, aoMostrar() { if (recarregar) recarregar(); } });
  });
})();
