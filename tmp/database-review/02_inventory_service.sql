













CREATE DATABASE IF NOT EXISTS baney_inventory
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE baney_inventory;

















CREATE TABLE existencia (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  variante_uid       CHAR(26)     NOT NULL ,
  producto_uid       CHAR(26)     NOT NULL,
  vendedor_uid       CHAR(26)     NOT NULL,
  sku                VARCHAR(64)  NOT NULL ,
  disponible         INT          NOT NULL DEFAULT 0,
  reservado          INT          NOT NULL DEFAULT 0,
  umbral_alerta      INT          NOT NULL DEFAULT 0 ,
  permite_sobreventa TINYINT(1)   NOT NULL DEFAULT 0 ,
  ubicacion          VARCHAR(160) NULL ,
  version            BIGINT UNSIGNED NOT NULL DEFAULT 0,
  creado_en          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_existencia_variante (variante_uid),
  KEY ix_existencia_vendedor (vendedor_uid),
  KEY ix_existencia_bajo     (vendedor_uid, disponible),
  CONSTRAINT ck_existencia_no_negativo CHECK (disponible >= 0 AND reservado >= 0)
) ENGINE=InnoDB;







CREATE TABLE reserva (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid             CHAR(26)     NOT NULL,
  existencia_id   BIGINT UNSIGNED NOT NULL,
  variante_uid    CHAR(26)     NOT NULL,
  origen_tipo     ENUM('carrito','pedido') NOT NULL,
  origen_uid      CHAR(26)     NOT NULL ,
  cantidad        INT UNSIGNED NOT NULL,
  estado          ENUM('activa','confirmada','liberada','expirada') NOT NULL DEFAULT 'activa',
  expira_en       DATETIME(3)  NOT NULL,
  confirmada_en   DATETIME(3)  NULL ,
  liberada_en     DATETIME(3)  NULL,
  creado_en       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_reserva_uid (uid),
  UNIQUE KEY uq_reserva_origen_variante (origen_tipo, origen_uid, variante_uid),
  KEY ix_reserva_vencidas (estado, expira_en) ,
  KEY ix_reserva_origen   (origen_uid),
  CONSTRAINT fk_reserva_existencia FOREIGN KEY (existencia_id)
    REFERENCES existencia (id) ON DELETE RESTRICT,
  CONSTRAINT ck_reserva_cantidad CHECK (cantidad > 0)
) ENGINE=InnoDB;










CREATE TABLE movimiento_stock (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid              CHAR(26)     NOT NULL,
  existencia_id    BIGINT UNSIGNED NOT NULL,
  variante_uid     CHAR(26)     NOT NULL,
  vendedor_uid     CHAR(26)     NOT NULL,
  tipo             ENUM('ingreso','venta','devolucion','ajuste_positivo','ajuste_negativo',
                        'merma','reserva','liberacion_reserva') NOT NULL,
  cantidad_delta   INT          NOT NULL ,
  saldo_despues    INT          NOT NULL,
  referencia_tipo  ENUM('pedido','suborden','devolucion','reserva','manual','importacion') NOT NULL,
  referencia_uid   CHAR(26)     NULL,
  motivo           VARCHAR(300) NULL,
  actor_uid        CHAR(26)     NULL ,
  creado_en        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mov_uid (uid),
  UNIQUE KEY uq_mov_idempotente (referencia_tipo, referencia_uid, variante_uid, tipo)
    ,
  KEY ix_mov_variante (variante_uid, creado_en),
  KEY ix_mov_vendedor (vendedor_uid, creado_en),
  CONSTRAINT fk_mov_existencia FOREIGN KEY (existencia_id)
    REFERENCES existencia (id) ON DELETE RESTRICT,
  CONSTRAINT ck_mov_delta CHECK (cantidad_delta <> 0)
) ENGINE=InnoDB;




CREATE TABLE alerta_stock (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  existencia_id BIGINT UNSIGNED NOT NULL,
  vendedor_uid  CHAR(26)     NOT NULL,
  tipo          ENUM('bajo_umbral','agotado') NOT NULL,
  disponible_en_alerta INT   NOT NULL,
  notificada    TINYINT(1)   NOT NULL DEFAULT 0,
  resuelta_en   DATETIME(3)  NULL,
  creado_en     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_alerta_pendiente (notificada, creado_en),
  KEY ix_alerta_vendedor  (vendedor_uid, resuelta_en),
  CONSTRAINT fk_alerta_existencia FOREIGN KEY (existencia_id)
    REFERENCES existencia (id) ON DELETE CASCADE
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




CREATE OR REPLACE VIEW v_disponibilidad AS
SELECT
  e.variante_uid,
  e.producto_uid,
  e.vendedor_uid,
  e.disponible,
  e.reservado,
  (e.disponible + e.reservado) AS total_fisico,
  CASE
    WHEN e.permite_sobreventa = 1       THEN 'disponible'
    WHEN e.disponible <= 0              THEN 'agotado'
    WHEN e.disponible <= e.umbral_alerta THEN 'pocas_unidades'
    ELSE 'disponible'
  END AS estado_disponibilidad
FROM existencia e;
