// ============================================================================
// MODELO DE MÓDULO — copie este arquivo para criar uma funcionalidade nova.
// ----------------------------------------------------------------------------
// 1. Copie para /modulos/<id>.js (ex.: /modulos/avisos.js) e troque o id.
// 2. Registre em api/_modules.js:
//      { id: "avisos", nome: "Mural de avisos", ordem: 90, arquivo: "/modulos/avisos.js",
//        card: { titulo: "Mural de avisos", texto: "Recados para a equipe" } },
// 3. Publique. A aba aparece sozinha para o mestre e para quem é atendimento
//    (ou para quem tiver a aba marcada em "Personalizado").
//
// O que o módulo recebe em ctx:
//   ctx.el            a área da aba (escreva o HTML aqui)
//   ctx.dados(nome)   coleção exclusiva do módulo: ctx.dados("itens").doc(id).set({...})
//                     .onSnapshot(s => s.docs.map(d => d.data())) para ouvir mudanças
//   ctx.db            banco completo (respeita as permissões do usuário)
//   ctx.me            usuário logado { login, nome, papel, funcao, abas }
//   ctx.clientes()    clientes da carteira do mês selecionado
//   ctx.equipe()      { atendimentos: [...], socials: [...] }
//   ctx.onboardings() onboardings carregados
//   ctx.irPara(aba)   abre outra aba ("onb", "prop", "agenda"...)
//   ctx.toast(msg), ctx.esc(txt), ctx.br(iso), ctx.brl(valor), ctx.hoje(),
//   ctx.diasUteis(de, ate), ctx.somarDiasUteis(data, n)
// Os estilos da página (panel, btn, btn primary, fgrid, note, tag...) já valem aqui.
// ============================================================================
QZ.modulo({
  id: "modelo",
  iniciar(ctx) {
    ctx.el.innerHTML = `
      <div class="toolbar"><div style="flex:1"><h2 style="margin:0">${ctx.esc(ctx.nome)}</h2>
        <div class="muted" style="font-size:13px">Exemplo de módulo novo.</div></div></div>
      <div class="panel"><div class="row"><input id="mdTexto" placeholder="Escreva um recado" style="flex:1">
        <button class="btn primary" type="button" id="mdAdd">Adicionar</button></div><ul id="mdLista"></ul></div>`;
    const lista = ctx.dados("itens");
    lista.onSnapshot(s => {
      ctx.el.querySelector("#mdLista").innerHTML = s.docs.map(d => d.data())
        .sort((a, b) => b.em.localeCompare(a.em))
        .map(i => `<li>${ctx.esc(i.texto)} <span class="muted">· ${ctx.esc(i.autor)}</span></li>`).join("");
    });
    ctx.el.querySelector("#mdAdd").addEventListener("click", async () => {
      const t = ctx.el.querySelector("#mdTexto").value.trim(); if (!t) return;
      await lista.doc(Date.now().toString(36)).set({ texto: t, autor: ctx.me?.nome || "", em: new Date().toISOString() });
      ctx.el.querySelector("#mdTexto").value = ""; ctx.toast("Adicionado");
    });
  },
  aoMostrar(ctx) { /* opcional: roda toda vez que a aba é aberta */ },
});
