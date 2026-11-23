import test from "node:test";
import assert from "node:assert/strict";
import {
  BLOBS_DB_PARENT,
  ehChaveBanco,
  blobDocId,
  guardarBlobNoBanco,
  infoBlobNoBanco,
  lerBlobDoBanco,
  enviarBlobDoBanco,
  apagarBlobsDoBanco,
  listarBlobsDoBanco,
} from "../api/_pecas_blobs_db.js";

function criarSqlMock() {
  const store = new Map();
  let seq = 1;
  return {
    store,
    sql: async (strings, ...vals) => {
      const query = strings.join("?").replace(/\s+/g, " ").trim();
      if (query.startsWith("INSERT INTO docs")) {
        const [docPath, parent, id, jsonStr] = vals;
        store.set(docPath, {
          path: docPath,
          parent,
          id,
          data: JSON.parse(jsonStr),
          deleted: false,
          seq: seq++,
          updated_at: new Date().toISOString(),
        });
        return [];
      }
      if (query.includes("SELECT data->>'tipo' AS tipo")) {
        const row = store.get(vals[0]);
        if (!row || row.deleted) return [];
        return [{ tipo: row.data.tipo, tamanho: row.data.tamanho }];
      }
      if (query.includes("SELECT data FROM docs WHERE path")) {
        const row = store.get(vals[0]);
        if (!row || row.deleted) return [];
        return [{ data: row.data }];
      }
      if (query.startsWith("DELETE FROM docs WHERE path = ANY")) {
        for (const p of vals[0] || []) store.delete(p);
        return [];
      }
      if (query.includes("SELECT data->>'chave' AS chave")) {
        const parent = vals[0];
        const out = [];
        for (const row of store.values()) {
          if (row.parent === parent && !row.deleted) {
            out.push({ chave: row.data.chave, enviado_em: row.data.enviadoEm || row.updated_at });
          }
        }
        return out;
      }
      throw new Error("Query não simulada no teste: " + query);
    },
  };
}

test("ehChaveBanco e blobDocId identificam chaves de contingência no banco de forma determinística", () => {
  const kDb = "pecas/pablo.da/db-20261123-abcdef123456/CAPA.png";
  const kBlob = "pecas/pablo.da/20261123-abcdef123456/CAPA.png";
  assert.equal(ehChaveBanco(kDb), true);
  assert.equal(ehChaveBanco(kBlob), false);
  assert.equal(ehChaveBanco(""), false);

  const id1 = blobDocId(kDb);
  const id2 = blobDocId(kDb);
  assert.equal(id1, id2);
  assert.equal(id1.length, 40);
  assert.match(id1, /^[a-f0-9]{40}$/);
});

test("CRUD completo de blobs de contingência em docs (guardar, info, ler, enviar HTTP, listar e apagar)", async () => {
  const { sql, store } = criarSqlMock();
  const chave = "pecas/pablo.da/db-20261123-112233445566/CAPA.jpg";
  const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

  const salvo = await guardarBlobNoBanco(
    { chave, buf, nome: "CAPA.jpg", tipo: "image/jpeg", emIso: "2026-11-23T15:00:00.000Z" },
    sql
  );
  assert.equal(salvo.chave, chave);
  assert.equal(salvo.tamanho, buf.length);
  assert.equal(salvo.tipo, "image/jpeg");
  assert.equal(salvo.path.startsWith(`${BLOBS_DB_PARENT}/`), true);
  assert.equal(store.size, 1);

  const info = await infoBlobNoBanco(chave, sql);
  assert.deepEqual(info, { tamanho: buf.length, tipo: "image/jpeg" });
  assert.equal(await infoBlobNoBanco("pecas/inexistente", sql), null);

  const lido = await lerBlobDoBanco(chave, sql);
  assert.equal(lido.tipo, "image/jpeg");
  assert.equal(lido.nome, "CAPA.jpg");
  assert.deepEqual(lido.buf, buf);

  // Simula entrega HTTP via enviarBlobDoBanco
  const headers = {};
  let endedBody = null;
  const resMock = {
    statusCode: 0,
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    end(b) { endedBody = b; return this; },
    status(s) { this.statusCode = s; return { json: obj => ({ status: s, obj }) }; },
  };
  await enviarBlobDoBanco(resMock, chave, "CAPA.jpg", true, sql);
  assert.equal(resMock.statusCode, 200);
  assert.equal(headers["content-type"], "image/jpeg");
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.match(headers["content-disposition"], /^inline; filename="CAPA\.jpg"$/);
  assert.deepEqual(endedBody, buf);

  const naoEncontrado = await enviarBlobDoBanco(resMock, "pecas/outra", "x.jpg", true, sql);
  assert.equal(naoEncontrado.status, 404);

  const listados = await listarBlobsDoBanco(sql);
  assert.deepEqual(listados, [{ chave, enviadoEm: "2026-11-23T15:00:00.000Z" }]);

  await apagarBlobsDoBanco([chave], sql);
  assert.equal(store.size, 0);
  assert.equal(await lerBlobDoBanco(chave, sql), null);
});
