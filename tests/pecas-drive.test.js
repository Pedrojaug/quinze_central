import test from "node:test";
import assert from "node:assert/strict";
import {
  extrairDriveFileId,
  classificarTipoDrive,
  extrairMetadadosHtmlDrive,
  inspecionarDriveId,
  inspecionarLinksDrive,
  baixarImagemDrive,
  limparCacheDriveMeta,
} from "../api/_pecas_drive.js";

test("extrairDriveFileId reconhece /file/d, /preview, ?id= e rejeita pastas e URLs inválidas", () => {
  assert.equal(
    extrairDriveFileId("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr_99/view?usp=sharing"),
    "1AbCdEfGhIjKlMnOpQr_99"
  );
  assert.equal(
    extrairDriveFileId("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr_99/preview"),
    "1AbCdEfGhIjKlMnOpQr_99"
  );
  assert.equal(
    extrairDriveFileId("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQr_99"),
    "1AbCdEfGhIjKlMnOpQr_99"
  );
  assert.equal(
    extrairDriveFileId("https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQr_99"),
    "1AbCdEfGhIjKlMnOpQr_99"
  );
  assert.equal(
    extrairDriveFileId("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQr_99"),
    ""
  );
  assert.equal(
    extrairDriveFileId("https://drive.google.com/drive/u/0/folders/1AbCdEfGhIjKlMnOpQr_99?id=1AbCdEfGhIjKlMnOpQr_99"),
    ""
  );
  assert.equal(extrairDriveFileId("https://exemplo.com/file/d/1AbCdEfGhIjKlMnOpQr_99/view"), "");
  assert.equal(extrairDriveFileId("nao-e-url"), "");
  assert.equal(extrairDriveFileId(""), "");
});

test("classificarTipoDrive identifica MIME types, extensões (com ou sem sufixo Google Drive), ogType e fallback", () => {
  assert.equal(classificarTipoDrive({ mimeType: "image/jpeg" }), "imagem");
  assert.equal(classificarTipoDrive({ mimeType: "IMAGE/PNG; charset=binary" }), "imagem");
  assert.equal(classificarTipoDrive({ mimeType: "video/mp4" }), "video");
  assert.equal(classificarTipoDrive({ mimeType: "application/pdf" }), "pdf");

  assert.equal(classificarTipoDrive({ nome: "post-combinacao-ideal.jpg - Google Drive" }), "imagem");
  assert.equal(classificarTipoDrive({ nome: "banner_stories.WEBP" }), "imagem");
  assert.equal(classificarTipoDrive({ nome: "reels-lancamento.mp4 - Google Drive" }), "video");
  assert.equal(classificarTipoDrive({ nome: "aprovacao-catalogo.pdf – Google Drive" }), "pdf");

  assert.equal(classificarTipoDrive({ ogType: "video.other" }), "video");
  assert.equal(classificarTipoDrive({ nome: "arte-sem-extensao", mimeType: "application/octet-stream" }), "desconhecido");
});

test("extrairMetadadosHtmlDrive lê og:title/og:type em qualquer ordem, decodifica entidades e detecta login", () => {
  const html1 = `<html><head>
    <meta property="og:title" content="Campanha &amp; Ver&#227;o.png - Google Drive">
    <meta content="image" name="og:type">
    <title>Ignorar</title>
  </head></html>`;
  assert.deepEqual(extrairMetadadosHtmlDrive(html1), {
    privado: false,
    nome: "Campanha & Verão.png",
    ogType: "image",
  });

  const html2 = `<html><head>
    <meta content="video.other" property="og:type">
    <meta content="Reels_Final.mp4" property="og:title">
  </head></html>`;
  assert.deepEqual(extrairMetadadosHtmlDrive(html2), {
    privado: false,
    nome: "Reels_Final.mp4",
    ogType: "video.other",
  });

  const htmlLogin = `<html><head><title>Fazer login no Google Drive</title></head><body>accounts.google.com/ServiceLogin</body></html>`;
  assert.deepEqual(extrairMetadadosHtmlDrive(htmlLogin), {
    privado: true,
    nome: "",
    ogType: "",
  });

  const htmlRestrito = `<html><head><title>Google Drive</title></head><body>Você precisa de acesso</body></html>`;
  assert.deepEqual(extrairMetadadosHtmlDrive(htmlRestrito), {
    privado: true,
    nome: "",
    ogType: "",
  });
});

test("inspecionarDriveId resolve via Drive API, HTML /view, fallback uc?export=download, bloqueia SSRF e usa cache", async () => {
  limparCacheDriveMeta();

  // 1. Hit via Drive API + reuso do cache em memória
  let chamadasApi = 0;
  let chamadasFetch = 0;
  const fidApi = "1ApiHitFileId_123456";
  const r1 = await inspecionarDriveId(fidApi, {
    driveApiImpl: async () => {
      chamadasApi++;
      return { id: fidApi, nome: "card-feed.png", mimeType: "image/png" };
    },
    fetchImpl: async () => {
      chamadasFetch++;
      throw new Error("não deveria chamar fetch");
    },
  });
  assert.equal(r1.tipo, "imagem");
  assert.equal(r1.nome, "card-feed.png");
  assert.equal(chamadasApi, 1);
  assert.equal(chamadasFetch, 0);

  const r1Cache = await inspecionarDriveId(fidApi, {
    driveApiImpl: async () => {
      chamadasApi++;
      return null;
    },
  });
  assert.equal(r1Cache.tipo, "imagem");
  assert.equal(chamadasApi, 1);

  // 2. Hit via HTML og:title
  const fidHtml = "1HtmlHitFileId_12345";
  const r2 = await inspecionarDriveId(fidHtml, {
    semCache: true,
    fetchImpl: async url => {
      assert.ok(url.includes(`/file/d/${fidHtml}/view`));
      return new Response(
        `<html><head><meta property="og:title" content="combinacao_ideal.jpg - Google Drive"></head><body></body></html>`,
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
      );
    },
  });
  assert.equal(r2.tipo, "imagem");
  assert.equal(r2.nome, "combinacao_ideal.jpg");

  // 3. Fallback via uc?export=download com content-type e content-disposition
  const fidDl = "1DownloadHitFile_12345";
  const r3 = await inspecionarDriveId(fidDl, {
    semCache: true,
    fetchImpl: async url => {
      if (url.includes("/view")) {
        return new Response(`<html><head><title>Google Drive</title></head></html>`, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.includes("export=download")) {
        return new Response("fake-binary", {
          status: 200,
          headers: {
            "content-type": "image/webp",
            "content-disposition": `attachment; filename="arte-story.webp"`,
          },
        });
      }
      throw new Error("URL inesperada: " + url);
    },
  });
  assert.equal(r3.tipo, "imagem");
  assert.equal(r3.nome, "arte-story.webp");
  assert.equal(r3.mimeType, "image/webp");

  // 4. Bloqueio SSRF: redirect para host fora de Google Drive é recusado
  const fidSsrf = "1SsrfRedirectId_12345";
  let visitouHostExterno = false;
  const r4 = await inspecionarDriveId(fidSsrf, {
    semCache: true,
    fetchImpl: async url => {
      if (url.includes("169.254.169.254") || url.includes("evil.example")) {
        visitouHostExterno = true;
        return new Response("secret", { status: 200 });
      }
      return new Response("", {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      });
    },
  });
  assert.equal(visitouHostExterno, false);
  assert.equal(r4.tipo, "desconhecido");
});

test("inspecionarLinksDrive deduplica, preserva metadados conhecidos e trata erros de rede", async () => {
  limparCacheDriveMeta();
  const fidConhecido = "1KnownImageId_123456";
  const fidNovo = "1NewVideoId_12345678";
  const fidErro = "1NetworkErrId_123456";

  const links = [
    `https://drive.google.com/file/d/${fidConhecido}/view`,
    `https://drive.google.com/file/d/${fidConhecido}/preview`, // duplicado
    `https://drive.google.com/file/d/${fidNovo}/view`,
    `https://drive.google.com/open?id=${fidErro}`,
    "https://drive.google.com/drive/folders/1FolderIgnorada12345",
  ];

  const consultados = [];
  const meta = await inspecionarLinksDrive(
    links,
    { [fidConhecido]: { tipo: "imagem", nome: "ja-salva.png", mimeType: "image/png" } },
    {
      semCache: true,
      fetchImpl: async url => {
        consultados.push(url);
        if (url.includes(fidErro)) throw new Error("ECONNRESET");
        if (url.includes(fidNovo) && url.includes("/view")) {
          return new Response(
            `<html><head><meta property="og:title" content="reels-01.mp4 - Google Drive"><meta property="og:type" content="video.other"></head></html>`,
            { status: 200 }
          );
        }
        return new Response("", { status: 404 });
      },
    }
  );

  assert.equal(consultados.some(u => u.includes(fidConhecido)), false);
  assert.deepEqual(meta[fidConhecido], { tipo: "imagem", nome: "ja-salva.png", mimeType: "image/png" });
  assert.equal(meta[fidNovo].tipo, "video");
  assert.equal(meta[fidNovo].nome, "reels-01.mp4");
  assert.equal(meta[fidErro].tipo, "desconhecido");
});

test("baixarImagemDrive obtém imagem via API ou thumbnail público e recusa não-imagem ou arquivo acima do limite", async () => {
  const fidApi = "1ImgApiDownload_12345";
  const imgBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const resApi = await baixarImagemDrive(fidApi, 1024, {
    lerDriveImpl: async () => ({ nome: "peca.png", tipo: "image/png", buf: imgBuf }),
    fetchImpl: async () => {
      throw new Error("não deveria usar fetch");
    },
  });
  assert.equal(resApi.tipo, "image/png");
  assert.equal(resApi.nome, "peca.png");
  assert.deepEqual(resApi.buf, imgBuf);

  // Fallback via thumbnail público (com redirect permitido em *.googleusercontent.com)
  const fidThumb = "1ImgThumbFallbk_12345";
  const jpgBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const resThumb = await baixarImagemDrive(fidThumb, 1024, {
    fetchImpl: async url => {
      if (url.startsWith("https://drive.google.com/thumbnail")) {
        return new Response("", {
          status: 302,
          headers: { location: "https://lh3.googleusercontent.com/d/1ImgThumbFallbk_12345=w2400" },
        });
      }
      return new Response(jpgBuf, {
        status: 200,
        headers: { "content-type": "image/jpeg", "content-disposition": `inline; filename="arte.jpg"` },
      });
    },
  });
  assert.equal(resThumb.tipo, "image/jpeg");
  assert.equal(resThumb.nome, "arte.jpg");
  assert.deepEqual(resThumb.buf, jpgBuf);

  // Recusa content-type não-imagem
  const resHtml = await baixarImagemDrive(fidThumb, 1024, {
    fetchImpl: async () => new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } }),
  });
  assert.equal(resHtml, null);

  // Recusa acima de maxBytes
  const resGrande = await baixarImagemDrive(fidThumb, 10, {
    fetchImpl: async () =>
      new Response(Buffer.alloc(32, 1), {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "32" },
      }),
  });
  assert.equal(resGrande, null);
});
