-- =====================================================================
--  BANEY RD · catalog-service
--  Módulo: Mercado (Fase 2) · Backend owner: Triana García
--  UC: MKT-01..07, MKT-27..34, MKT-43..47, MKT-05, MKT-24, MKT-25
--  Motor: MySQL 8.0 · InnoDB · utf8mb4
-- =====================================================================
--  REGLA DE ARQUITECTURA
--  Un schema por microservicio. NO hay claves foráneas que crucen de un
--  schema a otro: lo de otros servicios (usuarios, pagos, viajes) se
--  guarda como `*_uid` CHAR(26) indexado, sin FK. Si mañana catalog y
--  order viven en instancias distintas, nada se rompe.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS baney_catalog
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE baney_catalog;

-- ---------------------------------------------------------------------
-- Proyección local del vendedor.
-- El dueño real del usuario es user-service (Zadkiel). Aquí guardamos
-- solo lo que el catálogo necesita para listar y filtrar sin llamar a
-- otro servicio en cada request. Se sincroniza por eventos.
-- UC-MKT-05 (ver vendedor) · UC-MKT-43 (aprobar) · UC-MKT-46 (suspender)
-- ---------------------------------------------------------------------
CREATE TABLE vendedor (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid               CHAR(26)        NOT NULL COMMENT 'ULID; mismo uid que en user-service',
  nombre_negocio    VARCHAR(160)    NOT NULL,
  slug              VARCHAR(180)    NOT NULL,
  rnc               VARCHAR(11)     NULL COMMENT 'RNC o cédula; validado por dgii-service',
  rnc_verificado    TINYINT(1)      NOT NULL DEFAULT 0,
  logo_url          VARCHAR(500)    NULL,
  descripcion       TEXT            NULL,
  provincia         VARCHAR(80)     NULL,
  municipio         VARCHAR(80)     NULL,
  latitud           DECIMAL(10,7)   NULL COMMENT 'para UC-MKT-03 y el map-service',
  longitud          DECIMAL(10,7)   NULL,
  estado            ENUM('pendiente','aprobado','rechazado','suspendido') NOT NULL DEFAULT 'pendiente',
  motivo_estado     VARCHAR(500)    NULL,
  aprobado_por_uid  CHAR(26)        NULL,
  aprobado_en       DATETIME(3)     NULL,
  rating_promedio   DECIMAL(3,2)    NOT NULL DEFAULT 0.00,
  total_resenas     INT UNSIGNED    NOT NULL DEFAULT 0,
  total_productos   INT UNSIGNED    NOT NULL DEFAULT 0,
  creado_en         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_vendedor_uid  (uid),
  UNIQUE KEY uq_vendedor_slug (slug),
  KEY ix_vendedor_estado      (estado),
  KEY ix_vendedor_geo         (latitud, longitud),
  CONSTRAINT ck_vendedor_rating CHECK (rating_promedio BETWEEN 0 AND 5)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Área comercial: la barra superior del catálogo del frontend
-- (Lácteos, Carnes y Reces, Apicultura, Veterinaria...).
-- Es una dimensión distinta de la categoría: un mismo producto puede
-- estar en el área "Lácteos" y en la categoría "Industriales".
-- UC-MKT-02
-- ---------------------------------------------------------------------
CREATE TABLE area (
  id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug        VARCHAR(60)  NOT NULL,
  nombre      VARCHAR(80)  NOT NULL,
  icono_url   VARCHAR(500) NULL,
  orden       SMALLINT     NOT NULL DEFAULT 0,
  activa      TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_area_slug (slug)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Categoría jerárquica (árbol de profundidad libre).
-- `ruta` materializa el camino ("/hortalizas/raices/") para poder hacer
-- "todo lo que cuelgue de Hortalizas" con un LIKE indexado, en vez de
-- un CTE recursivo en cada búsqueda.
-- UC-MKT-02 · UC-MKT-31 (vendedor) · UC-MKT-47 (admin)
-- ---------------------------------------------------------------------
CREATE TABLE categoria (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  padre_id    INT UNSIGNED NULL,
  slug        VARCHAR(80)  NOT NULL,
  nombre      VARCHAR(120) NOT NULL,
  ruta        VARCHAR(500) NOT NULL COMMENT 'ej: /hortalizas/raices/ — se recalcula al mover',
  nivel       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  orden       SMALLINT     NOT NULL DEFAULT 0,
  activa      TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_categoria_slug (slug),
  KEY ix_categoria_padre (padre_id),
  KEY ix_categoria_ruta  (ruta(191)),
  CONSTRAINT fk_categoria_padre FOREIGN KEY (padre_id)
    REFERENCES categoria (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PRODUCTO
-- El precio y el stock NO viven aquí: viven en `variante` y en
-- inventory-service. Un producto sin variantes no se puede vender.
--
-- `regimen_itbis` es crítico en RD: la mayoría de productos
-- agropecuarios sin procesar están EXENTOS de ITBIS (Art. 343 del
-- Código Tributario). Si se asume 18% para todo, se sobrefactura al
-- comprador y se rompe el reporte de DGII.
-- UC-MKT-04, 27, 28, 29, 33 · UC-MKT-44, 45 (moderación)
-- ---------------------------------------------------------------------
CREATE TABLE producto (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid                CHAR(26)     NOT NULL,
  vendedor_id        BIGINT UNSIGNED NOT NULL,
  categoria_id       INT UNSIGNED NOT NULL,
  area_id            SMALLINT UNSIGNED NULL,
  nombre             VARCHAR(200) NOT NULL,
  slug               VARCHAR(220) NOT NULL,
  descripcion        TEXT         NULL,
  unidad_medida      ENUM('unidad','libra','quintal','caja','saco','racimo','docena','litro','galon','kilogramo') NOT NULL DEFAULT 'unidad',
  regimen_itbis      ENUM('exento','gravado','tasa_cero') NOT NULL DEFAULT 'exento'
                     COMMENT 'agro sin procesar = exento; billing lo lee para calcular el ITBIS',
  estado             ENUM('borrador','publicado','agotado','suspendido','archivado') NOT NULL DEFAULT 'borrador',
  moderacion         ENUM('no_requerida','pendiente','aprobada','rechazada') NOT NULL DEFAULT 'pendiente',
  motivo_moderacion  VARCHAR(500) NULL,
  es_temporada       TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'interruptor "Productos de temporada" del catálogo',
  temporada_desde    DATE         NULL,
  temporada_hasta    DATE         NULL,
  origen_provincia   VARCHAR(80)  NULL,
  rating_promedio    DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  total_resenas      INT UNSIGNED NOT NULL DEFAULT 0,
  total_vendido      INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'desnormalizado para ordenar por "más vendidos"',
  publicado_en       DATETIME(3)  NULL,
  creado_en          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  archivado_en       DATETIME(3)  NULL COMMENT 'borrado lógico: nunca DELETE, hay pedidos apuntando aquí',
  PRIMARY KEY (id),
  UNIQUE KEY uq_producto_uid (uid),
  UNIQUE KEY uq_producto_slug (slug),
  KEY ix_producto_vendedor  (vendedor_id, estado),
  KEY ix_producto_categoria (categoria_id, estado),
  KEY ix_producto_area      (area_id, estado),
  KEY ix_producto_listado   (estado, moderacion, publicado_en),
  KEY ix_producto_temporada (es_temporada, estado),
  FULLTEXT KEY ft_producto  (nombre, descripcion) COMMENT 'UC-MKT-01 búsqueda por texto',
  CONSTRAINT fk_producto_vendedor  FOREIGN KEY (vendedor_id)  REFERENCES vendedor (id)  ON DELETE RESTRICT,
  CONSTRAINT fk_producto_categoria FOREIGN KEY (categoria_id) REFERENCES categoria (id) ON DELETE RESTRICT,
  CONSTRAINT fk_producto_area      FOREIGN KEY (area_id)      REFERENCES area (id)      ON DELETE SET NULL
) ENGINE=InnoDB;

-- UC-MKT-30 · Subir fotografías
CREATE TABLE producto_foto (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id BIGINT UNSIGNED NOT NULL,
  url         VARCHAR(500) NOT NULL,
  url_thumb   VARCHAR(500) NULL,
  texto_alt   VARCHAR(200) NULL,
  orden       SMALLINT     NOT NULL DEFAULT 0,
  es_principal TINYINT(1)  NOT NULL DEFAULT 0,
  bytes       INT UNSIGNED NULL,
  creado_en   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_foto_producto (producto_id, orden),
  CONSTRAINT fk_foto_producto FOREIGN KEY (producto_id)
    REFERENCES producto (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- VARIANTE (SKU)
-- Es la unidad real de venta: el precio y el stock cuelgan de aquí, no
-- del producto. Un producto sin variantes se crea con una variante
-- "única" automática, para no tener dos caminos de código.
-- UC-MKT-07 (elegir variante) · UC-MKT-32 · UC-MKT-33 (precio)
-- ---------------------------------------------------------------------
CREATE TABLE variante (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid                  CHAR(26)     NOT NULL,
  producto_id          BIGINT UNSIGNED NOT NULL,
  sku                  VARCHAR(64)  NOT NULL,
  nombre               VARCHAR(160) NOT NULL DEFAULT 'Única',
  atributos            JSON         NULL COMMENT '{"calibre":"grande","empaque":"saco 100lb"}',
  precio               DECIMAL(14,2) NOT NULL,
  precio_comparacion   DECIMAL(14,2) NULL COMMENT 'precio tachado; debe ser > precio',
  moneda               CHAR(3)      NOT NULL DEFAULT 'DOP',
  peso_kg              DECIMAL(10,3) NULL COMMENT 'lo usa cart-service para cotizar transporte',
  volumen_m3           DECIMAL(10,4) NULL,
  cantidad_minima      INT UNSIGNED NOT NULL DEFAULT 1,
  cantidad_maxima      INT UNSIGNED NULL,
  activa               TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_variante_uid (uid),
  UNIQUE KEY uq_variante_sku (sku),
  KEY ix_variante_producto (producto_id, activa),
  KEY ix_variante_precio   (precio),
  CONSTRAINT fk_variante_producto FOREIGN KEY (producto_id)
    REFERENCES producto (id) ON DELETE CASCADE,
  CONSTRAINT ck_variante_precio CHECK (precio >= 0),
  CONSTRAINT ck_variante_comparacion CHECK (precio_comparacion IS NULL OR precio_comparacion > precio)
) ENGINE=InnoDB;

-- Historial de precios: sin esto no se puede auditar un cambio de precio
-- ni explicarle a un comprador por qué pagó lo que pagó.
CREATE TABLE variante_precio_historial (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  variante_id     BIGINT UNSIGNED NOT NULL,
  precio_anterior DECIMAL(14,2) NULL,
  precio_nuevo    DECIMAL(14,2) NOT NULL,
  actor_uid       CHAR(26)      NULL,
  motivo          VARCHAR(200)  NULL,
  creado_en       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_precio_hist (variante_id, creado_en),
  CONSTRAINT fk_precio_hist_variante FOREIGN KEY (variante_id)
    REFERENCES variante (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-MKT-34 · Descuentos del vendedor
-- ---------------------------------------------------------------------
CREATE TABLE descuento (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid            CHAR(26)     NOT NULL,
  vendedor_id    BIGINT UNSIGNED NOT NULL,
  nombre         VARCHAR(160) NOT NULL,
  tipo           ENUM('porcentaje','monto_fijo') NOT NULL,
  valor          DECIMAL(14,2) NOT NULL,
  alcance        ENUM('vendedor','categoria','producto','variante') NOT NULL,
  vigente_desde  DATETIME(3)  NOT NULL,
  vigente_hasta  DATETIME(3)  NULL,
  activo         TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_descuento_uid (uid),
  KEY ix_descuento_vigencia (vendedor_id, activo, vigente_desde, vigente_hasta),
  CONSTRAINT fk_descuento_vendedor FOREIGN KEY (vendedor_id)
    REFERENCES vendedor (id) ON DELETE CASCADE,
  CONSTRAINT ck_descuento_valor CHECK (valor > 0),
  CONSTRAINT ck_descuento_fechas CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)
) ENGINE=InnoDB;

CREATE TABLE descuento_objetivo (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  descuento_id  BIGINT UNSIGNED NOT NULL,
  categoria_id  INT UNSIGNED    NULL,
  producto_id   BIGINT UNSIGNED NULL,
  variante_id   BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY ix_dobj_descuento (descuento_id),
  KEY ix_dobj_producto  (producto_id),
  KEY ix_dobj_variante  (variante_id),
  CONSTRAINT fk_dobj_descuento FOREIGN KEY (descuento_id) REFERENCES descuento (id) ON DELETE CASCADE,
  CONSTRAINT fk_dobj_categoria FOREIGN KEY (categoria_id) REFERENCES categoria (id) ON DELETE CASCADE,
  CONSTRAINT fk_dobj_producto  FOREIGN KEY (producto_id)  REFERENCES producto (id)  ON DELETE CASCADE,
  CONSTRAINT fk_dobj_variante  FOREIGN KEY (variante_id)  REFERENCES variante (id)  ON DELETE CASCADE,
  CONSTRAINT ck_dobj_uno CHECK (
    (categoria_id IS NOT NULL) + (producto_id IS NOT NULL) + (variante_id IS NOT NULL) = 1
  )
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-MKT-11 · Cupones
-- `usos_actuales` se incrementa con UPDATE ... WHERE usos_actuales <
-- usos_max, nunca leyendo-y-escribiendo: así dos compradores
-- simultáneos no pasan del límite.
-- ---------------------------------------------------------------------
CREATE TABLE cupon (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid              CHAR(26)     NOT NULL,
  codigo           VARCHAR(40)  NOT NULL,
  descripcion      VARCHAR(200) NULL,
  emisor_tipo      ENUM('plataforma','vendedor') NOT NULL DEFAULT 'plataforma',
  vendedor_id      BIGINT UNSIGNED NULL,
  tipo             ENUM('porcentaje','monto_fijo','envio_gratis') NOT NULL,
  valor            DECIMAL(14,2) NOT NULL DEFAULT 0,
  compra_minima    DECIMAL(14,2) NOT NULL DEFAULT 0,
  descuento_maximo DECIMAL(14,2) NULL,
  usos_max         INT UNSIGNED NULL COMMENT 'NULL = ilimitado',
  usos_actuales    INT UNSIGNED NOT NULL DEFAULT 0,
  usos_max_usuario INT UNSIGNED NOT NULL DEFAULT 1,
  vigente_desde    DATETIME(3)  NOT NULL,
  vigente_hasta    DATETIME(3)  NULL,
  activo           TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cupon_uid    (uid),
  UNIQUE KEY uq_cupon_codigo (codigo),
  KEY ix_cupon_vigencia (activo, vigente_desde, vigente_hasta),
  CONSTRAINT fk_cupon_vendedor FOREIGN KEY (vendedor_id)
    REFERENCES vendedor (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE cupon_uso (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cupon_id     BIGINT UNSIGNED NOT NULL,
  usuario_uid  CHAR(26)      NOT NULL,
  pedido_uid   CHAR(26)      NOT NULL COMMENT 'order-service; sin FK, otro schema',
  monto_descontado DECIMAL(14,2) NOT NULL,
  usado_en     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cupon_uso_pedido (cupon_id, pedido_uid),
  KEY ix_cupon_uso_usuario (cupon_id, usuario_uid),
  CONSTRAINT fk_cupon_uso_cupon FOREIGN KEY (cupon_id)
    REFERENCES cupon (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-MKT-24 (calificar producto) · UC-MKT-25 (calificar vendedor)
-- `pedido_uid` obligatorio: solo reseña quien compró. El UNIQUE impide
-- reseñar dos veces la misma compra.
-- ---------------------------------------------------------------------
CREATE TABLE resena (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid           CHAR(26)     NOT NULL,
  tipo          ENUM('producto','vendedor') NOT NULL,
  producto_id   BIGINT UNSIGNED NULL,
  vendedor_id   BIGINT UNSIGNED NULL,
  autor_uid     CHAR(26)     NOT NULL,
  autor_nombre  VARCHAR(120) NOT NULL COMMENT 'snapshot: el nombre no debe cambiar al editar el perfil',
  pedido_uid    CHAR(26)     NOT NULL,
  puntuacion    TINYINT UNSIGNED NOT NULL,
  titulo        VARCHAR(160) NULL,
  comentario    TEXT         NULL,
  moderacion    ENUM('pendiente','aprobada','rechazada') NOT NULL DEFAULT 'pendiente',
  respuesta_vendedor TEXT    NULL,
  respondida_en DATETIME(3)  NULL,
  creado_en     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_resena_uid (uid),
  UNIQUE KEY uq_resena_una_por_compra (tipo, pedido_uid, producto_id, vendedor_id),
  KEY ix_resena_producto (producto_id, moderacion, creado_en),
  KEY ix_resena_vendedor (vendedor_id, moderacion, creado_en),
  CONSTRAINT fk_resena_producto FOREIGN KEY (producto_id) REFERENCES producto (id) ON DELETE CASCADE,
  CONSTRAINT fk_resena_vendedor FOREIGN KEY (vendedor_id) REFERENCES vendedor (id) ON DELETE CASCADE,
  CONSTRAINT ck_resena_puntuacion CHECK (puntuacion BETWEEN 1 AND 5),
  CONSTRAINT ck_resena_destino CHECK (
    (tipo = 'producto' AND producto_id IS NOT NULL) OR
    (tipo = 'vendedor' AND vendedor_id IS NOT NULL)
  )
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- UC-MKT-44, 45, 46 · Bitácora de moderación. Append-only.
-- ---------------------------------------------------------------------
CREATE TABLE moderacion_log (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entidad_tipo  ENUM('producto','vendedor','resena') NOT NULL,
  entidad_id    BIGINT UNSIGNED NOT NULL,
  accion        ENUM('aprobar','rechazar','suspender','reactivar','ocultar') NOT NULL,
  estado_anterior VARCHAR(40)  NULL,
  estado_nuevo    VARCHAR(40)  NOT NULL,
  admin_uid     CHAR(26)     NOT NULL,
  motivo        VARCHAR(500) NULL,
  creado_en     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_moderacion_entidad (entidad_tipo, entidad_id, creado_en),
  KEY ix_moderacion_admin   (admin_uid, creado_en)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Outbox transaccional. Se escribe en la MISMA transacción que el
-- cambio de negocio; un publicador lo vacía hacia la cola. Sin esto,
-- "guardé el producto pero el evento no salió" es inevitable.
-- ---------------------------------------------------------------------
CREATE TABLE outbox (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid           CHAR(26)     NOT NULL,
  agregado_tipo VARCHAR(60)  NOT NULL,
  agregado_uid  CHAR(26)     NOT NULL,
  tipo_evento   VARCHAR(80)  NOT NULL COMMENT 'ej: catalogo.producto.publicado',
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
