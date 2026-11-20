-- Additive support for the deployed APIs; the supplied baseline is unchanged.
-- Apply once, as baney_owner, after baseline 001. Never run legacy migrations here.
BEGIN;
SET LOCAL search_path TO baney, public;
ALTER TABLE disputa ADD COLUMN referencia_reembolso text;
COMMENT ON COLUMN disputa.referencia_reembolso IS
  'External payment-provider refund reference; distinct from the internal reembolso_id UUID.';
ALTER TABLE solicitud_transporte ADD COLUMN asignacion_activa_id uuid REFERENCES asignacion(id);
ALTER TABLE oferta_transporte ADD COLUMN version_fila integer NOT NULL DEFAULT 1 CHECK (version_fila > 0);
ALTER TABLE oferta_transporte ADD COLUMN agregado_version integer NOT NULL DEFAULT 0 CHECK (agregado_version >= 0);
ALTER TABLE oferta_transporte ADD COLUMN reemplazada_por_contraoferta boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN oferta_transporte.reemplazada_por_contraoferta IS
  'The API COUNTERED state retires the original offer; the replacement references it through oferta_padre_id.';
ALTER TABLE carga ADD COLUMN eliminado_en timestamptz;
ALTER TABLE asignacion ADD COLUMN eliminado_en timestamptz;
ALTER TABLE viaje ADD COLUMN eliminado_en timestamptz;
ALTER TABLE punto_rastreo ADD COLUMN origen_actor text;
CREATE UNIQUE INDEX uq_punto_rastreo_actor_id ON punto_rastreo(origen_actor, punto_origen_id);
CREATE TABLE disponibilidad_transportista (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_transportista_id uuid NOT NULL REFERENCES perfil_transportista(id),
  vehiculo_id uuid REFERENCES vehiculo(id),
  desde timestamptz NOT NULL,
  hasta timestamptz NOT NULL,
  estado text NOT NULL CHECK (estado IN ('disponible', 'no_disponible')),
  CHECK (desde < hasta)
);
CREATE INDEX ix_disponibilidad_transportista_perfil ON disponibilidad_transportista(perfil_transportista_id, desde, hasta);
COMMENT ON TABLE disponibilidad_transportista IS '[transporte] Ventanas de disponibilidad del API de transporte.';
INSERT INTO version_esquema(version,descripcion) VALUES ('002','Soporte aditivo de APIs: concurrencia, disponibilidad y referencias externas');
COMMIT;
