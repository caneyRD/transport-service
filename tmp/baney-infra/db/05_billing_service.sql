-- =====================================================================
--  BANEY RD · billing-service
--  Módulo: Billing Service (Fase 2) · Backend owner: Triana García
--  UC: BILL-01 (crear factura), BILL-02 (comisión plataforma),
--      BILL-03 (impuestos), BILL-04 (payout vendedor),
--      BILL-05 (payout transportista), BILL-06 (reconciliación),
--      BILL-07 (NCF), BILL-08 (histórico)
--  Integra con: DGII API, Azul/CardNet
-- =====================================================================
--  LO QUE HACE ESTE SERVICIO DISTINTO A TODOS LOS DEMÁS
--  Aquí nada se edita ni se borra. Una factura emitida es un documento
--  fiscal: si está mal, se anula o se emite una nota de crédito, nunca
--  se corrige en sitio. La DGII puede auditar hasta 3 años atrás.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS baney_billing
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE baney_billing;

-- ---------------------------------------------------------------------
-- UC-BILL-03 · Tasas de impuesto, con vigencia.
-- El ITBIS es 18% hoy, pero una factura de 2027 debe reimprimirse con
-- la tasa de 2027 aunque en 2029 sea otra. Por eso la tasa se guarda
-- también en cada línea de factura, no solo aquí.
-- ---------------------------------------------------------------------
CREATE TABLE tasa_impuesto (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo         VARCHAR(20)  NOT NULL COMMENT 'ITBIS_18, ITBIS_16, EXENTO, TASA_CERO',
  nombre         VARCHAR(80)  NOT NULL,
  tasa           DECIMAL(5,4) NOT NULL COMMENT '0.1800 = 18%',
  vigente_desde  DATE         NOT NULL,
  vigente_hasta  DATE         NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tasa_codigo_vigencia (codigo, vigente_desde),
  CONSTRAINT ck_tasa_rango CHECK (tasa >= 0 AND tasa <= 1)
) ENGINE=InnoDB;

INSERT INTO tasa_impuesto (codigo, nombre, tasa, vigente_desde) VALUES
  ('ITBIS_18', 'ITBIS tasa general',            0.1800, '2026-01-01'),
  ('EXENTO',   'Exento de ITBIS (agropecuario)', 0.0000, '2026-01-01'),
  ('TASA_CERO','Tasa cero (exportación)',        0.0000, '2026-01-01');

-- ---------------------------------------------------------------------
-- UC-BILL-07 · SECUENCIAS NCF / e-CF
--
-- La DGII asigna rangos numerados con vencimiento. Esta tabla es el
-- punto más delicado de todo el esquema: dos facturas no pueden
-- llevar el mismo NCF, ni puede haber huecos.
--
-- Cómo consumir uno, dentro de la transacción que emite la factura:
--
--   UPDATE ncf_secuencia
--      SET actual = actual + 1
--    WHERE id = :id
--      AND actual < hasta
--      AND activa = 1
--      AND fecha_vencimiento >= CURDATE();
--   -- si affected_rows = 0 → rango agotado o vencido, abortar
--   SELECT actual FROM ncf_secuencia WHERE id = :id;
--
-- Un UPDATE condicional, no SELECT-luego-UPDATE.
-- ---------------------------------------------------------------------
CREATE TABLE ncf_secuencia (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  emisor_rnc         VARCHAR(11)  NOT NULL,
  tipo_ecf           ENUM('B01','B02','B04','B11','B14','B15','B16','B17',
                          'E31','E32','E34','E41','E43','E44','E45','E46','E47') NOT NULL
                     COMMENT 'B01 crédito fiscal · B02 consumo · B04 nota de crédito · E31/E32 e-CF',
  serie              CHAR(1)      NOT NULL DEFAULT 'B',
  desde              BIGINT UNSIGNED NOT NULL,
  hasta              BIGINT UNSIGNED NOT NULL,
  actual             BIGINT UNSIGNED NOT NULL,
  fecha_autorizacion DATE         NOT NULL,
  fecha_vencimiento  DATE         NOT NULL,
  activa             TINYINT(1)   NOT NULL DEFAULT 1,
  umbral_alerta      INT UNSIGNED NOT NULL DEFAULT 100 COMMENT 'avisar cuando queden menos',
  creado_en          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_ncf_rango (emisor_rnc, tipo_ecf, desde),
  KEY ix_ncf_disponible (emisor_rnc, tipo_ecf, activa, fecha_vencimiento),
  CONSTRAINT ck_ncf_rango  CHECK (hasta >= desde),
  CONSTRAINT ck_ncf_actual CHECK (actual >= desde - 1 AND actual <= hasta)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-BILL-01 · FACTURA / NOTA DE CRÉDITO / NOTA DE DÉBITO
--
-- Una sola tabla para los tres: comparten estructura, numeración y
-- envío a DGII. `factura_origen_id` encadena la nota con su factura.
--
-- `emisor_tipo`: en un marketplace hay dos facturaciones distintas.
--   - vendedor → comprador : por la mercancía
--   - plataforma → vendedor: por la comisión de BANEY
-- Confundirlas es el error contable clásico del e-commerce.
-- ---------------------------------------------------------------------
CREATE TABLE factura (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid                CHAR(26)     NOT NULL,
  numero_interno     VARCHAR(24)  NOT NULL COMMENT 'consecutivo propio, independiente del NCF',
  tipo_documento     ENUM('factura','nota_credito','nota_debito') NOT NULL DEFAULT 'factura',
  factura_origen_id  BIGINT UNSIGNED NULL COMMENT 'obligatorio en notas',
  -- emisor
  emisor_tipo        ENUM('plataforma','vendedor','transportista') NOT NULL,
  emisor_uid         CHAR(26)     NULL COMMENT 'NULL si emite la plataforma',
  emisor_rnc         VARCHAR(11)  NOT NULL,
  emisor_nombre      VARCHAR(200) NOT NULL,
  -- receptor
  receptor_uid       CHAR(26)     NULL,
  receptor_rnc       VARCHAR(11)  NULL COMMENT 'NULL = consumidor final (B02)',
  receptor_nombre    VARCHAR(200) NOT NULL,
  receptor_direccion VARCHAR(300) NULL,
  receptor_email     VARCHAR(190) NULL,
  -- fiscal
  ncf                VARCHAR(19)  NULL COMMENT 'se asigna al emitir, no al crear el borrador',
  ncf_secuencia_id   INT UNSIGNED NULL,
  ncf_vencimiento    DATE         NULL,
  tipo_ecf           VARCHAR(3)   NULL,
  -- montos
  moneda             CHAR(3)      NOT NULL DEFAULT 'DOP',
  tasa_cambio        DECIMAL(12,6) NOT NULL DEFAULT 1.000000,
  subtotal           DECIMAL(14,2) NOT NULL DEFAULT 0,
  descuento          DECIMAL(14,2) NOT NULL DEFAULT 0,
  monto_exento       DECIMAL(14,2) NOT NULL DEFAULT 0,
  base_imponible     DECIMAL(14,2) NOT NULL DEFAULT 0,
  itbis              DECIMAL(14,2) NOT NULL DEFAULT 0,
  propina_legal      DECIMAL(14,2) NOT NULL DEFAULT 0,
  total              DECIMAL(14,2) NOT NULL DEFAULT 0,
  -- trazabilidad al origen
  referencia_tipo    ENUM('pedido','suborden','viaje','comision','liquidacion','manual') NOT NULL,
  referencia_uid     CHAR(26)     NULL,
  -- estado y DGII
  estado             ENUM('borrador','emitida','enviada_dgii','aceptada_dgii',
                          'rechazada_dgii','anulada') NOT NULL DEFAULT 'borrador',
  dgii_track_id      VARCHAR(80)  NULL,
  dgii_codigo_seguridad VARCHAR(20) NULL,
  dgii_respuesta     JSON         NULL,
  dgii_enviada_en    DATETIME(3)  NULL,
  motivo_anulacion   VARCHAR(500) NULL,
  anulada_en         DATETIME(3)  NULL,
  xml_url            VARCHAR(500) NULL,
  pdf_url            VARCHAR(500) NULL,
  fecha_emision      DATETIME(3)  NULL,
  creado_en          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_factura_uid    (uid),
  UNIQUE KEY uq_factura_numero (numero_interno),
  UNIQUE KEY uq_factura_ncf    (emisor_rnc, ncf) COMMENT 'un NCF jamás se repite por emisor',
  UNIQUE KEY uq_factura_referencia (referencia_tipo, referencia_uid, tipo_documento)
    COMMENT 'no se factura dos veces la misma suborden',
  KEY ix_factura_emisor   (emisor_uid, fecha_emision),
  KEY ix_factura_receptor (receptor_uid, fecha_emision),
  KEY ix_factura_estado   (estado, creado_en),
  KEY ix_factura_periodo  (fecha_emision) COMMENT 'reporte 607/608 mensual',
  CONSTRAINT fk_factura_origen    FOREIGN KEY (factura_origen_id) REFERENCES factura (id)       ON DELETE RESTRICT,
  CONSTRAINT fk_factura_secuencia FOREIGN KEY (ncf_secuencia_id)  REFERENCES ncf_secuencia (id) ON DELETE RESTRICT,
  CONSTRAINT ck_factura_nota CHECK (tipo_documento = 'factura' OR factura_origen_id IS NOT NULL),
  CONSTRAINT ck_factura_total CHECK (total >= 0)
) ENGINE=InnoDB;

CREATE TABLE factura_linea (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  factura_id      BIGINT UNSIGNED NOT NULL,
  linea           SMALLINT UNSIGNED NOT NULL,
  codigo          VARCHAR(64)  NULL COMMENT 'SKU o código de servicio',
  descripcion     VARCHAR(300) NOT NULL,
  unidad_medida   VARCHAR(20)  NOT NULL DEFAULT 'unidad',
  cantidad        DECIMAL(14,3) NOT NULL,
  precio_unitario DECIMAL(14,4) NOT NULL,
  descuento       DECIMAL(14,2) NOT NULL DEFAULT 0,
  regimen_itbis   ENUM('exento','gravado','tasa_cero') NOT NULL,
  tasa_itbis      DECIMAL(5,4) NOT NULL DEFAULT 0.0000 COMMENT 'congelada: la de la fecha de emisión',
  monto_itbis     DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_linea     DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_linea (factura_id, linea),
  CONSTRAINT fk_linea_factura FOREIGN KEY (factura_id)
    REFERENCES factura (id) ON DELETE CASCADE,
  CONSTRAINT ck_linea_cantidad CHECK (cantidad > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-BILL-02 · Reglas de comisión (también UC-ADM-60, UC-TRA-42)
-- Versionadas por vigencia: una venta de marzo se liquida con la
-- comisión de marzo aunque en abril se haya cambiado.
-- ---------------------------------------------------------------------
CREATE TABLE regla_comision (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid              CHAR(26)     NOT NULL,
  nombre           VARCHAR(120) NOT NULL,
  ambito           ENUM('global','categoria','vendedor','tipo_vehiculo','transportista') NOT NULL,
  ambito_ref       VARCHAR(64)  NULL COMMENT 'id de categoría, uid de vendedor, etc.',
  aplica_a         ENUM('mercado','transporte') NOT NULL,
  tipo             ENUM('porcentaje','fijo','mixto') NOT NULL,
  porcentaje       DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
  monto_fijo       DECIMAL(14,2) NOT NULL DEFAULT 0,
  minimo           DECIMAL(14,2) NULL,
  maximo           DECIMAL(14,2) NULL,
  prioridad        SMALLINT     NOT NULL DEFAULT 100 COMMENT 'menor gana cuando varias aplican',
  vigente_desde    DATETIME(3)  NOT NULL,
  vigente_hasta    DATETIME(3)  NULL,
  creado_por_uid   CHAR(26)     NOT NULL,
  creado_en        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_regla_uid (uid),
  KEY ix_regla_resolucion (aplica_a, ambito, ambito_ref, vigente_desde, vigente_hasta, prioridad),
  CONSTRAINT ck_regla_pct CHECK (porcentaje >= 0 AND porcentaje <= 1)
) ENGINE=InnoDB;

CREATE TABLE comision (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid              CHAR(26)     NOT NULL,
  referencia_tipo  ENUM('suborden','viaje') NOT NULL,
  referencia_uid   CHAR(26)     NOT NULL,
  obligado_tipo    ENUM('vendedor','transportista') NOT NULL,
  obligado_uid     CHAR(26)     NOT NULL,
  regla_id         INT UNSIGNED NOT NULL,
  base_calculo     DECIMAL(14,2) NOT NULL COMMENT 'sobre qué se calculó',
  porcentaje_aplicado DECIMAL(5,4) NOT NULL,
  monto            DECIMAL(14,2) NOT NULL,
  itbis_comision   DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'la comisión SÍ grava ITBIS: es un servicio',
  total            DECIMAL(14,2) NOT NULL,
  factura_id       BIGINT UNSIGNED NULL COMMENT 'factura que BANEY emite al vendedor',
  liquidacion_id   BIGINT UNSIGNED NULL,
  estado           ENUM('calculada','facturada','liquidada','anulada') NOT NULL DEFAULT 'calculada',
  creado_en        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_comision_uid (uid),
  UNIQUE KEY uq_comision_referencia (referencia_tipo, referencia_uid)
    COMMENT 'una comisión por operación; el reintento no duplica',
  KEY ix_comision_obligado (obligado_uid, estado, creado_en),
  KEY ix_comision_liquidacion (liquidacion_id),
  CONSTRAINT fk_comision_regla   FOREIGN KEY (regla_id)   REFERENCES regla_comision (id) ON DELETE RESTRICT,
  CONSTRAINT fk_comision_factura FOREIGN KEY (factura_id) REFERENCES factura (id)        ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-BILL-04 (payout vendedor) · UC-BILL-05 (payout transportista)
-- La liquidación es el corte de un período: bruto − comisiones −
-- retenciones = neto a pagar. Se cierra y ya no cambia; lo que llegue
-- después entra en la siguiente.
-- ---------------------------------------------------------------------
CREATE TABLE liquidacion (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid               CHAR(26)     NOT NULL,
  numero            VARCHAR(24)  NOT NULL,
  beneficiario_tipo ENUM('vendedor','transportista') NOT NULL,
  beneficiario_uid  CHAR(26)     NOT NULL,
  beneficiario_rnc  VARCHAR(11)  NULL,
  periodo_desde     DATE         NOT NULL,
  periodo_hasta     DATE         NOT NULL,
  moneda            CHAR(3)      NOT NULL DEFAULT 'DOP',
  bruto             DECIMAL(14,2) NOT NULL DEFAULT 0,
  comisiones        DECIMAL(14,2) NOT NULL DEFAULT 0,
  retenciones       DECIMAL(14,2) NOT NULL DEFAULT 0,
  ajustes           DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'con signo',
  neto              DECIMAL(14,2) NOT NULL DEFAULT 0,
  estado            ENUM('abierta','cerrada','pagada','anulada') NOT NULL DEFAULT 'abierta',
  payout_uid        CHAR(26)     NULL COMMENT 'solicitud en caja-service',
  cerrada_en        DATETIME(3)  NULL,
  pagada_en         DATETIME(3)  NULL,
  creado_en         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_liquidacion_uid    (uid),
  UNIQUE KEY uq_liquidacion_numero (numero),
  UNIQUE KEY uq_liquidacion_periodo (beneficiario_tipo, beneficiario_uid, periodo_desde, periodo_hasta),
  KEY ix_liquidacion_estado (estado, periodo_hasta),
  CONSTRAINT ck_liquidacion_periodo CHECK (periodo_hasta >= periodo_desde)
) ENGINE=InnoDB;

CREATE TABLE liquidacion_linea (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  liquidacion_id   BIGINT UNSIGNED NOT NULL,
  concepto         ENUM('venta','flete','comision','retencion_itbis','retencion_isr',
                        'reembolso','penalidad','ajuste','propina') NOT NULL,
  referencia_tipo  ENUM('suborden','viaje','comision','devolucion','manual') NOT NULL,
  referencia_uid   CHAR(26)     NULL,
  descripcion      VARCHAR(300) NOT NULL,
  monto            DECIMAL(14,2) NOT NULL COMMENT 'con signo: + suma al neto, − resta',
  fecha_operacion  DATE         NOT NULL,
  PRIMARY KEY (id),
  KEY ix_liq_linea (liquidacion_id, concepto),
  KEY ix_liq_linea_ref (referencia_tipo, referencia_uid),
  CONSTRAINT fk_liq_linea FOREIGN KEY (liquidacion_id)
    REFERENCES liquidacion (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- UC-BILL-03 · Retenciones (RD: retención de ITBIS e ISR a proveedores)
CREATE TABLE retencion (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  liquidacion_id BIGINT UNSIGNED NOT NULL,
  tipo           ENUM('itbis_retenido','isr','otro') NOT NULL,
  base           DECIMAL(14,2) NOT NULL,
  tasa           DECIMAL(5,4) NOT NULL,
  monto          DECIMAL(14,2) NOT NULL,
  norma          VARCHAR(120) NULL COMMENT 'referencia a la norma DGII aplicada',
  creado_en      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_retencion_liq (liquidacion_id),
  CONSTRAINT fk_retencion_liq FOREIGN KEY (liquidacion_id)
    REFERENCES liquidacion (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-BILL-06 · Cierre contable del período
-- ---------------------------------------------------------------------
CREATE TABLE cierre_contable (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid               CHAR(26)     NOT NULL,
  periodo_anio      SMALLINT UNSIGNED NOT NULL,
  periodo_mes       TINYINT UNSIGNED NOT NULL,
  total_facturado   DECIMAL(16,2) NOT NULL DEFAULT 0,
  total_itbis       DECIMAL(16,2) NOT NULL DEFAULT 0,
  total_comisiones  DECIMAL(16,2) NOT NULL DEFAULT 0,
  total_liquidado   DECIMAL(16,2) NOT NULL DEFAULT 0,
  total_reembolsos  DECIMAL(16,2) NOT NULL DEFAULT 0,
  diferencia_caja   DECIMAL(16,2) NOT NULL DEFAULT 0 COMMENT 'vs. caja-service; 0 = cuadrado',
  estado            ENUM('abierto','en_revision','cerrado','reabierto') NOT NULL DEFAULT 'abierto',
  cerrado_por_uid   CHAR(26)     NULL,
  cerrado_en        DATETIME(3)  NULL,
  notas             TEXT         NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cierre_uid    (uid),
  UNIQUE KEY uq_cierre_periodo (periodo_anio, periodo_mes),
  CONSTRAINT ck_cierre_mes CHECK (periodo_mes BETWEEN 1 AND 12)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-BILL-08 · Histórico de envíos a la DGII (una fila por intento)
-- ---------------------------------------------------------------------
CREATE TABLE dgii_envio (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  factura_id    BIGINT UNSIGNED NOT NULL,
  intento       SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  endpoint      VARCHAR(200) NOT NULL,
  peticion      JSON         NULL,
  respuesta     JSON         NULL,
  codigo_http   SMALLINT UNSIGNED NULL,
  resultado     ENUM('aceptado','rechazado','error_red','pendiente') NOT NULL DEFAULT 'pendiente',
  mensaje_error VARCHAR(1000) NULL,
  creado_en     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_envio_intento (factura_id, intento),
  KEY ix_envio_resultado (resultado, creado_en),
  CONSTRAINT fk_envio_factura FOREIGN KEY (factura_id)
    REFERENCES factura (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE outbox (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid           CHAR(26)     NOT NULL,
  agregado_tipo VARCHAR(60)  NOT NULL,
  agregado_uid  CHAR(26)     NOT NULL,
  tipo_evento   VARCHAR(80)  NOT NULL,
  carga         JSON         NOT NULL,
  estado        ENUM('pendiente','publicado','fallido') NOT NULL DEFAULT 'pendiente',
  intentos      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ultimo_error  VARCHAR(500) NULL,
  creado_en     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  publicado_en  DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_outbox_uid (uid),
  KEY ix_outbox_pendiente (estado, creado_en)
) ENGINE=InnoDB;

CREATE TABLE inbox_procesado (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mensaje_uid   CHAR(26)     NOT NULL,
  tipo_evento   VARCHAR(80)  NOT NULL,
  procesado_en  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_inbox_mensaje (mensaje_uid)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Reporte 607 de la DGII (ventas del mes). Lo pide el contador.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_reporte_607 AS
SELECT
  DATE_FORMAT(f.fecha_emision, '%Y%m')  AS periodo,
  f.receptor_rnc                        AS rnc_cliente,
  f.ncf,
  f.tipo_ecf,
  DATE(f.fecha_emision)                 AS fecha_comprobante,
  f.monto_exento,
  f.base_imponible                      AS monto_facturado_gravado,
  f.itbis                               AS itbis_facturado,
  f.total
FROM factura f
WHERE f.tipo_documento = 'factura'
  AND f.estado IN ('emitida','enviada_dgii','aceptada_dgii')
  AND f.ncf IS NOT NULL;
