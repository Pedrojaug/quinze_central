// Runner de migrations SQL versionadas para o Neon Postgres (compatível com schema_migrations).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { neon } from "@neondatabase/serverless";

export const VERSAO_BASE_LEGADA = 7;
export const RE_MIGRATION = /^(\d{3,})_([a-z0-9_]+)\.sql$/;

export function parsearNomeMigration(arquivo) {
  const m = RE_MIGRATION.exec(String(arquivo || ""));
  if (!m) return null;
  return {
    versao: Number(m[1]),
    nome: m[2],
    arquivo: m[0],
  };
}

export function listarMigrations(dir) {
  if (!fs.existsSync(dir)) return [];
  const arquivos = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith(".sql"))
    .map(e => e.name)
    .sort();

  const vistas = new Set();
  const lista = [];
  for (const arq of arquivos) {
    const parsed = parsearNomeMigration(arq);
    if (!parsed) {
      throw new Error(`Nome de migration inválido: "${arq}". Use o padrão 008_descricao.sql.`);
    }
    if (parsed.versao <= VERSAO_BASE_LEGADA) {
      throw new Error(`Versão da migration "${arq}" deve ser > ${VERSAO_BASE_LEGADA} (baseline legado).`);
    }
    if (vistas.has(parsed.versao)) {
      throw new Error(`Versão duplicada de migration: ${parsed.versao} ("${arq}").`);
    }
    vistas.add(parsed.versao);
    lista.push({
      ...parsed,
      caminho: path.join(dir, arq),
    });
  }
  return lista.sort((a, b) => a.versao - b.versao);
}

export function calcularPendentes(migrations = [], aplicadas = []) {
  const setAplicadas = aplicadas instanceof Set
    ? aplicadas
    : new Set(aplicadas.map(x => Number(typeof x === "object" && x !== null ? x.versao : x)));
  return migrations.filter(m => !setAplicadas.has(m.versao));
}

export function dividirComandosSql(sqlTexto) {
  const s = String(sqlTexto || "");
  const out = [];
  let buf = "";
  let i = 0;

  while (i < s.length) {
    const ch = s[i];
    const next = s[i + 1];

    // Comentário de linha -- ...
    if (ch === "-" && next === "-") {
      while (i < s.length && s[i] !== "\n") i++;
      continue;
    }

    // Comentário de bloco /* ... */
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      buf += " ";
      continue;
    }

    // String literal '...' (com escape '')
    if (ch === "'") {
      buf += ch;
      i++;
      while (i < s.length) {
        buf += s[i];
        if (s[i] === "'") {
          if (s[i + 1] === "'") {
            buf += s[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Dollar-quoting $$...$$ ou $tag$...$tag$
    if (ch === "$") {
      const mTag = /^\$[A-Za-z0-9_]*\$/.exec(s.slice(i));
      if (mTag) {
        const tag = mTag[0];
        const fim = s.indexOf(tag, i + tag.length);
        if (fim !== -1) {
          buf += s.slice(i, fim + tag.length);
          i = fim + tag.length;
          continue;
        }
      }
    }

    if (ch === ";") {
      const cmd = buf.trim();
      if (cmd) out.push(cmd);
      buf = "";
      i++;
      continue;
    }

    buf += ch;
    i++;
  }

  const ultimo = buf.trim();
  if (ultimo) out.push(ultimo);
  return out;
}

export function carregarEnvLocal(raiz = process.cwd()) {
  if (process.env.DATABASE_URL) return;
  for (const nome of [".env.local", ".env"]) {
    const p = path.join(raiz, nome);
    if (!fs.existsSync(p)) continue;
    const linhas = fs.readFileSync(p, "utf8").split(/\r?\n/);
    for (const linha of linhas) {
      const lim = linha.trim();
      if (!lim || lim.startsWith("#")) continue;
      const eq = lim.indexOf("=");
      if (eq <= 0) continue;
      const k = lim.slice(0, eq).trim();
      let v = lim.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
    if (process.env.DATABASE_URL) return;
  }
}

async function executarCli() {
  const args = new Set(process.argv.slice(2));
  const apenasStatus = args.has("--status") || args.has("--dry-run");
  const raiz = process.cwd();
  carregarEnvLocal(raiz);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL não configurada (defina no ambiente ou em .env.local).");
    process.exit(1);
  }

  const migrations = listarMigrations(path.join(raiz, "migrations"));
  const sql = neon(dbUrl);
  const aplicadasRows = await sql`SELECT versao, nome, aplicada_em FROM schema_migrations ORDER BY versao`;
  const pendentes = calcularPendentes(migrations, aplicadasRows);

  console.log(`Schema atual no Neon: ${aplicadasRows.length} versão(ões) registrada(s) (máx: ${aplicadasRows.at(-1)?.versao ?? 0}).`);
  if (!pendentes.length) {
    console.log("Nenhuma migration pendente.");
    return;
  }

  console.log(`Migrations pendentes (${pendentes.length}): ${pendentes.map(m => m.arquivo).join(", ")}`);
  if (apenasStatus) return;

  for (const m of pendentes) {
    const conteudo = fs.readFileSync(m.caminho, "utf8");
    const comandos = dividirComandosSql(conteudo);
    if (!comandos.length) {
      throw new Error(`Migration vazia: ${m.arquivo}`);
    }
    await sql.transaction(txn => [
      ...comandos.map(cmd => txn.query(cmd)),
      txn.query("INSERT INTO schema_migrations (versao, nome, aplicada_em) VALUES ($1, $2, now())", [m.versao, m.nome]),
    ]);
    console.log(`Aplicada: ${m.arquivo}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  executarCli().catch(err => {
    console.error("[migrate]", err?.message || err);
    process.exit(1);
  });
}
