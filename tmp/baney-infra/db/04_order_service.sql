-- =====================================================================
--  BANEY RD · order-service
--  Módulo: Mercado (Fase 2) · Backend owner: Triana García
--  UC: MKT-16..26 (comprador), MKT-36..42 (vendedor),
--      MKT-49 (admin autoriza reembolso), MKT-55, MKT-56 (multivendedor)
-- =====================================================================
--  LA DECISIÓN CENTRAL: PEDIDO vs SUBORDEN
--
--  El comprador hace UN pedido y paga UNA vez. Pero si compró a tres
--  fincas distintas, hay TRES despachos, tres estados, tres fletes y
--  tres liquidaciones. Modelarlo como un solo pedido plano hace
--  imposible que un vendedor acepte lo suyo mientras otro rechaza.
--
--      pedido      → lo que ve y paga el comprador
--      suborden    → lo que ve y despacha cada vendedor  (UC-MKT-56)
--      item        → cuelga de la suborden, nunca del pedido
--
--  Un pedido con un solo vendedor simplemente tiene una suborden. No
--  hay dos caminos de código.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS baney_order
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE baney_order;

-- ---------------------------------------------------------------------
-- PEDIDO · UC-MKT-16, 17, 18, 55
-- `idempotency_key` con UNIQUE es lo que impide que un doble clic o un
-- reintento de red creen dos pedidos cobrados.
-- ---------------------------------------------------------------------
CREATE TABLE pedido (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid               CHAR(26)     NOT NULL,
  numero            VARCHAR(20)  NOT NULL COMMENT 'visible al usuario, ej: BNY-2027-000142',
  comprador_uid     CHAR(26)     NOT NULL,
  comprador_nombre  VARCHAR(160) NOT NULL COMMENT 'snapshot',
  comprador_email   VARCHAR(190) NULL,
  comprador_telefono VARCHAR(30) NULL,
  comprador_rnc     VARCHAR(11)  NULL COMMENT 'si pide factura con crédito fiscal (B01)',
  estado            ENUM('creado','pago_pendiente','pagado','en_preparacion',
                         'parcialmente_despachado','despachado','completado',
                         'cancelado','reembolsado') NOT NULL DEFAULT 'creado',
  carrito_uid       CHAR(26)     NULL,
  idempotency_key   CHAR(36)     NOT NULL,
  -- totales: suma de las subórdenes, guardados para no recalcular en cada listado
  subtotal          DECIMAL(14,2) NOT NULL DEFAULT 0,
  descuento_total   DECIMAL(14,2) NOT NULL DEFAULT 0,
  itbis_total       DECIMAL(14,2) NOT NULL DEFAULT 0,
  transporte_total  DECIMAL(14,2) NOT NULL DEFAULT 0,
  total             DECIMAL(14,2) NOT NULL DEFAULT 0,
  moneda            CHAR(3)      NOT NULL DEFAULT 'DOP',
  cupon_codigo      VARCHAR(40)  NULL,
  direccion_envio   JSON         NULL COMMENT 'snapshot completo: la dirección puede borrarse después',
  requiere_factura  TINYINT(1)   NOT NULL DEFAULT 0,
  nota_comprador    VARCHAR(500) NULL,
  creado_en         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  pagado_en         DATETIME(3)  NULL,
  completado_en     DATETIME(3)  NULL,
  cancelado_en      DATETIME(3)  NULL,
  actualizado_en    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_pedido_uid    (uid),
  UNIQUE KEY uq_pedido_numero (numero),
  UNIQUE KEY uq_pedido_idem   (idempotency_key),
  KEY ix_pedido_comprador (comprador_uid, creado_en),
  KEY ix_pedido_estado    (estado, creado_en),
  CONSTRAINT ck_pedido_total CHECK (total >= 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- SUBORDEN · el pedido desde el lado del vendedor
-- UC-MKT-36 (recibir), 37 (aceptar/rechazar), 38 (preparar),
-- 39 (listo para despacho), 40 (solicitar transporte), 56
-- ---------------------------------------------------------------------
CREATE TABLE suborden (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid                CHAR(26)     NOT NULL,
  pedido_id          BIGINT UNSIGNED NOT NULL,
  numero             VARCHAR(24)  NOT NULL COMMENT 'BNY-2027-000142-01',
  vendedor_uid       CHAR(26)     NOT NULL,
  vendedor_nombre    VARCHAR(160) NOT NULL,
  estado             ENUM('pendiente_aceptacion','aceptada','rechazada','en_preparacion',
                          'lista_despacho','en_transito','entregada','cancelada',
                          'devolucion_solicitada','devuelta') NOT NULL DEFAULT 'pendiente_aceptacion',
  modalidad_entrega  ENUM('envio_baney','retiro_local','acuerdo_vendedor') NOT NULL DEFAULT 'envio_baney',
  subtotal           DECIMAL(14,2) NOT NULL DEFAULT 0,
  descuento          DECIMAL(14,2) NOT NULL DEFAULT 0,
  itbis              DECIMAL(14,2) NOT NULL DEFAULT 0,
  transporte         DECIMAL(14,2) NOT NULL DEFAULT 0,
  total              DECIMAL(14,2) NOT NULL DEFAULT 0,
  -- enlace con el módulo de Transporte (Adrian). Sin FK: otro servicio.
  trip_uid           CHAR(26)     NULL COMMENT 'viaje creado en trip-service · UC-MKT-40',
  trip_estado        VARCHAR(40)  NULL COMMENT 'proyección para UC-MKT-20 sin llamar a trip',
  codigo_entrega     CHAR(6)      NULL COMMENT 'OTP que el comprador da al transportista',
  motivo_rechazo     VARCHAR(500) NULL,
  aceptada_en        DATETIME(3)  NULL,
  preparada_en       DATETIME(3)  NULL,
  despachada_en      DATETIME(3)  NULL,
  entregada_en       DATETIME(3)  NULL,
  cancelada_en       DATETIME(3)  NULL,
  limite_aceptacion  DATETIME(3)  NULL COMMENT 'si no acepta antes, se auto-rechaza',
  creado_en          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_suborden_uid    (uid),
  UNIQUE KEY uq_suborden_numero (numero),
  UNIQUE KEY uq_suborden_pedido_vendedor (pedido_id, vendedor_uid),
  KEY ix_suborden_vendedor (vendedor_uid, estado, creado_en) COMMENT 'bandeja del vendedor',
  KEY ix_suborden_trip     (trip_uid),
  KEY ix_suborden_limite   (estado, limite_aceptacion),
  CONSTRAINT fk_suborden_pedido FOREIGN KEY (pedido_id)
    REFERENCES pedido (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- ÍTEM · cuelga de la suborden.
-- Todo es snapshot. Un pedido de hace un año tiene que poder
-- imprimirse aunque el producto se haya borrado y el precio cambiado.
-- ---------------------------------------------------------------------
CREATE TABLE suborden_item (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid                CHAR(26)     NOT NULL,
  suborden_id        BIGINT UNSIGNED NOT NULL,
  variante_uid       CHAR(26)     NOT NULL,
  producto_uid       CHAR(26)     NOT NULL,
  sku                VARCHAR(64)  NOT NULL,
  nombre             VARCHAR(200) NOT NULL,
  variante_nombre    VARCHAR(160) NOT NULL,
  foto_url           VARCHAR(500) NULL,
  unidad_medida      VARCHAR(20)  NOT NULL,
  cantidad           INT UNSIGNED NOT NULL,
  cantidad_despachada INT UNSIGNED NOT NULL DEFAULT 0,
  cantidad_devuelta  INT UNSIGNED NOT NULL DEFAULT 0,
  precio_unitario    DECIMAL(14,2) NOT NULL,
  descuento_unitario DECIMAL(14,2) NOT NULL DEFAULT 0,
  regimen_itbis      ENUM('exento','gravado','tasa_cero') NOT NULL DEFAULT 'exento',
  tasa_itbis         DECIMAL(5,4) NOT NULL DEFAULT 0.0000 COMMENT '0.1800 cuando grava',
  itbis_linea        DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_linea        DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_item_uid (uid),
  KEY ix_item_suborden (suborden_id),
  KEY ix_item_variante (variante_uid),
  CONSTRAINT fk_item_suborden FOREIGN KEY (suborden_id)
    REFERENCES suborden (id) ON DELETE CASCADE,
  CONSTRAINT ck_item_cantidad CHECK (cantidad > 0),
  CONSTRAINT ck_item_devuelta CHECK (cantidad_devuelta <= cantidad)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- LÍNEA DE TIEMPO · append-only
-- Es lo que alimenta "Ver estado del pedido" (UC-MKT-19) y "Rastrear
-- entrega" (UC-MKT-20), y lo único que permite responder "¿quién
-- canceló esto y cuándo?" seis meses después.
-- ---------------------------------------------------------------------
CREATE TABLE pedido_evento (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid             CHAR(26)     NOT NULL,
  pedido_id       BIGINT UNSIGNED NOT NULL,
  suborden_id     BIGINT UNSIGNED NULL COMMENT 'NULL = evento de todo el pedido',
  tipo            VARCHAR(60)  NOT NULL COMMENT 'pedido.creado, suborden.aceptada, trip.en_ruta...',
  estado_anterior VARCHAR(40)  NULL,
  estado_nuevo    VARCHAR(40)  NULL,
  actor_tipo      ENUM('comprador','vendedor','administrador','sistema','transportista') NOT NULL,
  actor_uid       CHAR(26)     NULL,
  mensaje         VARCHAR(300) NULL COMMENT 'texto que se le muestra al comprador',
  visible_comprador TINYINT(1) NOT NULL DEFAULT 1,
  datos           JSON         NULL,
  creado_en       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_evento_uid (uid),
  KEY ix_evento_pedido   (pedido_id, creado_en),
  KEY ix_evento_suborden (suborden_id, creado_en),
  CONSTRAINT fk_evento_pedido   FOREIGN KEY (pedido_id)   REFERENCES pedido (id)   ON DELETE CASCADE,
  CONSTRAINT fk_evento_suborden FOREIGN KEY (suborden_id) REFERENCES suborden (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Proyección del pago. El dueño es payment-service (Adrian); aquí se
-- guarda lo mínimo para mostrar el estado sin llamarlo en cada vista.
-- UC-MKT-17
-- ---------------------------------------------------------------------
CREATE TABLE pago_referencia (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pedido_id       BIGINT UNSIGNED NOT NULL,
  payment_uid     CHAR(26)     NOT NULL COMMENT 'payment-service',
  metodo          ENUM('tarjeta','transferencia','efectivo_contra_entrega','credito_empresa') NOT NULL,
  marca_tarjeta   VARCHAR(20)  NULL,
  ultimos4        CHAR(4)      NULL,
  estado          ENUM('pendiente','autorizado','capturado','rechazado',
                       'reembolsado','reembolsado_parcial','cancelado') NOT NULL DEFAULT 'pendiente',
  monto           DECIMAL(14,2) NOT NULL,
  monto_reembolsado DECIMAL(14,2) NOT NULL DEFAULT 0,
  moneda          CHAR(3)      NOT NULL DEFAULT 'DOP',
  pasarela        ENUM('azul','cardnet','manual') NULL,
  referencia_pasarela VARCHAR(100) NULL,
  autorizado_en   DATETIME(3)  NULL,
  capturado_en    DATETIME(3)  NULL,
  actualizado_en  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_pago_uid (payment_uid),
  KEY ix_pago_pedido (pedido_id, estado),
  CONSTRAINT fk_pago_pedido FOREIGN KEY (pedido_id)
    REFERENCES pedido (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-MKT-22 (solicitar devolución) · UC-MKT-41 (vendedor la gestiona)
-- ---------------------------------------------------------------------
CREATE TABLE devolucion (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid               CHAR(26)     NOT NULL,
  numero            VARCHAR(24)  NOT NULL,
  suborden_id       BIGINT UNSIGNED NOT NULL,
  solicitante_uid   CHAR(26)     NOT NULL,
  motivo            ENUM('producto_danado','producto_incorrecto','faltante','calidad',
                         'no_corresponde_descripcion','entrega_tardia','otro') NOT NULL,
  descripcion       TEXT         NULL,
  estado            ENUM('solicitada','aprobada','rechazada','en_transito',
                         'recibida','reembolsada','cerrada') NOT NULL DEFAULT 'solicitada',
  monto_solicitado  DECIMAL(14,2) NOT NULL,
  monto_aprobado    DECIMAL(14,2) NULL,
  resuelta_por_uid  CHAR(26)     NULL,
  resuelta_por_tipo ENUM('vendedor','administrador') NULL,
  motivo_resolucion VARCHAR(500) NULL,
  limite_respuesta  DATETIME(3)  NULL,
  creado_en         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resuelta_en       DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_devolucion_uid    (uid),
  UNIQUE KEY uq_devolucion_numero (numero),
  KEY ix_devolucion_suborden (suborden_id),
  KEY ix_devolucion_estado   (estado, creado_en),
  CONSTRAINT fk_devolucion_suborden FOREIGN KEY (suborden_id)
    REFERENCES suborden (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE devolucion_item (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  devolucion_id    BIGINT UNSIGNED NOT NULL,
  suborden_item_id BIGINT UNSIGNED NOT NULL,
  cantidad         INT UNSIGNED NOT NULL,
  monto            DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dev_item (devolucion_id, suborden_item_id),
  KEY ix_dev_item_suborden (suborden_item_id),
  CONSTRAINT fk_dev_item_devolucion FOREIGN KEY (devolucion_id)    REFERENCES devolucion (id)     ON DELETE CASCADE,
  CONSTRAINT fk_dev_item_item       FOREIGN KEY (suborden_item_id) REFERENCES suborden_item (id)  ON DELETE RESTRICT,
  CONSTRAINT ck_dev_item_cantidad CHECK (cantidad > 0)
) ENGINE=InnoDB;

CREATE TABLE devolucion_evidencia (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  devolucion_id BIGINT UNSIGNED NOT NULL,
  tipo          ENUM('foto','video','documento') NOT NULL DEFAULT 'foto',
  url           VARCHAR(500) NOT NULL,
  subida_por_uid CHAR(26)    NOT NULL,
  creado_en     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_evidencia_devolucion (devolucion_id),
  CONSTRAINT fk_evidencia_devolucion FOREIGN KEY (devolucion_id)
    REFERENCES devolucion (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-MKT-23 (comprador solicita) · UC-MKT-49 (admin autoriza)
-- Se separa de `devolucion` porque hay reembolsos sin devolución:
-- pedido cancelado antes de despachar, cobro duplicado, ajuste manual.
-- ---------------------------------------------------------------------
CREATE TABLE solicitud_reembolso (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid               CHAR(26)     NOT NULL,
  pedido_id         BIGINT UNSIGNED NOT NULL,
  suborden_id       BIGINT UNSIGNED NULL,
  devolucion_id     BIGINT UNSIGNED NULL,
  origen            ENUM('devolucion','cancelacion','disputa','ajuste_manual','cobro_duplicado') NOT NULL,
  monto             DECIMAL(14,2) NOT NULL,
  estado            ENUM('solicitado','autorizado','rechazado','procesando',
                         'procesado','fallido') NOT NULL DEFAULT 'solicitado',
  autorizado_por_uid CHAR(26)    NULL,
  autorizado_en     DATETIME(3)  NULL,
  motivo_rechazo    VARCHAR(500) NULL,
  payment_refund_uid CHAR(26)    NULL COMMENT 'devuelto por payment-service',
  nota_credito_uid  CHAR(26)     NULL COMMENT 'billing-service emite NC fiscal',
  creado_en         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  procesado_en      DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reembolso_uid (uid),
  KEY ix_reembolso_pedido (pedido_id, estado),
  KEY ix_reembolso_estado (estado, creado_en),
  CONSTRAINT fk_reembolso_pedido     FOREIGN KEY (pedido_id)     REFERENCES pedido (id)     ON DELETE RESTRICT,
  CONSTRAINT fk_reembolso_suborden   FOREIGN KEY (suborden_id)   REFERENCES suborden (id)   ON DELETE RESTRICT,
  CONSTRAINT fk_reembolso_devolucion FOREIGN KEY (devolucion_id) REFERENCES devolucion (id) ON DELETE SET NULL,
  CONSTRAINT ck_reembolso_monto CHECK (monto > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-MKT-21 · Cancelación (comprador, vendedor o sistema)
-- ---------------------------------------------------------------------
CREATE TABLE cancelacion (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid           CHAR(26)     NOT NULL,
  pedido_id     BIGINT UNSIGNED NOT NULL,
  suborden_id   BIGINT UNSIGNED NULL COMMENT 'NULL = se canceló el pedido completo',
  solicitante_tipo ENUM('comprador','vendedor','administrador','sistema') NOT NULL,
  solicitante_uid  CHAR(26)  NULL,
  motivo        ENUM('arrepentimiento','sin_stock','precio_erroneo','no_acepta_a_tiempo',
                     'fraude_sospechado','pago_fallido','otro') NOT NULL,
  descripcion   VARCHAR(500) NULL,
  penalidad     DECIMAL(14,2) NOT NULL DEFAULT 0,
  creado_en     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cancelacion_uid (uid),
  KEY ix_cancelacion_pedido (pedido_id),
  CONSTRAINT fk_cancelacion_pedido   FOREIGN KEY (pedido_id)   REFERENCES pedido (id)   ON DELETE CASCADE,
  CONSTRAINT fk_cancelacion_suborden FOREIGN KEY (suborden_id) REFERENCES suborden (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-MKT-48 · Gestionar disputas (administrador)
--
-- El dominio Disputas es de Zadkiel (UC-DIS-01..09) y vive fuera de
-- este servicio. Aquí solo se guarda el enlace y el desenlace, que es
-- lo único que afecta al pedido: a favor de quién se resolvió y cuánto
-- hay que devolver. Sin esta tabla, order-service tendría que llamar
-- al servicio de disputas cada vez que pinta una suborden.
-- ---------------------------------------------------------------------
CREATE TABLE disputa_referencia (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid             CHAR(26)     NOT NULL,
  disputa_uid     CHAR(26)     NOT NULL COMMENT 'dominio Disputas; sin FK, otro servicio',
  pedido_id       BIGINT UNSIGNED NOT NULL,
  suborden_id     BIGINT UNSIGNED NULL,
  abierta_por_tipo ENUM('comprador','vendedor') NOT NULL,
  abierta_por_uid CHAR(26)     NOT NULL,
  motivo          VARCHAR(200) NOT NULL,
  estado          ENUM('abierta','en_revision','resuelta','cerrada','escalada') NOT NULL DEFAULT 'abierta',
  resolucion      ENUM('a_favor_comprador','a_favor_vendedor','parcial','sin_lugar') NULL,
  monto_resuelto  DECIMAL(14,2) NULL,
  resuelta_por_uid CHAR(26)    NULL,
  congela_payout  TINYINT(1)   NOT NULL DEFAULT 1
                  COMMENT 'mientras esté abierta, caja retiene los fondos de esa suborden',
  abierta_en      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resuelta_en     DATETIME(3)  NULL,
  actualizado_en  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_disputa_uid      (uid),
  UNIQUE KEY uq_disputa_externa  (disputa_uid),
  KEY ix_disputa_pedido   (pedido_id, estado),
  KEY ix_disputa_suborden (suborden_id),
  KEY ix_disputa_abiertas (estado, abierta_en),
  CONSTRAINT fk_disputa_pedido   FOREIGN KEY (pedido_id)   REFERENCES pedido (id)   ON DELETE RESTRICT,
  CONSTRAINT fk_disputa_suborden FOREIGN KEY (suborden_id) REFERENCES suborden (id) ON DELETE RESTRICT
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

-- ---------------------------------------------------------------------
-- Mensajes entrantes ya procesados. Las colas entregan "al menos una
-- vez": sin esta tabla, un evento de pago repetido marca el pedido
-- pagado dos veces y duplica el asiento en Caja.
-- ---------------------------------------------------------------------
CREATE TABLE inbox_procesado (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mensaje_uid   CHAR(26)     NOT NULL,
  tipo_evento   VARCHAR(80)  NOT NULL,
  procesado_en  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_inbox_mensaje (mensaje_uid),
  KEY ix_inbox_limpieza (procesado_en)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-MKT-42 · Ver ventas del vendedor
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ventas_vendedor AS
SELECT
  s.vendedor_uid,
  DATE(p.pagado_en)                                   AS fecha,
  COUNT(DISTINCT s.id)                                AS subordenes,
  SUM(s.subtotal)                                     AS subtotal,
  SUM(s.descuento)                                    AS descuento,
  SUM(s.itbis)                                        AS itbis,
  SUM(s.transporte)                                   AS transporte,
  SUM(s.total)                                        AS total
FROM suborden s
JOIN pedido p ON p.id = s.pedido_id
WHERE p.pagado_en IS NOT NULL
  AND s.estado NOT IN ('rechazada','cancelada')
GROUP BY s.vendedor_uid, DATE(p.pagado_en);
