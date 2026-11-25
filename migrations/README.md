# Migrations SQL — Central Quinze (Neon Postgres)

Este diretório guarda as alterações versionadas de schema do banco PostgreSQL no Neon.

## Compatibilidade com o banco em produção
A tabela `schema_migrations` em produção possui as colunas:
- `versao` (`integer`)
- `nome` (`text`)
- `aplicada_em` (`timestamp with time zone`)

As versões `1` a `7` representam o baseline legado já aplicado em produção. Portanto, **novas migrations devem começar obrigatoriamente em `008`**:

```text
migrations/008_criar_tabela_exemplo.sql
```

## Convenção de nomes
- Padrão obrigatório: `^\d{3,}_[a-z0-9_]+\.sql$` (ex.: `008_criar_ocorrencias.sql`).
- Use `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` sempre que possível.
- **Nunca** execute `CREATE TABLE` ou `ALTER TABLE` dentro de arquivos em `api/` (o `npm run check` bloqueia DDL em runtime).

## Quando criar tabela SQL própria vs. usar `docs`
- **Tabela SQL própria (via `migrations/`):** entidades com crescimento contínuo, histórico, relatórios, agregações ou filtros cruzados.
- **`docs` JSONB:** configurações simples e coleções pequenas (< ~200 registros).

## Comandos
Configure `DATABASE_URL` no ambiente (ou no arquivo `.env.local` na raiz) e execute:

```bash
npm run migrate:status   # lista migrations aplicadas e pendentes sem alterar o banco
npm run migrate          # aplica em transação as migrations pendentes
```
