  const MONTAR = { envio, fila, pecasdash: dash };
  const recarregadores = {};
  const secoesModulo = {};

  let syncEmAndamento = false;
  let timerPollPecas = null;

  async function sincronizarPecasTempoReal() {
    if (syncEmAndamento || document.hidden) return;
    const temAbaMontada = !!(secoesModulo.fila || secoesModulo.envio || secoesModulo.pecasdash);
    if (!temAbaMontada) return;
    syncEmAndamento = true;
    try {
      const r = await api("pecas");
      const todas = r.pecas || [];
      if (r.perfis) atualizarMapaPerfis(r.perfis);
      atualizarBadgeFila(todas);
      if (secoesModulo.fila && !secoesModulo.fila.hidden && recarregadores.fila) {
        await recarregadores.fila({ pecas: todas, perfis: r.perfis, silencioso: true });
      }
      if (secoesModulo.envio && !secoesModulo.envio.hidden && recarregadores.envio) {
        await recarregadores.envio({ pecas: todas, perfis: r.perfis, silencioso: true });
      }
    } catch {}
    finally { syncEmAndamento = false; }
  }

  window.QZ_atualizarPerfilLocalPecas = info => {
    if (!info || !info.login) return;
    atualizarMapaPerfis({ [info.login]: { nome: info.nome || info.login, avatar: info.avatar || null } });
    if (base) {
      for (const listaU of [base.equipe, base.usuarios]) {
        if (Array.isArray(listaU)) {
          const item = listaU.find(x => x.login === info.login);
          if (item) { item.nome = info.nome || item.nome; item.avatar = info.avatar || null; }
        }
      }
    }
    sincronizarPecasTempoReal();
  };

  function agendarPollPecas() {
    clearTimeout(timerPollPecas);
    timerPollPecas = setTimeout(async () => {
      await sincronizarPecasTempoReal();
      agendarPollPecas();
    }, document.hidden ? 20000 : 8000);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      sincronizarPecasTempoReal();
      agendarPollPecas();
    }
  });

  Object.entries(MONTAR).forEach(([id, montar]) => {
    let recarregar = null;
    // Cada perfil recebe só algumas destas abas: as que não existem para o usuário não são montadas.
    QZ.modulo({
      id,
      iniciar(ctx) {
        if (!ctx.el) return;
        recarregar = montar(ctx);
        recarregadores[id] = recarregar;
        secoesModulo[id] = ctx.el;
        if (!ctx.el.hidden) recarregar();
        else sincronizarPecasTempoReal();
        agendarPollPecas();
      },
      aoMostrar() {
        if (recarregar) recarregar();
      }
    });
  });
