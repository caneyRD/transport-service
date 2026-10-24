














CREATE DATABASE IF NOT EXISTS baney_billing
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE baney_billing;







CREATE TABLE tasa_impuesto (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo         VARCHAR(20)  NOT NULL ,
  nombre         VARCHAR(80)  NOT NULL,
  tasa           DECIMAL(5,4) NOT NULL ,
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





















CREATE TABLE ncf_secuencia (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  emisor_rnc         VARCHAR(11)  NOT NULL,
  tipo_ecf           ENUM('B01','B02','B04','B11','B14','B15','B16','B17',
                          'E31','E32','E34','E41','E43','E44','E45','E46','E47') NOT NULL
                     ,
  serie              CHAR(1)      NOT NULL DEFAULT 'B',
  desde              BIGINT UNSIGNED NOT NULL,
  hasta              BIGINT UNSIGNED NOT NULL,
  actual             BIGINT UNSIGNED NOT NULL,
  fecha_autorizacion DATE         NOT NULL,
  fecha_vencimiento  DATE         NOT NULL,
  activa             TINYINT(1)   NOT NULL DEFAULT 1,
  umbral_alerta      INT UNSIGNED NOT NULL DEFAULT 100 ,
  creado_en          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_ncf_rango (emisor_rnc, tipo_ecf, desde),
  KEY ix_ncf_disponible (emisor_rnc, tipo_ecf, activa, fecha_vencimiento),
  CONSTRAINT ck_ncf_rango  CHECK (hasta >= desde),
  CONSTRAINT ck_ncf_actual CHECK (actual >= desde - 1 AND actual <= hasta)
) ENGINE=InnoDB;












CREATE TABLE factura (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid                CHAR(26)     NOT NULL,
  numero_interno     VARCHAR(24)  NOT NULL ,
  tipo_documento     ENUM('factura','nota_credito','nota_debito') NOT NULL DEFAULT 'factura',
  factura_origen_id  BIGINT UNSIGNED NULL ,
  
  emisor_tipo        ENUM('plataforma','vendedor','transportista') NOT NULL,
  emisor_uid         CHAR(26)     NULL ,
  emisor_rnc         VARCHAR(11)  NOT NULL,
  emisor_nombre      VARCHAR(200) NOT NULL,
  
  receptor_uid       CHAR(26)     NULL,
  receptor_rnc       VARCHAR(11)  NULL ,
  receptor_nombre    VARCHAR(200) NOT NULL,
  receptor_direccion VARCHAR(300) NULL,
  receptor_email     VARCHAR(190) NULL,
  
  ncf                VARCHAR(19)  NULL ,
  ncf_secuencia_id   INT UNSIGNED NULL,
  ncf_vencimiento    DATE         NULL,
  tipo_ecf           VARCHAR(3)   NULL,
  
  moneda             CHAR(3)      NOT NULL DEFAULT 'DOP',
  tasa_cambio        DECIMAL(12,6) NOT NULL DEFAULT 1.000000,
  subtotal           DECIMAL(14,2) NOT NULL DEFAULT 0,
  descuento          DECIMAL(14,2) NOT NULL DEFAULT 0,
  monto_exento       DECIMAL(14,2) NOT NULL DEFAULT 0,
  base_imponible     DECIMAL(14,2) NOT NULL DEFAULT 0,
  itbis              DECIMAL(14,2) NOT NULL DEFAULT 0,
  propina_legal      DECIMAL(14,2) NOT NULL DEFAULT 0,
  total              DECIMAL(14,2) NOT NULL DEFAULT 0,
  
  referencia_tipo    ENUM('pedido','suborden','viaje','comision','liquidacion','manual') NOT NULL,
  referencia_uid     CHAR(26)     NULL,
  
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
  UNIQUE KEY uq_factura_ncf    (emisor_rnc, ncf) ,
  UNIQUE KEY uq_factura_referencia (referencia_tipo, referencia_uid, tipo_documento)
    ,
  KEY ix_factura_emisor   (emisor_uid, fecha_emision),
  KEY ix_factura_receptor (receptor_uid, fecha_emision),
  KEY ix_factura_estado   (estado, creado_en),
  KEY ix_factura_periodo  (fecha_emision) ,
  CONSTRAINT fk_factura_origen    FOREIGN KEY (factura_origen_id) REFERENCES factura (id)       ON DELETE RESTRICT,
  CONSTRAINT fk_factura_secuencia FOREIGN KEY (ncf_secuencia_id)  REFERENCES ncf_secuencia (id) ON DELETE RESTRICT,
  CONSTRAINT ck_factura_nota CHECK (tipo_documento = 'factura' OR factura_origen_id IS NOT NULL),
  CONSTRAINT ck_factura_total CHECK (total >= 0)
) ENGINE=InnoDB;

CREATE TABLE factura_linea (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  factura_id      BIGINT UNSIGNED NOT NULL,
  linea           SMALLINT UNSIGNED NOT NULL,
  codigo          VARCHAR(64)  NULL ,
  descripcion     VARCHAR(300) NOT NULL,
  unidad_medida   VARCHAR(20)  NOT NULL DEFAULT 'unidad',
  cantidad        DECIMAL(14,3) NOT NULL,
  precio_unitario DECIMAL(14,4) NOT NULL,
  descuento       DECIMAL(14,2) NOT NULL DEFAULT 0,
  regimen_itbis   ENUM('exento','gravado','tasa_cero') NOT NULL,
  tasa_itbis      DECIMAL(5,4) NOT NULL DEFAULT 0.0000 ,
  monto_itbis     DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_linea     DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_linea (factura_id, linea),
  CONSTRAINT fk_linea_factura FOREIGN KEY (factura_id)
    REFERENCES factura (id) ON DELETE CASCADE,
  CONSTRAINT ck_linea_cantidad CHECK (cantidad > 0)
) ENGINE=InnoDB;






CREATE TABLE regla_comision (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid              CHAR(26)     NOT NULL,
  nombre           VARCHAR(120) NOT NULL,
  ambito           ENUM('global','categoria','vendedor','tipo_vehiculo','transportista') NOT NULL,
  ambito_ref       VARCHAR(64)  NULL ,
  aplica_a         ENUM('mercado','transporte') NOT NULL,
  tipo             ENUM('porcentaje','fijo','mixto') NOT NULL,
  porcentaje       DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
  monto_fijo       DECIMAL(14,2) NOT NULL DEFAULT 0,
  minimo           DECIMAL(14,2) NULL,
  maximo           DECIMAL(14,2) NULL,
  prioridad        SMALLINT     NOT NULL DEFAULT 100 ,
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
  base_calculo     DECIMAL(14,2) NOT NULL ,
  porcentaje_aplicado DECIMAL(5,4) NOT NULL,
  monto            DECIMAL(14,2) NOT NULL,
  itbis_comision   DECIMAL(14,2) NOT NULL DEFAULT 0 ,
  total            DECIMAL(14,2) NOT NULL,
  factura_id       BIGINT UNSIGNED NULL ,
  liquidacion_id   BIGINT UNSIGNED NULL,
  estado           ENUM('calculada','facturada','liquidada','anulada') NOT NULL DEFAULT 'calculada',
  creado_en        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_comision_uid (uid),
  UNIQUE KEY uq_comision_referencia (referencia_tipo, referencia_uid)
    ,
  KEY ix_comision_obligado (obligado_uid, estado, creado_en),
  KEY ix_comision_liquidacion (liquidacion_id),
  CONSTRAINT fk_comision_regla   FOREIGN KEY (regla_id)   REFERENCES regla_comision (id) ON DELETE RESTRICT,
  CONSTRAINT fk_comision_factura FOREIGN KEY (factura_id) REFERENCES factura (id)        ON DELETE SET NULL
) ENGINE=InnoDB;







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
  ajustes           DECIMAL(14,2) NOT NULL DEFAULT 0 ,
  neto              DECIMAL(14,2) NOT NULL DEFAULT 0,
  estado            ENUM('abierta','cerrada','pagada','anulada') NOT NULL DEFAULT 'abierta',
  payout_uid        CHAR(26)     NULL ,
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
  monto            DECIMAL(14,2) NOT NULL ,
  fecha_operacion  DATE         NOT NULL,
  PRIMARY KEY (id),
  KEY ix_liq_linea (liquidacion_id, concepto),
  KEY ix_liq_linea_ref (referencia_tipo, referencia_uid),
  CONSTRAINT fk_liq_linea FOREIGN KEY (liquidacion_id)
    REFERENCES liquidacion (id) ON DELETE CASCADE
) ENGINE=InnoDB;


CREATE TABLE retencion (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  liquidacion_id BIGINT UNSIGNED NOT NULL,
  tipo           ENUM('itbis_retenido','isr','otro') NOT NULL,
  base           DECIMAL(14,2) NOT NULL,
  tasa           DECIMAL(5,4) NOT NULL,
  monto          DECIMAL(14,2) NOT NULL,
  norma          VARCHAR(120) NULL ,
  creado_en      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_retencion_liq (liquidacion_id),
  CONSTRAINT fk_retencion_liq FOREIGN KEY (liquidacion_id)
    REFERENCES liquidacion (id) ON DELETE CASCADE
) ENGINE=InnoDB;




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
  diferencia_caja   DECIMAL(16,2) NOT NULL DEFAULT 0 ,
  estado            ENUM('abierto','en_revision','cerrado','reabierto') NOT NULL DEFAULT 'abierto',
  cerrado_por_uid   CHAR(26)     NULL,
  cerrado_en        DATETIME(3)  NULL,
  notas             TEXT         NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cierre_uid    (uid),
  UNIQUE KEY uq_cierre_periodo (periodo_anio, periodo_mes),
  CONSTRAINT ck_cierre_mes CHECK (periodo_mes BETWEEN 1 AND 12)
) ENGINE=InnoDB;




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
