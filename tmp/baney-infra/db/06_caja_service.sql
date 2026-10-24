-- =====================================================================
--  BANEY RD · caja-service
--  Módulo: Caja (Fase 2) · Backend owner: Triana García
--  UC: CAJ-01..20
--  Integra con: Azul/CardNet, DGII API
-- =====================================================================
--  EL PRINCIPIO QUE RIGE TODO ESTE SCHEMA
--  `movimiento` es un libro mayor: se escribe y nunca se toca. No hay
--  UPDATE ni DELETE. Un error se arregla con un contra-asiento, igual
--  que en contabilidad de papel. El día que alguien reclame "me falta
--  un pago", el libro tiene que poder reconstruirse entero desde cero
--  y dar exactamente el mismo saldo.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS baney_caja
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE baney_caja;

-- ---------------------------------------------------------------------
-- CUENTA · la "caja" de cada actor.
-- La plataforma también tiene la suya: ahí entran las comisiones.
-- ---------------------------------------------------------------------
CREATE TABLE cuenta (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid            CHAR(26)     NOT NULL,
  titular_tipo   ENUM('vendedor','transportista','plataforma') NOT NULL,
  titular_uid    CHAR(26)     NULL COMMENT 'NULL solo para la cuenta de la plataforma',
  titular_nombre VARCHAR(200) NOT NULL,
  titular_rnc    VARCHAR(11)  NULL,
  moneda         CHAR(3)      NOT NULL DEFAULT 'DOP',
  estado         ENUM('activa','suspendida','cerrada') NOT NULL DEFAULT 'activa',
  creado_en      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cuenta_uid (uid),
  UNIQUE KEY uq_cuenta_titular (titular_tipo, titular_uid, moneda),
  KEY ix_cuenta_estado (estado)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- MOVIMIENTO · libro mayor. APPEND-ONLY.
--
-- `saldo_despues` se calcula en la misma transacción que inserta, con
-- la fila de `saldo_cuenta` bloqueada (SELECT ... FOR UPDATE). Eso
-- garantiza que los saldos encadenan sin huecos aunque entren mil
-- movimientos por segundo.
--
-- `monto` va SIEMPRE con signo. Un cargo es negativo. Así
-- SUM(monto) = saldo, sin CASE por tipo.
--
-- UC-CAJ-01..08, 11, 12
-- ---------------------------------------------------------------------
CREATE TABLE movimiento (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid              CHAR(26)     NOT NULL,
  cuenta_id        BIGINT UNSIGNED NOT NULL,
  tipo             ENUM('venta','flete','comision','itbis','retencion','payout',
                        'reembolso','devolucion','penalidad','ajuste','contra_asiento',
                        'cargo_pasarela') NOT NULL,
  monto            DECIMAL(14,2) NOT NULL COMMENT 'con signo: + entra, − sale',
  saldo_despues    DECIMAL(16,2) NOT NULL,
  moneda           CHAR(3)      NOT NULL DEFAULT 'DOP',
  estado_fondos    ENUM('pendiente','disponible','retenido') NOT NULL DEFAULT 'pendiente'
                   COMMENT 'pendiente hasta que el pago se libera; retenido por disputa',
  disponible_desde DATE         NULL COMMENT 'T+N según política de liberación',
  fecha_valor      DATE         NOT NULL COMMENT 'fecha contable, puede diferir de creado_en',
  referencia_tipo  ENUM('pedido','suborden','viaje','factura','comision','liquidacion',
                        'payout','devolucion','reembolso','conciliacion','manual') NOT NULL,
  referencia_uid   CHAR(26)     NULL,
  factura_uid      CHAR(26)     NULL COMMENT 'billing-service · UC-CAJ-17',
  descripcion      VARCHAR(300) NOT NULL,
  -- conciliación con la pasarela
  conciliado       TINYINT(1)   NOT NULL DEFAULT 0,
  conciliacion_id  BIGINT UNSIGNED NULL,
  referencia_externa VARCHAR(100) NULL COMMENT 'id de la transacción en Azul/CardNet',
  -- corrección
  corrige_mov_id   BIGINT UNSIGNED NULL COMMENT 'si es contra_asiento, a cuál corrige',
  actor_uid        CHAR(26)     NULL,
  creado_en        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_movimiento_uid (uid),
  UNIQUE KEY uq_movimiento_idempotente (cuenta_id, referencia_tipo, referencia_uid, tipo)
    COMMENT 'el mismo evento repetido no vuelve a asentar',
  KEY ix_mov_cuenta_fecha (cuenta_id, fecha_valor, id) COMMENT 'base de UC-CAJ-08 (filtrar)',
  KEY ix_mov_cuenta_tipo  (cuenta_id, tipo, fecha_valor),
  KEY ix_mov_sin_conciliar (conciliado, fecha_valor) COMMENT 'UC-CAJ-10',
  KEY ix_mov_externa      (referencia_externa),
  KEY ix_mov_disponible   (cuenta_id, estado_fondos, disponible_desde),
  CONSTRAINT fk_mov_cuenta FOREIGN KEY (cuenta_id) REFERENCES cuenta (id) ON DELETE RESTRICT,
  CONSTRAINT fk_mov_corrige FOREIGN KEY (corrige_mov_id) REFERENCES movimiento (id) ON DELETE RESTRICT,
  CONSTRAINT ck_mov_monto CHECK (monto <> 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- SALDO_CUENTA · materializado.
-- Sumar un millón de movimientos en cada carga del dashboard no es
-- viable. Esta tabla es la caché autorizada: se actualiza en la misma
-- transacción que inserta el movimiento, y un job nocturno la verifica
-- contra SUM(movimiento.monto). Si difieren, hay un bug y suena una
-- alarma.
-- UC-CAJ-01 (balance) · UC-CAJ-05 (pagos pendientes)
-- ---------------------------------------------------------------------
CREATE TABLE saldo_cuenta (
  cuenta_id          BIGINT UNSIGNED NOT NULL,
  disponible         DECIMAL(16,2) NOT NULL DEFAULT 0,
  pendiente          DECIMAL(16,2) NOT NULL DEFAULT 0,
  retenido           DECIMAL(16,2) NOT NULL DEFAULT 0,
  total              DECIMAL(16,2) AS (disponible + pendiente + retenido) STORED,
  ultimo_movimiento_id BIGINT UNSIGNED NULL,
  verificado_en      DATETIME(3)  NULL COMMENT 'última vez que cuadró con el libro',
  actualizado_en     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (cuenta_id),
  CONSTRAINT fk_saldo_cuenta FOREIGN KEY (cuenta_id)
    REFERENCES cuenta (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-CAJ-09 · Conciliación contra el settlement de la pasarela
-- ---------------------------------------------------------------------
CREATE TABLE conciliacion (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid             CHAR(26)     NOT NULL,
  origen          ENUM('azul','cardnet','banco','manual') NOT NULL,
  periodo_desde   DATE         NOT NULL,
  periodo_hasta   DATE         NOT NULL,
  archivo_url     VARCHAR(500) NULL COMMENT 'settlement cargado',
  total_externo   DECIMAL(16,2) NOT NULL DEFAULT 0,
  total_interno   DECIMAL(16,2) NOT NULL DEFAULT 0,
  diferencia      DECIMAL(16,2) NOT NULL DEFAULT 0,
  lineas_cuadradas  INT UNSIGNED NOT NULL DEFAULT 0,
  lineas_sobrantes  INT UNSIGNED NOT NULL DEFAULT 0,
  lineas_faltantes  INT UNSIGNED NOT NULL DEFAULT 0,
  estado          ENUM('en_proceso','cuadrada','con_diferencias','cerrada') NOT NULL DEFAULT 'en_proceso',
  ejecutado_por_uid CHAR(26)   NULL,
  creado_en       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  cerrada_en      DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_conciliacion_uid (uid),
  KEY ix_conciliacion_periodo (origen, periodo_desde, periodo_hasta),
  CONSTRAINT ck_conciliacion_periodo CHECK (periodo_hasta >= periodo_desde)
) ENGINE=InnoDB;

-- UC-CAJ-10 · Detectar pago no conciliado
CREATE TABLE conciliacion_linea (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conciliacion_id   BIGINT UNSIGNED NOT NULL,
  movimiento_id     BIGINT UNSIGNED NULL COMMENT 'NULL = está en la pasarela pero no en BANEY',
  referencia_externa VARCHAR(100) NULL,
  fecha_externa     DATE          NULL,
  monto_externo     DECIMAL(14,2) NULL,
  monto_interno     DECIMAL(14,2) NULL,
  diferencia        DECIMAL(14,2) NOT NULL DEFAULT 0,
  resultado         ENUM('cuadrado','sobrante_externo','faltante_externo',
                         'monto_distinto','duplicado') NOT NULL,
  resuelto          TINYINT(1)    NOT NULL DEFAULT 0,
  nota              VARCHAR(500)  NULL,
  PRIMARY KEY (id),
  KEY ix_conc_linea (conciliacion_id, resultado),
  KEY ix_conc_linea_mov (movimiento_id),
  CONSTRAINT fk_conc_linea_conc FOREIGN KEY (conciliacion_id) REFERENCES conciliacion (id) ON DELETE CASCADE,
  CONSTRAINT fk_conc_linea_mov  FOREIGN KEY (movimiento_id)   REFERENCES movimiento (id)   ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-CAJ-18 · Cuenta bancaria del vendedor/transportista
-- El número NO se guarda en claro: se cifra en la aplicación (AES-GCM,
-- llave en el secret manager de AWS) y solo se muestran los últimos 4.
-- ---------------------------------------------------------------------
CREATE TABLE cuenta_bancaria (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid               CHAR(26)     NOT NULL,
  cuenta_id         BIGINT UNSIGNED NOT NULL,
  banco             VARCHAR(100) NOT NULL,
  tipo              ENUM('ahorro','corriente') NOT NULL,
  numero_cifrado    VARBINARY(512) NOT NULL COMMENT 'AES-GCM; jamás en claro',
  ultimos4          CHAR(4)      NOT NULL,
  titular_nombre    VARCHAR(200) NOT NULL,
  titular_documento VARCHAR(20)  NOT NULL COMMENT 'cédula o RNC del titular',
  moneda            CHAR(3)      NOT NULL DEFAULT 'DOP',
  verificada        TINYINT(1)   NOT NULL DEFAULT 0,
  verificada_en     DATETIME(3)  NULL,
  es_principal      TINYINT(1)   NOT NULL DEFAULT 0,
  activa            TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_banco_uid (uid),
  KEY ix_banco_cuenta (cuenta_id, activa),
  CONSTRAINT fk_banco_cuenta FOREIGN KEY (cuenta_id)
    REFERENCES cuenta (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-CAJ-19 · Solicitud de retiro / payout
-- ---------------------------------------------------------------------
CREATE TABLE payout (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid                CHAR(26)     NOT NULL,
  numero             VARCHAR(24)  NOT NULL,
  cuenta_id          BIGINT UNSIGNED NOT NULL,
  cuenta_bancaria_id BIGINT UNSIGNED NOT NULL,
  liquidacion_uid    CHAR(26)     NULL COMMENT 'billing-service',
  origen             ENUM('solicitud_manual','programado','liquidacion') NOT NULL DEFAULT 'solicitud_manual',
  monto              DECIMAL(14,2) NOT NULL,
  comision_retiro    DECIMAL(14,2) NOT NULL DEFAULT 0,
  monto_neto         DECIMAL(14,2) NOT NULL,
  moneda             CHAR(3)      NOT NULL DEFAULT 'DOP',
  estado             ENUM('solicitado','aprobado','rechazado','en_proceso',
                          'pagado','fallido','revertido') NOT NULL DEFAULT 'solicitado',
  motivo_rechazo     VARCHAR(500) NULL,
  aprobado_por_uid   CHAR(26)     NULL,
  referencia_bancaria VARCHAR(100) NULL,
  idempotency_key    CHAR(36)     NOT NULL COMMENT 'nunca pagar dos veces el mismo retiro',
  solicitado_en      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  aprobado_en        DATETIME(3)  NULL,
  pagado_en          DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payout_uid    (uid),
  UNIQUE KEY uq_payout_numero (numero),
  UNIQUE KEY uq_payout_idem   (idempotency_key),
  KEY ix_payout_cuenta (cuenta_id, estado, solicitado_en),
  KEY ix_payout_estado (estado, solicitado_en),
  CONSTRAINT fk_payout_cuenta FOREIGN KEY (cuenta_id)          REFERENCES cuenta (id)           ON DELETE RESTRICT,
  CONSTRAINT fk_payout_banco  FOREIGN KEY (cuenta_bancaria_id) REFERENCES cuenta_bancaria (id)  ON DELETE RESTRICT,
  CONSTRAINT ck_payout_monto CHECK (monto > 0 AND monto_neto > 0)
) ENGINE=InnoDB;

-- Frecuencia de payout automático (UC-PAY-28 del plan de Transporte,
-- que cae aquí porque el dinero vive en Caja)
CREATE TABLE payout_programacion (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cuenta_id       BIGINT UNSIGNED NOT NULL,
  frecuencia      ENUM('diaria','semanal','quincenal','mensual','manual') NOT NULL DEFAULT 'manual',
  dia_semana      TINYINT UNSIGNED NULL COMMENT '1=lunes',
  dia_mes         TINYINT UNSIGNED NULL,
  monto_minimo    DECIMAL(14,2) NOT NULL DEFAULT 0,
  activa          TINYINT(1)   NOT NULL DEFAULT 1,
  proxima_corrida DATE         NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_prog_cuenta (cuenta_id),
  KEY ix_prog_corrida (activa, proxima_corrida),
  CONSTRAINT fk_prog_cuenta FOREIGN KEY (cuenta_id)
    REFERENCES cuenta (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-CAJ-13 (estado de cuenta) · 14 (CSV) · 15 (reporte mensual)
-- La generación es asíncrona: la petición se encola y el archivo
-- aparece cuando está listo. Un vendedor con 50.000 movimientos no
-- puede esperar a que el request HTTP termine.
-- ---------------------------------------------------------------------
CREATE TABLE reporte (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid            CHAR(26)     NOT NULL,
  cuenta_id      BIGINT UNSIGNED NULL COMMENT 'NULL = reporte global de la plataforma',
  tipo           ENUM('estado_cuenta','movimientos_csv','mensual','impuestos','comisiones') NOT NULL,
  formato        ENUM('pdf','csv','xlsx') NOT NULL,
  periodo_desde  DATE         NOT NULL,
  periodo_hasta  DATE         NOT NULL,
  filtros        JSON         NULL,
  estado         ENUM('encolado','generando','listo','fallido','expirado') NOT NULL DEFAULT 'encolado',
  archivo_url    VARCHAR(500) NULL,
  bytes          BIGINT UNSIGNED NULL,
  expira_en      DATETIME(3)  NULL COMMENT 'el enlace firmado caduca',
  solicitado_por_uid CHAR(26) NOT NULL,
  error          VARCHAR(500) NULL,
  creado_en      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  generado_en    DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reporte_uid (uid),
  KEY ix_reporte_cuenta (cuenta_id, tipo, creado_en),
  KEY ix_reporte_cola   (estado, creado_en),
  CONSTRAINT fk_reporte_cuenta FOREIGN KEY (cuenta_id)
    REFERENCES cuenta (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-CAJ-20 · Auditoría. Quién miró y quién tocó qué.
-- En un módulo de dinero esto no es opcional: es lo que te defiende
-- cuando alguien reclama. Append-only.
-- ---------------------------------------------------------------------
CREATE TABLE auditoria (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid           CHAR(26)     NOT NULL,
  actor_uid     CHAR(26)     NOT NULL,
  actor_rol     VARCHAR(40)  NOT NULL,
  accion        ENUM('consulta','creacion','modificacion','anulacion',
                     'aprobacion','rechazo','exportacion') NOT NULL,
  entidad_tipo  VARCHAR(40)  NOT NULL,
  entidad_uid   CHAR(26)     NULL,
  cuenta_id     BIGINT UNSIGNED NULL,
  antes         JSON         NULL,
  despues       JSON         NULL,
  ip            VARBINARY(16) NULL,
  user_agent    VARCHAR(300) NULL,
  creado_en     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_auditoria_uid (uid),
  KEY ix_auditoria_actor   (actor_uid, creado_en),
  KEY ix_auditoria_entidad (entidad_tipo, entidad_uid, creado_en),
  KEY ix_auditoria_cuenta  (cuenta_id, creado_en)
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
-- UC-CAJ-02 (ventas) · UC-CAJ-03 (ingresos) · UC-CAJ-04 (comisiones)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_resumen_mensual AS
SELECT
  m.cuenta_id,
  DATE_FORMAT(m.fecha_valor, '%Y-%m')                              AS periodo,
  SUM(CASE WHEN m.tipo IN ('venta','flete') THEN m.monto ELSE 0 END) AS ingresos,
  SUM(CASE WHEN m.tipo = 'comision'   THEN -m.monto ELSE 0 END)    AS comisiones,
  SUM(CASE WHEN m.tipo = 'itbis'      THEN m.monto ELSE 0 END)     AS itbis,
  SUM(CASE WHEN m.tipo = 'retencion'  THEN -m.monto ELSE 0 END)    AS retenciones,
  SUM(CASE WHEN m.tipo = 'payout'     THEN -m.monto ELSE 0 END)    AS payouts,
  SUM(CASE WHEN m.tipo IN ('reembolso','devolucion') THEN -m.monto ELSE 0 END) AS reembolsos,
  SUM(m.monto)                                                     AS neto,
  COUNT(*)                                                         AS movimientos
FROM movimiento m
GROUP BY m.cuenta_id, DATE_FORMAT(m.fecha_valor, '%Y-%m');

-- Verificador de integridad: debe devolver CERO filas siempre.
-- Si devuelve algo, `saldo_cuenta` se desincronizó del libro.
CREATE OR REPLACE VIEW v_descuadre_saldos AS
SELECT
  s.cuenta_id,
  s.total                        AS saldo_materializado,
  COALESCE(SUM(m.monto), 0)      AS saldo_real,
  s.total - COALESCE(SUM(m.monto), 0) AS diferencia
FROM saldo_cuenta s
LEFT JOIN movimiento m ON m.cuenta_id = s.cuenta_id
GROUP BY s.cuenta_id, s.total
HAVING ABS(s.total - COALESCE(SUM(m.monto), 0)) > 0.005;
