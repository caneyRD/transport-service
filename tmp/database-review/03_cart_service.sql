












CREATE DATABASE IF NOT EXISTS baney_cart
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE baney_cart;

CREATE TABLE carrito (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid              CHAR(26)     NOT NULL,
  usuario_uid      CHAR(26)     NULL ,
  token_sesion     CHAR(43)     NULL ,
  estado           ENUM('activo','convertido','abandonado','fusionado') NOT NULL DEFAULT 'activo',
  moneda           CHAR(3)      NOT NULL DEFAULT 'DOP',
  cupon_codigo     VARCHAR(40)  NULL ,
  cupon_descuento  DECIMAL(14,2) NOT NULL DEFAULT 0,
  direccion_uid    CHAR(26)     NULL ,
  pedido_uid       CHAR(26)     NULL ,
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







CREATE TABLE carrito_item (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  carrito_id           BIGINT UNSIGNED NOT NULL,
  variante_uid         CHAR(26)     NOT NULL,
  producto_uid         CHAR(26)     NOT NULL,
  vendedor_uid         CHAR(26)     NOT NULL,
  cantidad             INT UNSIGNED NOT NULL,
  
  sku_snapshot         VARCHAR(64)  NOT NULL,
  nombre_snapshot      VARCHAR(200) NOT NULL,
  variante_snapshot    VARCHAR(160) NOT NULL,
  foto_snapshot        VARCHAR(500) NULL,
  precio_snapshot      DECIMAL(14,2) NOT NULL,
  unidad_snapshot      VARCHAR(20)  NOT NULL,
  regimen_itbis        ENUM('exento','gravado','tasa_cero') NOT NULL DEFAULT 'exento',
  peso_kg_snapshot     DECIMAL(10,3) NULL,
  descuento_unitario   DECIMAL(14,2) NOT NULL DEFAULT 0,
  precio_actual        DECIMAL(14,2) NULL ,
  disponible_actual    INT          NULL ,
  agregado_en          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_item_carrito_variante (carrito_id, variante_uid),
  KEY ix_item_vendedor (carrito_id, vendedor_uid),
  CONSTRAINT fk_item_carrito FOREIGN KEY (carrito_id)
    REFERENCES carrito (id) ON DELETE CASCADE,
  CONSTRAINT ck_item_cantidad CHECK (cantidad > 0)
) ENGINE=InnoDB;








CREATE TABLE carrito_entrega (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  carrito_id         BIGINT UNSIGNED NOT NULL,
  vendedor_uid       CHAR(26)     NOT NULL,
  modalidad          ENUM('envio_baney','retiro_local','acuerdo_vendedor') NOT NULL DEFAULT 'envio_baney',
  direccion_uid      CHAR(26)     NULL ,
  punto_retiro_texto VARCHAR(300) NULL ,
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
  desglose         JSON         NULL ,
  vigente_hasta    DATETIME(3)  NOT NULL,
  creado_en        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cotizacion_uid (uid),
  KEY ix_cotizacion_carrito (carrito_id, vendedor_uid, vigente_hasta),
  CONSTRAINT fk_cotizacion_carrito FOREIGN KEY (carrito_id)
    REFERENCES carrito (id) ON DELETE CASCADE
) ENGINE=InnoDB;






CREATE TABLE intento_checkout (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid              CHAR(26)     NOT NULL,
  carrito_id       BIGINT UNSIGNED NOT NULL,
  idempotency_key  CHAR(36)     NOT NULL ,
  resultado        ENUM('iniciado','ok','fallo_stock','fallo_precio','fallo_cupon',
                        'fallo_pago','fallo_transporte','expirado') NOT NULL DEFAULT 'iniciado',
  detalle          JSON         NULL ,
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
