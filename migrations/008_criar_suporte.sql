-- Tabela de chamados de suporte interno da Central Quinze (/suporte e /dev)

CREATE TABLE IF NOT EXISTS suporte_chamados (
  id SERIAL PRIMARY KEY,
  usuario_login TEXT NOT NULL,
  usuario_nome TEXT NOT NULL,
  usuario_funcao TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL,
  area TEXT NOT NULL,
  urgente BOOLEAN NOT NULL DEFAULT false,
  descricao TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enviado',
  resposta_usuario TEXT NOT NULL DEFAULT '',
  reaberturas_count INTEGER NOT NULL DEFAULT 0,
  historico_reaberturas JSONB NOT NULL DEFAULT '[]'::jsonb,
  anexos JSONB NOT NULL DEFAULT '[]'::jsonb,
  origem_url TEXT NOT NULL DEFAULT '',
  meta_tecnica JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  iniciado_em TIMESTAMPTZ,
  finalizado_em TIMESTAMPTZ,
  reaberto_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_suporte_chamados_fila
  ON suporte_chamados (status, urgente DESC, reaberturas_count DESC, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_suporte_chamados_usuario
  ON suporte_chamados (usuario_login, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_suporte_chamados_area
  ON suporte_chamados (area);
