# Fluxo de Trabalho e Boas Práticas do Time

Este guia foi feito para que a equipe de desenvolvimento (estagiários e mantenedores) consiga trabalhar de forma coordenada, sem sobrescrever o código do colega e sem quebrar o site em produção.

---

## 1. A Regra de Ouro: Nunca commite direto na `main`

Como a Vercel atualiza o site oficial **automaticamente** a cada commit na branch `main`, qualquer erro enviado para ela vai direto para os usuários da agência.

### O fluxo correto para qualquer alteração:

1. **Atualize sua máquina com a versão mais recente:**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Crie uma branch com o nome da sua tarefa:**
   ```bash
   git checkout -b feature/ajuste-onboarding
   # ou para correção de bugs:
   git checkout -b fix/erro-login
   ```

3. **Faça suas alterações e teste:**
   Sempre execute o comando de build antes de enviar:
   ```bash
   node build.js
   ```
   *Se o build acusar erro de sintaxe ou tag inválida, corrija antes de commitar!*

4. **Envie sua branch para o GitHub:**
   ```bash
   git add .
   git commit -m "feat: adiciona campo de observação no onboarding"
   git push -u origin feature/ajuste-onboarding
   ```

5. **Abra um Pull Request (PR) no GitHub:**
   * Vá no GitHub do projeto ([https://github.com/Pedrojaug/quinze_central](https://github.com/Pedrojaug/quinze_central)).
   * Clique em **"Compare & pull request"**.
   * Peça para um dos outros 2 estagiários dar uma olhada e clicar em **Merge**!

---

## 2. Padrão de Mensagens de Commit

Para manter o histórico legível como o de uma empresa séria de tecnologia, use o padrão simples:

* `feat: ...` ➔ Nova funcionalidade (ex: `feat: adiciona filtro por social media`)
* `fix: ...` ➔ Correção de bug (ex: `fix: corrige cálculo de faturamento na carteira`)
* `perf: ...` ➔ Melhoria de desempenho (ex: `perf: ajusta tempo de polling para 12s`)
* `docs: ...` ➔ Documentação (ex: `docs: adiciona instruções no README`)
* `style: ...` ➔ Ajuste visual ou CSS sem mexer na lógica (ex: `style: melhora espaçamento no mobile`)

---

## 3. Cuidados Especiais com este Projeto

1. **Não adicione tags `</script>` dentro de arquivos em `src/js/`:**
   O script [`build.js`](file:///c:/Users/equip/Downloads/quinze-central/build.js) junta todos os arquivos em um único script HTML. Se houver `</script>` dentro do seu código JS, o navegador fechará a tag antes da hora e o build lançará um erro de propósito.
2. **Cuidado ao editar o `store.js`:**
   Esse arquivo controla todo o tráfego do banco. Teste muito bem qualquer alteração nele antes de subir.
3. **Nunca commite senhas ou o arquivo `.env`:**
   O `.gitignore` já bloqueia arquivos `.env`. Chaves e senhas reais devem ser adicionadas apenas no painel da Vercel.
