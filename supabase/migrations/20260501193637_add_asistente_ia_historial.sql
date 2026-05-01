CREATE TABLE IF NOT EXISTS asistente_ia_conversaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asistente_ia_conversaciones_usuario_actualizado
  ON asistente_ia_conversaciones (usuario_id, actualizado_en DESC);

CREATE TABLE IF NOT EXISTS asistente_ia_mensajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id UUID NOT NULL REFERENCES asistente_ia_conversaciones(id) ON DELETE CASCADE,
  rol TEXT NOT NULL CHECK (rol IN ('user', 'assistant')),
  contenido TEXT NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asistente_ia_mensajes_conversacion_creado
  ON asistente_ia_mensajes (conversacion_id, creado_en ASC);

ALTER TABLE asistente_ia_conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistente_ia_mensajes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asistente_ia_conversaciones_select_own ON asistente_ia_conversaciones;
CREATE POLICY asistente_ia_conversaciones_select_own
  ON asistente_ia_conversaciones
  FOR SELECT
  USING (
    usuario_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM perfiles
      WHERE perfiles.id = auth.uid()
        AND perfiles.rol IN ('admin', 'caja')
    )
  );

DROP POLICY IF EXISTS asistente_ia_conversaciones_insert_own ON asistente_ia_conversaciones;
CREATE POLICY asistente_ia_conversaciones_insert_own
  ON asistente_ia_conversaciones
  FOR INSERT
  WITH CHECK (
    usuario_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM perfiles
      WHERE perfiles.id = auth.uid()
        AND perfiles.rol IN ('admin', 'caja')
    )
  );

DROP POLICY IF EXISTS asistente_ia_conversaciones_update_own ON asistente_ia_conversaciones;
CREATE POLICY asistente_ia_conversaciones_update_own
  ON asistente_ia_conversaciones
  FOR UPDATE
  USING (
    usuario_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM perfiles
      WHERE perfiles.id = auth.uid()
        AND perfiles.rol IN ('admin', 'caja')
    )
  )
  WITH CHECK (
    usuario_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM perfiles
      WHERE perfiles.id = auth.uid()
        AND perfiles.rol IN ('admin', 'caja')
    )
  );

DROP POLICY IF EXISTS asistente_ia_conversaciones_delete_own ON asistente_ia_conversaciones;
CREATE POLICY asistente_ia_conversaciones_delete_own
  ON asistente_ia_conversaciones
  FOR DELETE
  USING (
    usuario_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM perfiles
      WHERE perfiles.id = auth.uid()
        AND perfiles.rol IN ('admin', 'caja')
    )
  );

DROP POLICY IF EXISTS asistente_ia_mensajes_select_own ON asistente_ia_mensajes;
CREATE POLICY asistente_ia_mensajes_select_own
  ON asistente_ia_mensajes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM asistente_ia_conversaciones c
      JOIN perfiles p ON p.id = auth.uid()
      WHERE c.id = asistente_ia_mensajes.conversacion_id
        AND c.usuario_id = auth.uid()
        AND p.rol IN ('admin', 'caja')
    )
  );

DROP POLICY IF EXISTS asistente_ia_mensajes_insert_own ON asistente_ia_mensajes;
CREATE POLICY asistente_ia_mensajes_insert_own
  ON asistente_ia_mensajes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM asistente_ia_conversaciones c
      JOIN perfiles p ON p.id = auth.uid()
      WHERE c.id = asistente_ia_mensajes.conversacion_id
        AND c.usuario_id = auth.uid()
        AND p.rol IN ('admin', 'caja')
    )
  );

DROP POLICY IF EXISTS asistente_ia_mensajes_delete_own ON asistente_ia_mensajes;
CREATE POLICY asistente_ia_mensajes_delete_own
  ON asistente_ia_mensajes
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM asistente_ia_conversaciones c
      JOIN perfiles p ON p.id = auth.uid()
      WHERE c.id = asistente_ia_mensajes.conversacion_id
        AND c.usuario_id = auth.uid()
        AND p.rol IN ('admin', 'caja')
    )
  );
