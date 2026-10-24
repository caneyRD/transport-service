-- =====================================================================
--  BANEY RD · cart-service
--  Módulo: Mercado (Fase 2) · Backend owner: Triana García
--  UC: MKT-08..15 (carrito, cupón, dirección, entrega, retiro en local,
--      costo de transporte), MKT-26 (recomprar)
-- =====================================================================
--  POR QUÉ HAY SNAPSHOTS DE PRECIO Y NOMBRE EN CADA ÍTEM
--  Entre que alguien agrega al carrito y paga pueden pasar horas. Si el
--  vendedor sube el precio, el carrito NO debe cambiar solo: se congela
--  el precio visto y se avisa al confirmar. Sin snapshot, el comprador
--  ve un total y paga otro.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS baney_cart
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE baney_cart;

CREATE TABLE carrito (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid              CHAR(26)     NOT NULL,
  usuario_uid      CHAR(26)     NULL COMMENT 'NULL = invitado; se fusiona al iniciar sesión',
  token_sesion     CHAR(43)     NULL COMMENT 'identifica el carrito del invitado',
  estado           ENUM('activo','convertido','abandonado','fusionado') NOT NULL DEFAULT 'activo',
  moneda           CHAR(3)      NOT NULL DEFAULT 'DOP',
  cupon_codigo     VARCHAR(40)  NULL COMMENT 'se revalida contra catalog al confirmar',
  cupon_descuento  DECIMAL(14,2) NOT NULL DEFAULT 0,
  direccion_uid    CHAR(26)     NULL COMMENT 'user-service; sin FK',
  pedido_uid       CHAR(26)     NULL COMMENT 'se llena al convertir en pedido',
  fusionado_en_uid CHAR(26)     NULL,
  expira_en        DATETIME(3)  NOT NULL,
  creado_en        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_carrito_uid (uid),
  KEY ix_carrito_usuario (usuario_uid, estado),
  KEY ix_carrito_token   (token_sesion),
  KEY ix_carrito_limpieza (estado, expira_en)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-MKT-08, 09, 10
-- `vendedor_uid` se repite en cada ítem a propósito: es lo que permite
-- agrupar el carrito por vendedor sin consultar catalog, que es la base
-- del pedido multivendedor (UC-MKT-55/56).
-- ---------------------------------------------------------------------
CREATE TABLE carrito_item (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  carrito_id           BIGINT UNSIGNED NOT NULL,
  variante_uid         CHAR(26)     NOT NULL,
  producto_uid         CHAR(26)     NOT NULL,
  vendedor_uid         CHAR(26)     NOT NULL,
  cantidad             INT UNSIGNED NOT NULL,
  -- snapshots tomados al agregar
  sku_snapshot         VARCHAR(64)  NOT NULL,
  nombre_snapshot      VARCHAR(200) NOT NULL,
  variante_snapshot    VARCHAR(160) NOT NULL,
  foto_snapshot        VARCHAR(500) NULL,
  precio_snapshot      DECIMAL(14,2) NOT NULL,
  unidad_snapshot      VARCHAR(20)  NOT NULL,
  regimen_itbis        ENUM('exento','gravado','tasa_cero') NOT NULL DEFAULT 'exento',
  peso_kg_snapshot     DECIMAL(10,3) NULL,
  descuento_unitario   DECIMAL(14,2) NOT NULL DEFAULT 0,
  precio_actual        DECIMAL(14,2) NULL COMMENT 'refrescado al abrir el carrito; si difiere, se avisa',
  disponible_actual    INT          NULL COMMENT 'cache de inventory para UC-MKT-57',
  agregado_en          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_item_carrito_variante (carrito_id, variante_uid),
  KEY ix_item_vendedor (carrito_id, vendedor_uid),
  CONSTRAINT fk_item_carrito FOREIGN KEY (carrito_id)
    REFERENCES carrito (id) ON DELETE CASCADE,
  CONSTRAINT ck_item_cantidad CHECK (cantidad > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- ENTREGA POR VENDEDOR · UC-MKT-13, 14, 15
-- Un carrito con tres vendedores tiene TRES entregas: cada uno despacha
-- desde su finca, cotiza su propio flete y puede ofrecer retiro en
-- local. Por eso la entrega no cuelga del carrito sino del par
-- (carrito, vendedor).
-- ---------------------------------------------------------------------
CREATE TABLE carrito_entrega (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  carrito_id         BIGINT UNSIGNED NOT NULL,
  vendedor_uid       CHAR(26)     NOT NULL,
  modalidad          ENUM('envio_baney','retiro_local','acuerdo_vendedor') NOT NULL DEFAULT 'envio_baney',
  direccion_uid      CHAR(26)     NULL COMMENT 'destino cuando modalidad = envio_baney',
  punto_retiro_texto VARCHAR(300) NULL COMMENT 'dirección del local cuando es retiro',
  cotizacion_uid     CHAR(26)     NULL,
  costo_transporte   DECIMAL(14,2) NOT NULL DEFAULT 0,
  eta_minutos        INT UNSIGNED NULL,
  ventana_desde      DATETIME(3)  NULL,
  ventana_hasta      DATETIME(3)  NULL,
  notas              VARCHAR(500) NULL,
  actualizado_en     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_entrega_carrito_vendedor (carrito_id, vendedor_uid),
  CONSTRAINT fk_entrega_carrito FOREIGN KEY (carrito_id)
    REFERENCES carrito (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-MKT-15 · Cotización de transporte
-- La calcula trip-service (Adrian) con Google Maps. Aquí se guarda con
-- vencimiento: una cotización vieja no puede cobrarse. Si venció al
-- confirmar, se recotiza antes de crear el pedido.
-- ---------------------------------------------------------------------
CREATE TABLE cotizacion_transporte (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid              CHAR(26)     NOT NULL,
  carrito_id       BIGINT UNSIGNED NOT NULL,
  vendedor_uid     CHAR(26)     NOT NULL,
  origen_texto     VARCHAR(300) NOT NULL,
  origen_lat       DECIMAL(10,7) NULL,
  origen_lng       DECIMAL(10,7) NULL,
  destino_texto    VARCHAR(300) NOT NULL,
  destino_lat      DECIMAL(10,7) NULL,
  destino_lng      DECIMAL(10,7) NULL,
  distancia_km     DECIMAL(10,2) NULL,
  peso_total_kg    DECIMAL(10,3) NULL,
  tipo_vehiculo    VARCHAR(60)  NULL,
  costo            DECIMAL(14,2) NOT NULL,
  desglose         JSON         NULL COMMENT 'respuesta cruda del trip-service',
  vigente_hasta    DATETIME(3)  NOT NULL,
  creado_en        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cotizacion_uid (uid),
  KEY ix_cotizacion_carrito (carrito_id, vendedor_uid, vigente_hasta),
  CONSTRAINT fk_cotizacion_carrito FOREIGN KEY (carrito_id)
    REFERENCES carrito (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Intentos de checkout. Guarda por qué falló un checkout: sin esta
-- tabla nadie sabe cuántos carritos se pierden por stock agotado
-- (UC-MKT-57) y cuántos por tarjeta rechazada.
-- ---------------------------------------------------------------------
CREATE TABLE intento_checkout (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid              CHAR(26)     NOT NULL,
  carrito_id       BIGINT UNSIGNED NOT NULL,
  idempotency_key  CHAR(36)     NOT NULL COMMENT 'lo manda el cliente; evita pedidos dobles por doble clic',
  resultado        ENUM('iniciado','ok','fallo_stock','fallo_precio','fallo_cupon',
                        'fallo_pago','fallo_transporte','expirado') NOT NULL DEFAULT 'iniciado',
  detalle          JSON         NULL COMMENT 'qué variante falló y por qué',
  pedido_uid       CHAR(26)     NULL,
  creado_en        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finalizado_en    DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_intento_uid (uid),
  UNIQUE KEY uq_intento_idem (idempotency_key),
  KEY ix_intento_carrito (carrito_id, creado_en),
  CONSTRAINT fk_intento_carrito FOREIGN KEY (carrito_id)
    REFERENCES carrito (id) ON DELETE CASCADE
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
