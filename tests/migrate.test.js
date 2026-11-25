import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  VERSAO_BASE_LEGADA,
  parsearNomeMigration,
  listarMigrations,
  calcularPendentes,
  dividirComandosSql,
} from "../scripts/migrate.js";

test("parsearNomeMigration reconhece formato válido e rejeita inválidos", () => {
  assert.deepEqual(parsearNomeMigration("008_criar_ocorrencias.sql"), {
    versao: 8,
    nome: "criar_ocorrencias",
    arquivo: "008_criar_ocorrencias.sql",
  });
  assert.equal(parsearNomeMigration("8_curto.sql"), null);
  assert.equal(parsearNomeMigration("008-com-hifen.sql"), null);
  assert.equal(parsearNomeMigration("README.md"), null);
});

test("listarMigrations ordena, rejeita versão <= baseline (7) e versões duplicadas", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qz-mig-"));
  try {
    fs.writeFileSync(path.join(dir, "README.md"), "# docs");
    fs.writeFileSync(path.join(dir, "009_segunda.sql"), "SELECT 2;");
    fs.writeFileSync(path.join(dir, "008_primeira.sql"), "SELECT 1;");
    const lista = listarMigrations(dir);
    assert.deepEqual(lista.map(m => m.versao), [8, 9]);

    fs.writeFileSync(path.join(dir, "007_antiga.sql"), "SELECT 0;");
    assert.throws(() => listarMigrations(dir), new RegExp(String(VERSAO_BASE_LEGADA)));
    fs.rmSync(path.join(dir, "007_antiga.sql"));

    fs.writeFileSync(path.join(dir, "008_duplicada.sql"), "SELECT 1;");
    assert.throws(() => listarMigrations(dir), /duplicada/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("calcularPendentes filtra versões já aplicadas", () => {
  const migs = [{ versao: 8 }, { versao: 9 }, { versao: 10 }];
  const pendentes = calcularPendentes(migs, [{ versao: 1 }, { versao: 7 }, { versao: 8 }]);
  assert.deepEqual(pendentes.map(m => m.versao), [9, 10]);
});

test("dividirComandosSql preserva strings, comentários e blocos $$...$$", () => {
  const sql = `
    -- cria tabela com ponto e vírgula em string
    CREATE TABLE IF NOT EXISTS demo (
      id serial PRIMARY KEY,
      nota text DEFAULT 'a;b''c'
    );
    /* comentário com ; ignorado */
    DO $$
    BEGIN
      PERFORM 1;
      PERFORM 2;
    END $$;
    CREATE INDEX IF NOT EXISTS idx_demo ON demo (id);
  `;
  const cmds = dividirComandosSql(sql);
  assert.equal(cmds.length, 3);
  assert.match(cmds[0], /^CREATE TABLE IF NOT EXISTS demo/);
  assert.equal(cmds[0].includes("'a;b''c'"), true);
  assert.match(cmds[1], /^DO \$\$/);
  assert.match(cmds[2], /^CREATE INDEX IF NOT EXISTS idx_demo/);
});
