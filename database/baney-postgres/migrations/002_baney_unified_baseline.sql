-- =====================================================================
--  BANEY · baseline PostgreSQL, esquema único `baney`
--  ARCHIVO GENERADO por tools/build_schema.sh a partir de sql/*.sql.
--  No editar a mano: cambiar el archivo del módulo y volver a generar.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

-- >>> sql/00_base.sql
-- =====================================================================
--  BANEY · base común del esquema único `baney`
--  Convenciones (las de la propuesta de Mercado, Caja y Billing; ver database/README.md):
--    · todo en español, snake_case, tablas en singular (pedido, suborden, factura);
--    · FK a otra tabla: <tabla>_id; referencia a una persona: <rol>_uid (comprador_uid);
--    · fechas con hora: <evento>_en (creado_en, pagado_en); fechas sin hora: fecha_<x>;
--    · archivos: *_url; booleanos sin prefijo cuando se leen solos (activo, verificada) o es_<x>;
--    · valores de estado y tipo en minúsculas snake_case, guardados como text + CHECK
--      (no ENUM nativo: agregar un valor a un ENUM no se puede revertir);
--    · toda PK es uuid; los números visibles (pedido, factura) van aparte;
--    · fechas en timestamptz (UTC), dinero numeric(14,2) + moneda ISO 4217.
-- =====================================================================

CREATE SCHEMA baney;
COMMENT ON SCHEMA baney IS 'BANEY: esquema único de la plataforma. Cada tabla dice su módulo dueño en su comentario.';
SET search_path TO baney, public;

-- Dominios reutilizados: la regla vive en un solo lugar en vez de repetirse
-- en cada tabla que guarda una moneda o una coordenada.
CREATE DOMAIN codigo_moneda AS char(3) CHECK (VALUE ~ '^[A-Z]{3}$');
CREATE DOMAIN latitud AS numeric(9,6) CHECK (VALUE BETWEEN -90 AND 90);
CREATE DOMAIN longitud AS numeric(9,6) CHECK (VALUE BETWEEN -180 AND 180);

-- Registro de versiones del esquema. El migrador de despliegue lo lee para
-- saber si la base ya tiene el baseline y no aplicarlo dos veces.
CREATE TABLE version_esquema (
  version      text PRIMARY KEY,
  descripcion  text NOT NULL,
  aplicada_en  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE version_esquema IS '[plataforma] Versiones del esquema aplicadas; solo la escribe el migrador.';

-- Mantiene actualizado_en sin depender de que cada servicio se acuerde.
CREATE FUNCTION marcar_actualizado_en() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END $$;

-- Para tablas que son registro contable o de auditoría: corregir es
-- insertar un contramovimiento, nunca editar ni borrar lo ya escrito.
CREATE FUNCTION rechazar_cambio() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo inserción', TG_TABLE_NAME USING ERRCODE = '55000';
END $$;

-- >>> sql/01_identity.sql
-- =====================================================================
--  Identidad y cuentas · dueño: user_service_admin (Zadkiel)
--  UC-AUTH-01..18, UC-USER-01..23, UC-HOME-01..15, UC-ADM-02/11/17/73/74
--  Sesiones, refresh tokens, códigos OTP, enlaces de verificación y el
--  contador de intentos fallidos viven en Redis: vencen solos y no son
--  historia que haya que conservar.
-- =====================================================================

CREATE TABLE usuario (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                    text NOT NULL,
  -- Nulo para cuentas creadas con Google o Apple que nunca pusieron contraseña.
  contrasena_hash          text,
  nombre_completo          text,
  telefono                 text,
  cedula                   text,
  fecha_nacimiento         date,
  rol                      text NOT NULL DEFAULT 'usuario'
                           CHECK (rol IN ('usuario','moderador','superadmin')),
  activo                   boolean NOT NULL DEFAULT true,
  idioma                   text NOT NULL DEFAULT 'es' CHECK (idioma IN ('es','en','ht')),
  avisar_email             boolean NOT NULL DEFAULT true,
  avisar_sms               boolean NOT NULL DEFAULT true,
  avisar_push              boolean NOT NULL DEFAULT true,
  acepta_promociones       boolean NOT NULL DEFAULT false,
  estado_identidad         text NOT NULL DEFAULT 'no_verificada'
                           CHECK (estado_identidad IN ('no_verificada','pendiente_revision','verificada','rechazada')),
  identidad_motivo         text,
  coincidencia_rostro      numeric(5,4) CHECK (coincidencia_rostro BETWEEN 0 AND 1),
  identidad_solicitada_en  timestamptz,
  identidad_decidida_en    timestamptz,
  -- Solo se llena al verificar: una cédula verificada no puede estar en dos cuentas.
  cedula_verificada        text,
  email_verificado_en      timestamptz,
  telefono_verificado_en   timestamptz,
  mfa_secreto_cifrado      text,
  mfa_activado_en          timestamptz,
  -- Último paso TOTP usado: impide reutilizar un código dentro de su ventana.
  mfa_ultimo_paso          bigint,
  ultimo_acceso_en         timestamptz,
  creado_en                timestamptz NOT NULL DEFAULT now(),
  actualizado_en           timestamptz NOT NULL DEFAULT now(),
  -- La baja anonimiza y marca la fila; no se borra porque pedidos, viajes y
  -- facturas la siguen referenciando.
  eliminado_en             timestamptz,
  CONSTRAINT ck_usuario_email_minusculas CHECK (email = lower(email)),
  CONSTRAINT ck_usuario_cedula_id CHECK (cedula IS NULL OR cedula ~ '^[0-9]{11}$'),
  CONSTRAINT ck_usuario_mfa CHECK (mfa_activado_en IS NULL OR mfa_secreto_cifrado IS NOT NULL)
);
CREATE UNIQUE INDEX uq_usuario_email ON usuario (email);
CREATE UNIQUE INDEX uq_usuario_verificada_cedula_id ON usuario (cedula_verificada) WHERE cedula_verificada IS NOT NULL;
CREATE INDEX ix_usuario_rol_activo ON usuario (rol, activo);
CREATE INDEX ix_usuario_creado ON usuario (creado_en);
COMMENT ON TABLE usuario IS '[identidad] Cuenta de la persona: acceso, rol del panel, idioma, MFA y verificación de identidad (KYC).';

-- Áreas del panel por moderador (UC-ADM-17). Tabla aparte en vez de una
-- lista JSON para poder preguntar "quién atiende disputas" con un índice.
CREATE TABLE area_administrador (
  usuario_uid       uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  area              text NOT NULL CHECK (area IN ('usuarios','transporte','pagos','disputas','soporte','mercado',
                                                  'finanzas','fiscal','contenido','configuracion','analitica')),
  otorgada_por_uid  uuid REFERENCES usuario(id),
  otorgada_en       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_uid, area)
);
CREATE INDEX ix_area_administrador_areas_area ON area_administrador (area);
COMMENT ON TABLE area_administrador IS '[identidad] Áreas del panel que atiende cada moderador.';

CREATE TABLE codigo_recuperacion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_uid  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  codigo_hash  text NOT NULL,
  usado_en     timestamptz,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_uid, codigo_hash)
);
COMMENT ON TABLE codigo_recuperacion IS '[identidad] Códigos de recuperación del MFA, guardados con hash y de un solo uso.';

CREATE TABLE identidad_vinculada (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_uid       uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  proveedor         text NOT NULL CHECK (proveedor IN ('google','apple')),
  -- El `sub` del proveedor no cambia nunca; el correo sí puede cambiar.
  sujeto_proveedor  text NOT NULL,
  email             text,
  vinculada_en      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proveedor, sujeto_proveedor),
  UNIQUE (usuario_uid, proveedor)
);
COMMENT ON TABLE identidad_vinculada IS '[identidad] Cuentas de Google y Apple vinculadas (UC-AUTH-08/09).';

-- Una persona puede ser cliente, vendedor, transportista y empresa a la vez
-- (UC-USER-13): cada tipo es una fila con su propia revisión.
CREATE TABLE perfil_cuenta (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_uid       uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  tipo_cuenta       text NOT NULL CHECK (tipo_cuenta IN ('cliente','vendedor','transportista','empresa')),
  estado            text NOT NULL DEFAULT 'pendiente_revision'
                    CHECK (estado IN ('activo','pendiente_revision','rechazado')),
  motivo_estado     text,
  detalle           jsonb NOT NULL DEFAULT '{}'::jsonb,
  revisado_por_uid  uuid REFERENCES usuario(id),
  revisado_en       timestamptz,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_uid, tipo_cuenta)
);
CREATE INDEX ix_perfil_cuenta_tipo_estado ON perfil_cuenta (tipo_cuenta, estado);
COMMENT ON TABLE perfil_cuenta IS '[identidad] Tipos de cuenta de la persona y su aprobación (UC-USER-03..06, UC-ADM-20/21).';

CREATE TABLE documento_usuario (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_uid        uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  tipo               text NOT NULL CHECK (tipo IN ('cedula_frente','cedula_reverso','selfie','licencia_conducir',
                                                   'certificado_rnc','otro')),
  url                text NOT NULL UNIQUE,
  tipo_contenido     text NOT NULL CHECK (tipo_contenido IN ('application/pdf','image/jpeg','image/png')),
  bytes              integer NOT NULL CHECK (bytes > 0),
  sha256             char(64) NOT NULL,
  fecha_vencimiento  date,
  estado             text NOT NULL DEFAULT 'pendiente_revision'
                     CHECK (estado IN ('pendiente_revision','aprobado','rechazado')),
  motivo_estado      text,
  subido_en          timestamptz NOT NULL DEFAULT now(),
  revisado_por_uid   uuid REFERENCES usuario(id),
  revisado_en        timestamptz
);
CREATE INDEX ix_documento_usuario_estado ON documento_usuario (estado, subido_en);
COMMENT ON TABLE documento_usuario IS '[identidad] Documentos de la persona para KYC: cédula, selfie, licencia, RNC (UC-USER-07, UC-TRA-20).';

-- Textos legales versionados (UC-CFG-12). La aceptación apunta a la versión
-- exacta: si cambia el texto, hay que volver a aceptarlo.
CREATE TABLE documento_legal (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento       text NOT NULL CHECK (documento IN ('terminos_generales','politica_privacidad','contrato_transportista')),
  version         text NOT NULL,
  publicado_en    timestamptz,
  vigente         boolean NOT NULL DEFAULT false,
  creado_por_uid  uuid REFERENCES usuario(id),
  creado_en       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (documento, version)
);
CREATE UNIQUE INDEX uq_documento_legal_vigente ON documento_legal (documento) WHERE vigente;
COMMENT ON TABLE documento_legal IS '[identidad] Versiones de términos, política de privacidad y contrato del transportista.';

CREATE TABLE documento_legal_texto (
  documento_legal_id  uuid NOT NULL REFERENCES documento_legal(id) ON DELETE CASCADE,
  idioma              text NOT NULL CHECK (idioma IN ('es','en','ht')),
  titulo              text NOT NULL,
  cuerpo              text NOT NULL,
  PRIMARY KEY (documento_legal_id, idioma)
);
COMMENT ON TABLE documento_legal_texto IS '[identidad] Texto de cada versión legal por idioma.';

CREATE TABLE aceptacion_legal (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_uid  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  documento    text NOT NULL,
  version      text NOT NULL,
  aceptada_en  timestamptz NOT NULL DEFAULT now(),
  ip           inet,
  user_agent   text,
  UNIQUE (usuario_uid, documento, version),
  FOREIGN KEY (documento, version) REFERENCES documento_legal (documento, version)
);
COMMENT ON TABLE aceptacion_legal IS '[identidad] Qué versión legal aceptó cada persona, cuándo y desde dónde (UC-HOME-13, UC-USER-22).';

CREATE TABLE direccion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_uid     uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  etiqueta        text NOT NULL,
  linea1          text NOT NULL,
  linea2          text,
  sector          text,
  ciudad          text NOT NULL,
  provincia       text NOT NULL,
  pais            char(2) NOT NULL DEFAULT 'DO',
  referencia      text,
  latitud         latitud,
  longitud        longitud,
  es_principal    boolean NOT NULL DEFAULT false,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_direccion_coordenadas CHECK ((latitud IS NULL) = (longitud IS NULL))
);
CREATE INDEX ix_direccion_usuario ON direccion (usuario_uid);
CREATE UNIQUE INDEX uq_direccion_principal ON direccion (usuario_uid) WHERE es_principal;
COMMENT ON TABLE direccion IS '[identidad] Direcciones de la persona; el carrito y el checkout las usan (UC-USER-08, UC-MKT-12).';

-- >>> sql/02_platform.sql
-- =====================================================================
--  Plataforma y panel · dueño: admin-service (Adrian)
--  UC-ADM-01/15/16, UC-CFG-12, UC-SUP-14, UC-FRD-13
--  Eventos (outbox) e idempotencia de consumidores son comunes a todos
--  los módulos: una sola tabla de cada uno en vez de una por esquema.
-- =====================================================================

CREATE TABLE configuracion (
  clave                text PRIMARY KEY,
  valor                jsonb NOT NULL,
  descripcion          text NOT NULL,
  version              integer NOT NULL DEFAULT 1 CHECK (version > 0),
  actualizado_por_uid  uuid REFERENCES usuario(id),
  actualizado_en       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE configuracion IS '[plataforma] Configuración vigente del negocio: plazos, límites, SLA (UC-ADM-15).';

-- Cada cambio de configuración queda versionado para poder ver quién lo hizo
-- y volver al valor anterior.
CREATE TABLE configuracion_version (
  clave             text NOT NULL REFERENCES configuracion(clave) ON DELETE CASCADE,
  version           integer NOT NULL CHECK (version > 0),
  valor             jsonb NOT NULL,
  cambiado_por_uid  uuid REFERENCES usuario(id),
  cambiado_en       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clave, version)
);
COMMENT ON TABLE configuracion_version IS '[plataforma] Historial de valores de cada configuración.';

CREATE TABLE funcion_activable (
  clave                text PRIMARY KEY,
  activa               boolean NOT NULL DEFAULT false,
  reglas               jsonb NOT NULL DEFAULT '{}'::jsonb,
  actualizado_por_uid  uuid REFERENCES usuario(id),
  actualizado_en       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE funcion_activable IS '[plataforma] Funciones que se encienden por ambiente o por grupo.';

-- Una sola bitácora para todos los módulos (antes había cinco). Los
-- historiales de negocio que ve el usuario (eventos de disputa, de pedido,
-- de viaje) son otra cosa y siguen en sus tablas.
CREATE TABLE auditoria (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo        text NOT NULL CHECK (modulo IN ('identidad','plataforma','empresa','transporte','mercado','pagos',
                                                'disputas','soporte','chat','notificaciones','facturacion','caja',
                'fiscal','seguros','escuela','analitica')),
  accion        text NOT NULL,
  actor_uid     uuid REFERENCES usuario(id),
  actor_rol     text,
  entidad_tipo  text NOT NULL,
  entidad_uid   uuid,
  -- Nunca contraseñas, hashes, tokens ni el contenido de archivos.
  detalle       jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Valores antes y después de un cambio (caja y moderación los usan).
  antes         jsonb,
  despues       jsonb,
  ip            inet,
  user_agent    text,
  creado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_auditoria_entidad ON auditoria (entidad_tipo, entidad_uid, creado_en DESC);
CREATE INDEX ix_auditoria_actor ON auditoria (actor_uid, creado_en DESC);
CREATE INDEX ix_auditoria_modulo_creado ON auditoria (modulo, creado_en DESC);
CREATE TRIGGER inmutable_auditoria BEFORE UPDATE OR DELETE ON auditoria FOR EACH ROW EXECUTE FUNCTION rechazar_cambio();
COMMENT ON TABLE auditoria IS '[plataforma] Auditoría de todas las acciones, también consultas y exportaciones de caja y moderación del mercado (UC-ADM-16, UC-CAJ-20, UC-MKT-44..46).';

CREATE TABLE articulo_faq (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria            text NOT NULL,
  idioma               text NOT NULL DEFAULT 'es' CHECK (idioma IN ('es','en','ht')),
  pregunta             text NOT NULL,
  respuesta            text NOT NULL,
  orden                integer NOT NULL DEFAULT 0,
  publicado            boolean NOT NULL DEFAULT false,
  version              integer NOT NULL DEFAULT 1 CHECK (version > 0),
  actualizado_por_uid  uuid REFERENCES usuario(id),
  creado_en            timestamptz NOT NULL DEFAULT now(),
  actualizado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_articulo_faq_publicado ON articulo_faq (idioma, categoria, orden) WHERE publicado;
COMMENT ON TABLE articulo_faq IS '[plataforma] Centro de ayuda / FAQ dentro de la app (UC-SUP-14, UC-CFG-12).';

-- Outbox transaccional: el cambio de negocio y su evento se guardan en la
-- misma transacción, y un publicador los manda después. Así no se pierde un
-- evento si el broker está caído ni se publica uno de algo que no se guardó.
CREATE TABLE outbox (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo            text NOT NULL,
  agregado_tipo     text NOT NULL,
  agregado_uid      uuid NOT NULL,
  agregado_version  integer NOT NULL CHECK (agregado_version > 0),
  tipo_evento       text NOT NULL,
  version_esquema   integer NOT NULL DEFAULT 1 CHECK (version_esquema > 0),
  correlacion_id    text,
  carga             jsonb NOT NULL,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  publicado_en      timestamptz,
  intentos          integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  ultimo_error      text,
  UNIQUE (agregado_tipo, agregado_uid, agregado_version)
);
CREATE INDEX ix_outbox_pendiente ON outbox (creado_en) WHERE publicado_en IS NULL;
COMMENT ON TABLE outbox IS '[plataforma] Eventos pendientes de publicar de todos los módulos.';

-- Los eventos llegan "al menos una vez": cada consumidor anota los que ya
-- procesó para no aplicarlos dos veces.
CREATE TABLE inbox_procesado (
  consumidor    text NOT NULL,
  mensaje_uid   uuid NOT NULL,
  procesado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumidor, mensaje_uid)
);
COMMENT ON TABLE inbox_procesado IS '[plataforma] Idempotencia de los consumidores de eventos.';

-- UC-FRD-13: la ubicación que manda el teléfono se compara con otras señales
-- antes de aceptar un viaje; la decisión queda registrada para revisarla.
CREATE TABLE evaluacion_riesgo (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_uid       uuid NOT NULL REFERENCES usuario(id),
  contexto_tipo     text NOT NULL CHECK (contexto_tipo IN ('aceptar_viaje','pago','registro','retiro')),
  contexto_id       uuid,
  puntuacion        numeric(5,4) NOT NULL CHECK (puntuacion BETWEEN 0 AND 1),
  senales           jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision          text NOT NULL CHECK (decision IN ('permitir','revisar','bloquear')),
  revisado_por_uid  uuid REFERENCES usuario(id),
  revisado_en       timestamptz,
  nota_revision     text,
  creado_en         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_evaluacion_riesgo_pendiente ON evaluacion_riesgo (creado_en) WHERE decision = 'revisar' AND revisado_en IS NULL;
COMMENT ON TABLE evaluacion_riesgo IS '[plataforma] Evaluaciones de riesgo y fraude (GPS falso, pagos sospechosos).';

-- >>> sql/03_companies.sql
-- =====================================================================
--  Empresa · dueño: user_service_admin (cuentas) + transport-service (uso)
--  UC-EMP-01..06, UC-ADM-81, UC-PAY-29
-- =====================================================================

CREATE TABLE empresa (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- La cuenta tipo `empresa` que la registró y la administra.
  dueno_uid                  uuid NOT NULL REFERENCES usuario(id),
  razon_social               text NOT NULL,
  nombre_comercial           text,
  rnc                        text,
  correo_facturacion         text,
  estado                     text NOT NULL DEFAULT 'pendiente_revision'
                             CHECK (estado IN ('pendiente_revision','activa','suspendida','rechazada')),
  -- Si está activo, un viaje pedido por un solicitante espera a un aprobador (UC-EMP-02).
  requiere_aprobacion_viaje  boolean NOT NULL DEFAULT false,
  creado_en                  timestamptz NOT NULL DEFAULT now(),
  actualizado_en             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_empresa_rnc_id CHECK (rnc IS NULL OR rnc ~ '^[0-9]{9}([0-9]{2})?$')
);
CREATE UNIQUE INDEX uq_empresa_rnc_id ON empresa (rnc) WHERE rnc IS NOT NULL;
COMMENT ON TABLE empresa IS '[empresa] Cuenta empresa con varios usuarios.';

CREATE TABLE empresa_miembro (
  empresa_id        uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  usuario_uid       uuid NOT NULL REFERENCES usuario(id),
  rol               text NOT NULL CHECK (rol IN ('administrador','solicitante','aprobador','contabilidad')),
  activo            boolean NOT NULL DEFAULT true,
  agregado_por_uid  uuid REFERENCES usuario(id),
  agregado_en       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, usuario_uid, rol)
);
CREATE INDEX ix_empresa_miembro_usuario ON empresa_miembro (usuario_uid);
COMMENT ON TABLE empresa_miembro IS '[empresa] Usuarios de la empresa y su rol interno (UC-EMP-01).';

CREATE TABLE centro_costo (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  codigo      text NOT NULL,
  nombre      text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo),
  -- Permite exigir que el centro de costo de un viaje sea de la misma empresa.
  UNIQUE (empresa_id, id)
);
COMMENT ON TABLE centro_costo IS '[empresa] Centros de costo / proyectos para agrupar viajes (UC-EMP-03).';

CREATE TABLE empresa_contrato (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL REFERENCES empresa(id),
  -- Nulo: tarifa negociada con BANEY. Con valor: con un transportista concreto.
  transportista_uid  uuid REFERENCES usuario(id),
  nombre             text NOT NULL,
  monto_base         numeric(14,2) NOT NULL CHECK (monto_base >= 0),
  precio_km          numeric(14,2) NOT NULL DEFAULT 0 CHECK (precio_km >= 0),
  moneda             codigo_moneda NOT NULL DEFAULT 'DOP',
  condiciones        jsonb NOT NULL DEFAULT '{}'::jsonb,
  vigente_desde      date NOT NULL,
  vigente_hasta      date,
  estado             text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','vigente','vencido','cancelado')),
  aprobado_por_uid   uuid REFERENCES usuario(id),
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_empresa_contrato_periodo CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);
CREATE INDEX ix_empresa_contrato ON empresa_contrato (empresa_id, estado);
COMMENT ON TABLE empresa_contrato IS '[empresa] Tarifas negociadas por contrato (UC-EMP-04, UC-ADM-81).';

CREATE TABLE linea_credito (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL UNIQUE REFERENCES empresa(id),
  limite_credito    numeric(14,2) NOT NULL CHECK (limite_credito > 0),
  moneda            codigo_moneda NOT NULL DEFAULT 'DOP',
  plazo_dias        integer NOT NULL CHECK (plazo_dias IN (15,30)),
  estado            text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','activa','suspendida','cerrada')),
  aprobado_por_uid  uuid REFERENCES usuario(id),
  aprobado_en       timestamptz,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE linea_credito IS '[empresa] Crédito con factura consolidada mensual a 15/30 días (UC-PAY-29).';

-- >>> sql/04_transport.sql
-- =====================================================================
--  Transporte · dueño: transport-service (Adrian)
--  UC-TRA-01..190, UC-DSP-17, UC-ADM-03/07/40/41/43/50
--  Los nombres de estados son los del dominio de transport-service
--  traducidos 1:1 (OPEN → abierta, ACCEPTED → aceptada...).
-- =====================================================================

CREATE TABLE zona_servicio (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           text NOT NULL,
  -- `zona_servicio`: donde BANEY opera (UC-TRA-41). `geocerca`: avisos de
  -- llegada o desvío alrededor de un punto.
  tipo             text NOT NULL CHECK (tipo IN ('zona_servicio','geocerca')),
  centro_latitud   latitud NOT NULL,
  centro_longitud  longitud NOT NULL,
  radio_metros     numeric(12,2) CHECK (radio_metros > 0),
  -- GeoJSON del polígono; sin PostGIS en el MVP, el cálculo fino lo hace la app.
  poligono         jsonb,
  activa           boolean NOT NULL DEFAULT true,
  creado_por_uid   uuid REFERENCES usuario(id),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_zona_servicio_forma CHECK (radio_metros IS NOT NULL OR poligono IS NOT NULL)
);
COMMENT ON TABLE zona_servicio IS '[transporte] Zonas de servicio y geocercas (UC-TRA-41).';

CREATE TABLE regla_precio (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           text NOT NULL,
  tipo_vehiculo    text CHECK (tipo_vehiculo IN ('volteo','plataforma','otro')),
  tipo_carga       text CHECK (tipo_carga IN ('materiales','agregados','maquinaria','otro')),
  monto_base       numeric(14,2) NOT NULL CHECK (monto_base >= 0),
  precio_km        numeric(14,2) NOT NULL CHECK (precio_km >= 0),
  precio_tonelada  numeric(14,2) NOT NULL DEFAULT 0 CHECK (precio_tonelada >= 0),
  minimo           numeric(14,2) NOT NULL DEFAULT 0 CHECK (minimo >= 0),
  moneda           codigo_moneda NOT NULL DEFAULT 'DOP',
  activa           boolean NOT NULL DEFAULT false,
  vigente_desde    timestamptz NOT NULL,
  vigente_hasta    timestamptz,
  creado_por_uid   uuid REFERENCES usuario(id),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_regla_precio_periodo CHECK (vigente_hasta IS NULL OR vigente_desde < vigente_hasta)
);
COMMENT ON TABLE regla_precio IS '[transporte] Reglas versionadas del precio sugerido del flete (UC-TRA-72/73/155).';

-- Un transportista independiente es su propio dueño de flota; un conductor de
-- flota (UC-DSP-17) apunta al dueño y solo ve los viajes que le asignan.
CREATE TABLE perfil_transportista (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_uid              uuid NOT NULL UNIQUE REFERENCES usuario(id),
  dueno_flota_uid          uuid NOT NULL REFERENCES usuario(id),
  estado                   text NOT NULL DEFAULT 'pendiente'
                           CHECK (estado IN ('pendiente','habilitado','deshabilitado','suspendido')),
  licencia_numero          text,
  licencia_categoria       text,
  licencia_vencimiento     date,
  -- UC-TRA-175: sin inducción no se puede activar.
  induccion_completada_en  timestamptz,
  disponible               boolean NOT NULL DEFAULT false,
  disponible_desde         timestamptz,
  distancia_max_km         numeric(10,2) CHECK (distancia_max_km > 0),
  tipos_carga_preferidos   text[] NOT NULL DEFAULT '{}'
                           CHECK (tipos_carga_preferidos <@ ARRAY['materiales','agregados','maquinaria','otro']::text[]),
  horario_trabajo          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Última posición conocida: el matching por cercanía no debe leer punto_rastreo.
  ultima_latitud           latitud,
  ultima_longitud          longitud,
  ultima_ubicacion_en      timestamptz,
  rating_promedio          numeric(3,2) NOT NULL DEFAULT 0 CHECK (rating_promedio BETWEEN 0 AND 5),
  total_resenas            integer NOT NULL DEFAULT 0 CHECK (total_resenas >= 0),
  creado_en                timestamptz NOT NULL DEFAULT now(),
  actualizado_en           timestamptz NOT NULL DEFAULT now(),
  eliminado_en             timestamptz,
  CONSTRAINT ck_perfil_transportista_disponible CHECK (NOT disponible OR estado = 'habilitado'),
  CONSTRAINT ck_perfil_transportista_activa CHECK (estado <> 'habilitado' OR induccion_completada_en IS NOT NULL)
);
CREATE INDEX ix_perfil_transportista_flota ON perfil_transportista (dueno_flota_uid);
CREATE INDEX ix_perfil_transportista_disponible ON perfil_transportista (ultima_latitud, ultima_longitud) WHERE disponible AND eliminado_en IS NULL;
COMMENT ON TABLE perfil_transportista IS '[transporte] Perfil operativo del transportista o conductor: estado, disponibilidad y preferencias (UC-TRA-19/24/175/178, UC-DSP-17).';

CREATE TABLE transportista_zona (
  perfil_transportista_id  uuid NOT NULL REFERENCES perfil_transportista(id) ON DELETE CASCADE,
  zona_servicio_id         uuid NOT NULL REFERENCES zona_servicio(id) ON DELETE CASCADE,
  PRIMARY KEY (perfil_transportista_id, zona_servicio_id)
);
COMMENT ON TABLE transportista_zona IS '[transporte] Zonas donde el transportista quiere trabajar (UC-TRA-178).';

CREATE TABLE vehiculo (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dueno_uid          uuid NOT NULL REFERENCES usuario(id),
  placa              text NOT NULL,
  -- Mayúsculas sin espacios ni guiones: "L-123" y "l 123" son la misma placa.
  placa_normalizada  text NOT NULL,
  tipo_carroceria    text NOT NULL CHECK (tipo_carroceria IN ('volteo','plataforma','otro')),
  capacidad          numeric(12,3) NOT NULL CHECK (capacidad > 0),
  unidad_capacidad   text NOT NULL CHECK (unidad_capacidad IN ('m3','ton','pie')),
  -- Carga útil legal: con ella se valida el peso declarado (UC-TRA-182).
  capacidad_kg       numeric(12,3) NOT NULL CHECK (capacidad_kg > 0),
  marca              text,
  modelo             text,
  anio               smallint CHECK (anio BETWEEN 1950 AND 2100),
  color              text,
  estado             text NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente','habilitado','deshabilitado','suspendido')),
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  eliminado_en       timestamptz,
  CONSTRAINT ck_vehiculo_placa CHECK (placa_normalizada ~ '^[A-Z0-9]+$'),
  CONSTRAINT ck_vehiculo_capacidad_unidad CHECK (
    (tipo_carroceria = 'volteo' AND unidad_capacidad = 'm3') OR
    (tipo_carroceria = 'plataforma' AND unidad_capacidad IN ('ton','pie')) OR
    tipo_carroceria = 'otro')
);
CREATE UNIQUE INDEX uq_vehiculo_placa ON vehiculo (placa_normalizada) WHERE eliminado_en IS NULL;
CREATE INDEX ix_vehiculo_dueno_estado ON vehiculo (dueno_uid, estado);
CREATE INDEX ix_vehiculo_matching ON vehiculo (estado, tipo_carroceria, capacidad_kg) WHERE eliminado_en IS NULL;
COMMENT ON TABLE vehiculo IS '[transporte] Camiones de la flota (UC-TRA-22/23, UC-TRA-182).';

CREATE TABLE vehiculo_documento (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehiculo_id        uuid NOT NULL REFERENCES vehiculo(id) ON DELETE CASCADE,
  tipo               text NOT NULL CHECK (tipo IN ('matricula','seguro_obligatorio','revista','permiso','otro')),
  url                text NOT NULL UNIQUE,
  fecha_vencimiento  date,
  estado             text NOT NULL DEFAULT 'pendiente_revision'
                     CHECK (estado IN ('pendiente_revision','aprobado','rechazado','vencido')),
  motivo_estado      text,
  subido_por_uid     uuid NOT NULL REFERENCES usuario(id),
  revisado_por_uid   uuid REFERENCES usuario(id),
  revisado_en        timestamptz,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  -- El seguro de la Ley 146-02 vence: sin fecha no se puede bloquear el camión a tiempo.
  CONSTRAINT ck_vehiculo_documento_seguro CHECK (tipo <> 'seguro_obligatorio' OR fecha_vencimiento IS NOT NULL)
);
CREATE INDEX ix_vehiculo_documento_vencimiento ON vehiculo_documento (fecha_vencimiento) WHERE estado = 'aprobado';
COMMENT ON TABLE vehiculo_documento IS '[transporte] Matrícula, seguro y permisos del camión, con vencimiento (UC-TRA-37, UC-TRA-176).';

CREATE TABLE vehiculo_foto (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehiculo_id  uuid NOT NULL REFERENCES vehiculo(id) ON DELETE CASCADE,
  url          text NOT NULL UNIQUE,
  orden        smallint NOT NULL DEFAULT 0,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE vehiculo_foto IS '[transporte] Fotos del camión que ve el cliente en la oferta (UC-TRA-177).';

-- Varios camiones para la misma carga (UC-TRA-167): cada camión es una
-- solicitud propia y el lote las agrupa.
CREATE TABLE lote_solicitud (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitante_uid    uuid NOT NULL REFERENCES usuario(id),
  cantidad_camiones  integer NOT NULL CHECK (cantidad_camiones BETWEEN 2 AND 100),
  creado_en          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE lote_solicitud IS '[transporte] Lote de solicitudes iguales para varios camiones (UC-TRA-167).';

CREATE TABLE solicitud_transporte (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitante_uid           uuid NOT NULL REFERENCES usuario(id),
  empresa_id                uuid REFERENCES empresa(id),
  centro_costo_id           uuid,
  lote_id                   uuid REFERENCES lote_solicitud(id),
  estado                    text NOT NULL DEFAULT 'borrador'
                            CHECK (estado IN ('borrador','abierta','en_matching','con_ofertas','asignada',
                                              'en_curso','completada','cancelada')),
  estado_aprobacion         text NOT NULL DEFAULT 'no_requerida'
                            CHECK (estado_aprobacion IN ('no_requerida','pendiente','aprobada','rechazada')),
  aprobado_por_uid          uuid REFERENCES usuario(id),
  aprobado_en               timestamptz,
  origen_direccion          text NOT NULL,
  origen_latitud            latitud NOT NULL,
  origen_longitud           longitud NOT NULL,
  destino_direccion         text NOT NULL,
  destino_latitud           latitud NOT NULL,
  destino_longitud          longitud NOT NULL,
  -- Ventana de recogida; también cubre el transporte programado (UC-TRA-52/53).
  ventana_recogida_desde    timestamptz NOT NULL,
  ventana_recogida_hasta    timestamptz NOT NULL,
  tipo_vehiculo_solicitado  text CHECK (tipo_vehiculo_solicitado IN ('volteo','plataforma','otro')),
  capacidad_solicitada_kg   numeric(12,3) CHECK (capacidad_solicitada_kg > 0),
  instrucciones_especiales  text,
  requisitos_sitio          jsonb NOT NULL DEFAULT '{}'::jsonb,
  receptor_nombre           text,
  receptor_telefono         text,
  regla_precio_id           uuid REFERENCES regla_precio(id),
  empresa_contrato_id       uuid REFERENCES empresa_contrato(id),
  monto_estimado            numeric(14,2) CHECK (monto_estimado >= 0),
  desglose_precio           jsonb,
  moneda                    codigo_moneda NOT NULL DEFAULT 'DOP',
  idempotency_key           text,
  -- version_fila: bloqueo optimista de la fila. agregado_version: versión de
  -- los eventos del agregado. Son contadores distintos a propósito.
  version_fila              integer NOT NULL DEFAULT 1 CHECK (version_fila > 0),
  agregado_version          integer NOT NULL DEFAULT 0 CHECK (agregado_version >= 0),
  cancelado_en              timestamptz,
  cancelado_por_uid         uuid REFERENCES usuario(id),
  motivo_cancelacion        text,
  creado_en                 timestamptz NOT NULL DEFAULT now(),
  actualizado_en            timestamptz NOT NULL DEFAULT now(),
  eliminado_en              timestamptz,
  CONSTRAINT ck_solicitud_transporte_ventana CHECK (ventana_recogida_desde < ventana_recogida_hasta),
  CONSTRAINT ck_solicitud_transporte_cancelado CHECK ((estado = 'cancelada') = (cancelado_en IS NOT NULL)),
  CONSTRAINT ck_solicitud_transporte_aprobacion CHECK (estado_aprobacion <> 'aprobada' OR aprobado_por_uid IS NOT NULL),
  CONSTRAINT ck_solicitud_transporte_costo_centro CHECK (centro_costo_id IS NULL OR empresa_id IS NOT NULL),
  FOREIGN KEY (empresa_id, centro_costo_id) REFERENCES centro_costo (empresa_id, id)
);
CREATE UNIQUE INDEX uq_solicitud_transporte_idempotencia ON solicitud_transporte (solicitante_uid, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND eliminado_en IS NULL;
CREATE INDEX ix_solicitud_transporte_solicitante_creado ON solicitud_transporte (solicitante_uid, creado_en DESC);
CREATE INDEX ix_solicitud_transporte_estado_ventana ON solicitud_transporte (estado, ventana_recogida_desde);
CREATE INDEX ix_solicitud_transporte_empresa ON solicitud_transporte (empresa_id, centro_costo_id) WHERE empresa_id IS NOT NULL;
COMMENT ON TABLE solicitud_transporte IS '[transporte] Solicitud de transporte: agregado raíz (UC-TRA-01..07, 51..56, 70..73, 165..167, UC-EMP-02/03).';

CREATE TABLE carga (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id     uuid NOT NULL UNIQUE REFERENCES solicitud_transporte(id) ON DELETE CASCADE,
  descripcion      text NOT NULL,
  -- Nulo mientras la solicitud es borrador; obligatorio antes del matching.
  tipo_carga       text CHECK (tipo_carga IN ('materiales','agregados','maquinaria','otro')),
  peso_kg          numeric(12,3) CHECK (peso_kg > 0),
  volumen_m3       numeric(12,3) CHECK (volumen_m3 > 0),
  cantidad         numeric(12,3) CHECK (cantidad > 0),
  unidad_cantidad  text,
  -- Valor declarado: base del seguro de carga (UC-SEG-01).
  valor_declarado  numeric(14,2) CHECK (valor_declarado >= 0),
  lista            boolean NOT NULL DEFAULT false,
  lista_en         timestamptz,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE carga IS '[transporte] Carga de la solicitud: tipo, peso, volumen, valor (UC-TRA-02/62/63/83).';

CREATE TABLE carga_foto (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id    uuid NOT NULL REFERENCES solicitud_transporte(id) ON DELETE CASCADE,
  url             text NOT NULL UNIQUE,
  subido_por_uid  uuid NOT NULL REFERENCES usuario(id),
  creado_en       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE carga_foto IS '[transporte] Fotos de la carga que adjunta el cliente (UC-TRA-65).';

CREATE TABLE solicitud_estado (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id     uuid NOT NULL REFERENCES solicitud_transporte(id) ON DELETE CASCADE,
  estado_anterior  text,
  estado_nuevo     text NOT NULL,
  actor_uid        uuid REFERENCES usuario(id),
  motivo           text,
  ocurrido_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_solicitud_estado ON solicitud_estado (solicitud_id, ocurrido_en);
COMMENT ON TABLE solicitud_estado IS '[transporte] Historial de estados de la solicitud; lo llena un trigger.';

CREATE TABLE candidato_matching (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id             uuid NOT NULL REFERENCES solicitud_transporte(id) ON DELETE CASCADE,
  perfil_transportista_id  uuid NOT NULL REFERENCES perfil_transportista(id),
  vehiculo_id              uuid NOT NULL REFERENCES vehiculo(id),
  puntuacion               numeric(5,4) NOT NULL CHECK (puntuacion BETWEEN 0 AND 1),
  distancia_km             numeric(12,3) CHECK (distancia_km >= 0),
  notificado_en            timestamptz,
  rechazado_en             timestamptz,
  motivo_rechazo           text,
  expira_en                timestamptz,
  creado_en                timestamptz NOT NULL DEFAULT now(),
  -- La vigencia depende del reloj y no cabe en un índice parcial: la app
  -- reutiliza o reemplaza el candidato de esa solicitud y ese camión.
  UNIQUE (solicitud_id, vehiculo_id)
);
CREATE INDEX ix_candidato_matching_solicitud_puntuacion ON candidato_matching (solicitud_id, puntuacion DESC);
COMMENT ON TABLE candidato_matching IS '[transporte] Camiones candidatos para una solicitud y su respuesta (UC-TRA-03/25/26/43/50/179).';

CREATE TABLE oferta_transporte (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id       uuid NOT NULL REFERENCES solicitud_transporte(id),
  transportista_uid  uuid NOT NULL REFERENCES usuario(id),
  vehiculo_id        uuid REFERENCES vehiculo(id),
  monto              numeric(14,2) NOT NULL CHECK (monto >= 0),
  moneda             codigo_moneda NOT NULL DEFAULT 'DOP',
  estado             text NOT NULL DEFAULT 'borrador'
                     CHECK (estado IN ('borrador','enviada','contraofertada','aceptada','rechazada','retirada','expirada')),
  vigente_hasta      timestamptz NOT NULL,
  oferta_padre_id    uuid REFERENCES oferta_transporte(id),
  propuesta_por      text CHECK (propuesta_por IN ('cliente','transportista')),
  ronda              integer NOT NULL DEFAULT 0 CHECK (ronda >= 0),
  mensaje            text,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  eliminado_en       timestamptz,
  CONSTRAINT ck_oferta_transporte_contraoferta CHECK (
    (estado <> 'contraofertada' OR oferta_padre_id IS NOT NULL) AND
    (ronda = 0 OR (oferta_padre_id IS NOT NULL AND propuesta_por IS NOT NULL)))
);
CREATE UNIQUE INDEX uq_oferta_transporte_aceptada ON oferta_transporte (solicitud_id) WHERE estado = 'aceptada' AND eliminado_en IS NULL;
CREATE INDEX ix_oferta_transporte_solicitud_creado ON oferta_transporte (solicitud_id, creado_en DESC);
CREATE INDEX ix_oferta_transporte_transportista_estado ON oferta_transporte (transportista_uid, estado);
CREATE INDEX ix_oferta_transporte_vencimiento ON oferta_transporte (vigente_hasta) WHERE estado = 'enviada' AND eliminado_en IS NULL;
COMMENT ON TABLE oferta_transporte IS '[transporte] Ofertas y contraofertas de precio (UC-TRA-04..06, 27, 44, 75).';

CREATE TABLE asignacion (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id             uuid NOT NULL REFERENCES solicitud_transporte(id),
  oferta_aceptada_id       uuid REFERENCES oferta_transporte(id),
  perfil_transportista_id  uuid NOT NULL REFERENCES perfil_transportista(id),
  vehiculo_id              uuid NOT NULL REFERENCES vehiculo(id),
  estado                   text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','liberada','completada')),
  asignada_en              timestamptz NOT NULL DEFAULT now(),
  liberada_en              timestamptz,
  motivo_liberacion        text,
  completado_en            timestamptz,
  CONSTRAINT ck_asignacion_liberado CHECK ((estado = 'liberada') = (liberada_en IS NOT NULL)),
  CONSTRAINT ck_asignacion_completado CHECK ((estado = 'completada') = (completado_en IS NOT NULL))
);
-- Nunca dos asignaciones activas para la misma solicitud. La reasignación
-- automática (UC-TRA-169) libera la anterior y crea otra.
CREATE UNIQUE INDEX uq_asignacion_activo ON asignacion (solicitud_id) WHERE estado = 'activa';
COMMENT ON TABLE asignacion IS '[transporte] Asignación de transportista y camión a una solicitud (UC-TRA-05, UC-TRA-169).';

CREATE TABLE ruta (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origen_latitud             latitud NOT NULL,
  origen_longitud            longitud NOT NULL,
  destino_latitud            latitud NOT NULL,
  destino_longitud           longitud NOT NULL,
  distancia_km               numeric(12,3) NOT NULL CHECK (distancia_km > 0),
  duracion_estimada_minutos  integer NOT NULL CHECK (duracion_estimada_minutos > 0),
  trazado                    text,
  proveedor                  text NOT NULL DEFAULT 'google_maps',
  ruta_proveedor_id          text,
  calculado_en               timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ruta IS '[transporte] Ruta calculada, distancia y duración (UC-TRA-45, 122, 123, UC-MAP-11/12).';

CREATE TABLE viaje (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id            uuid NOT NULL UNIQUE REFERENCES solicitud_transporte(id),
  asignacion_id           uuid NOT NULL UNIQUE REFERENCES asignacion(id),
  ruta_id                 uuid REFERENCES ruta(id),
  -- Cada paso del viaje en la app del transportista es un estado
  -- (UC-TRA-128..140): así el cliente y el panel ven dónde va.
  estado                  text NOT NULL DEFAULT 'programado'
                          CHECK (estado IN ('programado','hacia_origen','en_origen','cargado','en_transito',
                                            'en_destino','descargado','entregado','cancelado')),
  confirmado_en           timestamptz,
  salida_a_origen_en      timestamptz,
  llegada_origen_en       timestamptz,
  cargado_en              timestamptz,
  iniciado_en             timestamptz,
  llegada_destino_en      timestamptz,
  descargado_en           timestamptz,
  entregado_en            timestamptz,
  -- Código que el receptor dicta al entregar (UC-TRA-85/142); se guarda con hash.
  otp_entrega_hash        text,
  otp_entrega_intentos    smallint NOT NULL DEFAULT 0 CHECK (otp_entrega_intentos >= 0),
  recibido_por_nombre     text,
  recibido_por_documento  text,
  monto_acordado          numeric(14,2) NOT NULL CHECK (monto_acordado >= 0),
  moneda                  codigo_moneda NOT NULL DEFAULT 'DOP',
  cancelado_en            timestamptz,
  cancelado_por_uid       uuid REFERENCES usuario(id),
  motivo_cancelacion      text,
  -- Penalidad por cancelación tardía o con el viaje iniciado (UC-TRA-49/172/180).
  penalidad_cancelacion   numeric(14,2) NOT NULL DEFAULT 0 CHECK (penalidad_cancelacion >= 0),
  version_fila            integer NOT NULL DEFAULT 1 CHECK (version_fila > 0),
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_viaje_cancelado CHECK ((estado = 'cancelado') = (cancelado_en IS NOT NULL)),
  CONSTRAINT ck_viaje_entregado CHECK (estado <> 'entregado' OR entregado_en IS NOT NULL)
);
CREATE INDEX ix_viaje_estado ON viaje (estado) WHERE estado NOT IN ('entregado','cancelado');
COMMENT ON TABLE viaje IS '[transporte] Ejecución del viaje paso a paso (UC-TRA-08, 13, 28..30, 85, 128..142).';

CREATE TABLE viaje_evento (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viaje_id         uuid NOT NULL REFERENCES viaje(id) ON DELETE CASCADE,
  estado_anterior  text,
  estado_nuevo     text,
  tipo_evento      text NOT NULL,
  actor_uid        uuid REFERENCES usuario(id),
  -- Dónde estaba el teléfono al marcar el paso: base del anti-GPS falso.
  latitud          latitud,
  longitud         longitud,
  detalle          jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocurrido_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_viaje_evento ON viaje_evento (viaje_id, ocurrido_en);
COMMENT ON TABLE viaje_evento IS '[transporte] Línea de tiempo del viaje: check-in, carga, entrega, cancelación.';

CREATE TABLE viaje_evidencia (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viaje_id        uuid NOT NULL REFERENCES viaje(id) ON DELETE CASCADE,
  etapa           text NOT NULL CHECK (etapa IN ('recogida','entrega','incidente')),
  tipo            text NOT NULL CHECK (tipo IN ('foto','firma','ticket_bascula','documento')),
  url             text NOT NULL UNIQUE,
  subido_por_uid  uuid NOT NULL REFERENCES usuario(id),
  latitud         latitud,
  longitud        longitud,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_viaje_evidencia ON viaje_evidencia (viaje_id, etapa);
COMMENT ON TABLE viaje_evidencia IS '[transporte] Prueba de entrega (POD): fotos, firma, ticket de báscula (UC-TRA-14, 31, 86, 134, 141, 174).';

-- Conduce / carta de porte digital (UC-TRA-173/187): un documento por viaje,
-- firmado por las dos partes.
CREATE TABLE conduce (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viaje_id                  uuid NOT NULL UNIQUE REFERENCES viaje(id),
  numero                    text NOT NULL UNIQUE,
  datos                     jsonb NOT NULL,
  pdf_url                   text,
  firmado_transportista_en  timestamptz,
  firmado_receptor_en       timestamptz,
  creado_en                 timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE conduce IS '[transporte] Conduce digital del viaje.';

CREATE TABLE viaje_cargo (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viaje_id            uuid NOT NULL REFERENCES viaje(id) ON DELETE CASCADE,
  tipo                text NOT NULL CHECK (tipo IN ('espera','peaje','ayudante','gasto','otro')),
  monto               numeric(14,2) NOT NULL CHECK (monto > 0),
  moneda              codigo_moneda NOT NULL DEFAULT 'DOP',
  descripcion         text NOT NULL,
  minutos_espera      integer CHECK (minutos_espera > 0),
  recibo_url          text,
  estado              text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado')),
  solicitado_por_uid  uuid NOT NULL REFERENCES usuario(id),
  decidido_por_uid    uuid REFERENCES usuario(id),
  decidido_en         timestamptz,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_viaje_cargo_espera CHECK (tipo <> 'espera' OR minutos_espera IS NOT NULL)
);
CREATE INDEX ix_viaje_cargo ON viaje_cargo (viaje_id, estado);
COMMENT ON TABLE viaje_cargo IS '[transporte] Cargos adicionales en ruta que el cliente aprueba (UC-TRA-171, 181, 185).';

CREATE TABLE estimacion_eta (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viaje_id               uuid NOT NULL REFERENCES viaje(id) ON DELETE CASCADE,
  destino                text NOT NULL CHECK (destino IN ('origen','destino')),
  llegada_estimada_en    timestamptz NOT NULL,
  distancia_restante_km  numeric(12,3) CHECK (distancia_restante_km >= 0),
  proveedor              text NOT NULL DEFAULT 'google_maps',
  calculado_en           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_estimacion_eta_viaje ON estimacion_eta (viaje_id, calculado_en DESC);
COMMENT ON TABLE estimacion_eta IS '[transporte] ETA calculado durante el viaje (UC-TRA-09, UC-NOTIF-24).';

CREATE TABLE punto_rastreo (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viaje_id          uuid NOT NULL REFERENCES viaje(id) ON DELETE CASCADE,
  -- ID que genera el teléfono: el modo sin conexión (UC-TRA-183) reenvía
  -- puntos y deben insertarse con ON CONFLICT DO NOTHING.
  punto_origen_id   text NOT NULL,
  origen            text NOT NULL DEFAULT 'app' CHECK (origen IN ('app','gps_externo','proveedor')),
  latitud           latitud NOT NULL,
  longitud          longitud NOT NULL,
  precision_metros  numeric(10,2) CHECK (precision_metros >= 0),
  velocidad_kmh     numeric(6,2) CHECK (velocidad_kmh >= 0),
  rumbo             numeric(5,2) CHECK (rumbo >= 0 AND rumbo < 360),
  registrado_en     timestamptz NOT NULL,
  recibido_en       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (viaje_id, punto_origen_id)
);
CREATE INDEX ix_punto_rastreo_viaje_registrado ON punto_rastreo (viaje_id, registrado_en DESC);
COMMENT ON TABLE punto_rastreo IS '[transporte] Posiciones GPS del viaje (UC-TRA-08, 12, 46, 183).';

CREATE TABLE incidente (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viaje_id             uuid NOT NULL REFERENCES viaje(id),
  tipo                 text NOT NULL CHECK (tipo IN ('retraso','averia','accidente','desvio_ruta','mercancia_danada',
                                                     'mercancia_faltante','no_show_transportista','cliente_ausente',
                       'solicitud_ayuda','sos','otro')),
  reportado_por_uid    uuid NOT NULL REFERENCES usuario(id),
  reportante_rol       text NOT NULL CHECK (reportante_rol IN ('cliente','transportista','administrador')),
  gravedad             text NOT NULL DEFAULT 'media' CHECK (gravedad IN ('baja','media','alta','critica')),
  estado               text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','en_atencion','resuelto')),
  descripcion          text NOT NULL,
  latitud              latitud,
  longitud             longitud,
  ocurrido_en          timestamptz NOT NULL DEFAULT now(),
  clasificado_por_uid  uuid REFERENCES usuario(id),
  resuelta_por_uid     uuid REFERENCES usuario(id),
  resuelta_en          timestamptz,
  motivo_resolucion    text,
  creado_en            timestamptz NOT NULL DEFAULT now(),
  -- Un SOS siempre entra como crítico: no puede quedar en la cola normal.
  CONSTRAINT ck_incidente_sos CHECK (tipo <> 'sos' OR gravedad = 'critica'),
  CONSTRAINT ck_incidente_resuelto CHECK ((estado = 'resuelto') = (resuelta_en IS NOT NULL))
);
CREATE INDEX ix_incidente_abierto ON incidente (gravedad, ocurrido_en) WHERE estado <> 'resuelto';
CREATE INDEX ix_incidente_viaje ON incidente (viaje_id);
COMMENT ON TABLE incidente IS '[transporte] Incidentes del viaje y su clasificación (UC-TRA-36, 87..91, 143..154, UC-ADM-50).';

CREATE TABLE oferta_retorno (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_transportista_id  uuid NOT NULL REFERENCES perfil_transportista(id),
  vehiculo_id              uuid NOT NULL REFERENCES vehiculo(id),
  origen_direccion         text NOT NULL,
  origen_latitud           latitud NOT NULL,
  origen_longitud          longitud NOT NULL,
  destino_direccion        text NOT NULL,
  destino_latitud          latitud NOT NULL,
  destino_longitud         longitud NOT NULL,
  disponible_desde         timestamptz NOT NULL,
  disponible_hasta         timestamptz NOT NULL,
  capacidad_kg             numeric(12,3) NOT NULL CHECK (capacidad_kg > 0),
  estado                   text NOT NULL DEFAULT 'publicada' CHECK (estado IN ('publicada','tomada','vencida','retirada')),
  creado_en                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_oferta_retorno_ventana CHECK (disponible_desde < disponible_hasta)
);
CREATE INDEX ix_oferta_retorno_abierto ON oferta_retorno (disponible_desde) WHERE estado = 'publicada';
COMMENT ON TABLE oferta_retorno IS '[transporte] Disponibilidad de retorno publicada por el transportista (UC-TRA-32).';

-- Favoritos y bloqueados del cliente (UC-TRA-164/170): el matching prioriza
-- a los favoritos y nunca muestra ofertas de un bloqueado.
CREATE TABLE preferencia_transportista (
  cliente_uid        uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  transportista_uid  uuid NOT NULL REFERENCES usuario(id),
  tipo               text NOT NULL CHECK (tipo IN ('favorito','bloqueado')),
  motivo             text,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_uid, transportista_uid),
  CONSTRAINT ck_preferencia_transportista_mismo CHECK (cliente_uid <> transportista_uid)
);
COMMENT ON TABLE preferencia_transportista IS '[transporte] Transportistas favoritos o bloqueados por cada cliente.';

-- La solicitud y el viaje pasan por estados en orden: estas funciones evitan
-- que un servicio con un error deje una asignación o un viaje incoherente.
CREATE FUNCTION validar_asignacion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d perfil_transportista; v vehiculo;
BEGIN
  IF NEW.estado <> 'activa' THEN RETURN NEW; END IF;
  SELECT * INTO d FROM perfil_transportista WHERE id = NEW.perfil_transportista_id;
  SELECT * INTO v FROM vehiculo WHERE id = NEW.vehiculo_id;
  IF d.estado <> 'habilitado' OR v.estado <> 'habilitado' OR v.eliminado_en IS NOT NULL THEN
    RAISE EXCEPTION 'El transportista y el camión deben estar habilitados' USING ERRCODE = '23514';
  END IF;
  IF v.dueno_uid <> d.dueno_flota_uid THEN
    RAISE EXCEPTION 'El camión no pertenece a la flota del transportista' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validar_asignacion BEFORE INSERT OR UPDATE OF estado, perfil_transportista_id, vehiculo_id ON asignacion
  FOR EACH ROW EXECUTE FUNCTION validar_asignacion();

CREATE FUNCTION validar_viaje() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM asignacion a WHERE a.id = NEW.asignacion_id AND a.solicitud_id = NEW.solicitud_id) THEN
    RAISE EXCEPTION 'La asignación no corresponde a la solicitud del viaje' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validar_viaje BEFORE INSERT OR UPDATE OF asignacion_id, solicitud_id ON viaje
  FOR EACH ROW EXECUTE FUNCTION validar_viaje();

CREATE FUNCTION registrar_estado_solicitud() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO solicitud_estado (solicitud_id, estado_anterior, estado_nuevo, actor_uid, motivo)
    VALUES (NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.estado END, NEW.estado,
            CASE WHEN NEW.estado = 'cancelada' THEN NEW.cancelado_por_uid END,
            CASE WHEN NEW.estado = 'cancelada' THEN NEW.motivo_cancelacion END);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER registrar_estado_solicitud AFTER INSERT OR UPDATE OF estado ON solicitud_transporte
  FOR EACH ROW EXECUTE FUNCTION registrar_estado_solicitud();

-- >>> sql/05_catalog.sql
-- =====================================================================
--  Mercado: catálogo, vendedores y mapa · dueño: martketplace (Triana)
--  UC-MKT-01..07, 27..34, 43..47, UC-MAP-01..20, UC-ADM-04/05
-- =====================================================================

CREATE TABLE vendedor (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_uid       uuid NOT NULL UNIQUE REFERENCES usuario(id),
  nombre_negocio    text NOT NULL,
  slug              text NOT NULL UNIQUE,
  rnc               text,
  rnc_verificado    boolean NOT NULL DEFAULT false,
  logo_url          text,
  descripcion       text,
  provincia         text,
  municipio         text,
  -- Ubicación del negocio para filtrar por cercanía (UC-MKT-03). Los puntos
  -- que salen en el mapa son vendedor_ubicacion, que pasan por moderación.
  latitud           latitud,
  longitud          longitud,
  estado            text NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','aprobado','rechazado','suspendido')),
  motivo_estado     text,
  aprobado_por_uid  uuid REFERENCES usuario(id),
  aprobado_en       timestamptz,
  -- Contadores que mantiene el servicio para no agregar reseñas en cada listado.
  rating_promedio   numeric(3,2) NOT NULL DEFAULT 0 CHECK (rating_promedio BETWEEN 0 AND 5),
  total_resenas     integer NOT NULL DEFAULT 0 CHECK (total_resenas >= 0),
  total_productos   integer NOT NULL DEFAULT 0 CHECK (total_productos >= 0),
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_vendedor_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT ck_vendedor_aprobado CHECK (estado <> 'aprobado' OR aprobado_en IS NOT NULL),
  CONSTRAINT ck_vendedor_coordenadas CHECK ((latitud IS NULL) = (longitud IS NULL))
);
CREATE INDEX ix_vendedor_estado ON vendedor (estado);
CREATE INDEX ix_vendedor_geo ON vendedor (latitud, longitud) WHERE latitud IS NOT NULL;
COMMENT ON TABLE vendedor IS '[mercado] Tienda del vendedor y su aprobación (UC-MKT-05, 43, 46, UC-ADM-04).';

-- La finca o el punto de venta que aparece en el mapa puede no ser la
-- dirección fiscal; además el admin la modera antes de mostrarla (UC-MAP-20).
CREATE TABLE vendedor_ubicacion (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id        uuid NOT NULL REFERENCES vendedor(id) ON DELETE CASCADE,
  etiqueta           text NOT NULL,
  direccion          text NOT NULL,
  latitud            latitud NOT NULL,
  longitud           longitud NOT NULL,
  visible            boolean NOT NULL DEFAULT false,
  moderacion         text NOT NULL DEFAULT 'pendiente' CHECK (moderacion IN ('pendiente','aprobada','rechazada')),
  motivo_moderacion  text,
  moderado_por_uid   uuid REFERENCES usuario(id),
  moderado_en        timestamptz,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_vendedor_ubicacion_visible CHECK (NOT visible OR moderacion = 'aprobada')
);
CREATE INDEX ix_vendedor_ubicacion_mapa ON vendedor_ubicacion (latitud, longitud) WHERE visible;
COMMENT ON TABLE vendedor_ubicacion IS '[mapa] Ubicación del productor en el mapa y su moderación (UC-MAP-05, 09, 17..20).';

CREATE TABLE area (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  nombre     text NOT NULL,
  icono_url  text,
  orden      smallint NOT NULL DEFAULT 0,
  activa     boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE area IS '[mercado] Áreas comerciales de la barra del catálogo (Lácteos, Apicultura...).';

CREATE TABLE categoria (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  padre_id   uuid REFERENCES categoria(id),
  slug       text NOT NULL UNIQUE,
  nombre     text NOT NULL,
  -- Ruta materializada ("frutas/citricos") para filtrar un árbol sin recursión.
  ruta       text NOT NULL,
  nivel      smallint NOT NULL DEFAULT 0 CHECK (nivel BETWEEN 0 AND 5),
  orden      smallint NOT NULL DEFAULT 0,
  activa     boolean NOT NULL DEFAULT true,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_categoria_padre CHECK (padre_id IS DISTINCT FROM id)
);
CREATE INDEX ix_categoria_ruta ON categoria (ruta text_pattern_ops);
COMMENT ON TABLE categoria IS '[mercado] Árbol de categorías (UC-MKT-02, 31, 47).';

CREATE TABLE producto (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id        uuid NOT NULL REFERENCES vendedor(id),
  categoria_id       uuid NOT NULL REFERENCES categoria(id),
  area_id            uuid REFERENCES area(id),
  nombre             text NOT NULL,
  slug               text NOT NULL UNIQUE,
  descripcion        text,
  unidad_medida      text NOT NULL DEFAULT 'unidad'
                     CHECK (unidad_medida IN ('unidad','libra','quintal','caja','saco','racimo','docena',
                                              'litro','galon','kilogramo')),
  -- La mayoría de los productos agropecuarios sin procesar están exentos de
  -- ITBIS (art. 343 del Código Tributario): asumir 18% sobrefactura al
  -- comprador y rompe el reporte a la DGII. Facturación lee este campo.
  regimen_itbis      text NOT NULL DEFAULT 'exento' CHECK (regimen_itbis IN ('exento','gravado','tasa_cero')),
  estado             text NOT NULL DEFAULT 'borrador'
                     CHECK (estado IN ('borrador','publicado','agotado','suspendido','archivado')),
  moderacion         text NOT NULL DEFAULT 'pendiente'
                     CHECK (moderacion IN ('no_requerida','pendiente','aprobada','rechazada')),
  motivo_moderacion  text,
  es_temporada       boolean NOT NULL DEFAULT false,
  temporada_desde    date,
  temporada_hasta    date,
  origen_provincia   text,
  rating_promedio    numeric(3,2) NOT NULL DEFAULT 0 CHECK (rating_promedio BETWEEN 0 AND 5),
  total_resenas      integer NOT NULL DEFAULT 0 CHECK (total_resenas >= 0),
  -- Copia para ordenar por "más vendidos" sin sumar pedidos en cada listado.
  total_vendido      bigint NOT NULL DEFAULT 0 CHECK (total_vendido >= 0),
  publicado_en       timestamptz,
  -- Borrado lógico: nunca DELETE, hay pedidos que apuntan al producto.
  archivado_en       timestamptz,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  -- Un producto solo se publica después de pasar moderación (o si no la necesita).
  CONSTRAINT ck_producto_publicado CHECK (estado <> 'publicado' OR moderacion IN ('aprobada','no_requerida')),
  CONSTRAINT ck_producto_temporada CHECK (NOT es_temporada OR (temporada_desde IS NOT NULL AND temporada_hasta IS NOT NULL))
);
CREATE INDEX ix_producto_catalogo ON producto (categoria_id, estado) WHERE estado = 'publicado';
CREATE INDEX ix_producto_vendedor ON producto (vendedor_id, estado);
CREATE INDEX ix_producto_area ON producto (area_id, estado);
CREATE INDEX ix_producto_listado ON producto (estado, moderacion, publicado_en);
CREATE INDEX ix_producto_temporada ON producto (es_temporada, estado);
CREATE INDEX ix_producto_busqueda ON producto USING gin (to_tsvector('spanish', nombre || ' ' || coalesce(descripcion, '')));
COMMENT ON TABLE producto IS '[mercado] Producto publicado por un vendedor (UC-MKT-01, 04, 27..29, 44, 45, UC-ADM-05).';

CREATE TABLE producto_foto (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id   uuid NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
  url           text NOT NULL UNIQUE,
  url_thumb     text,
  texto_alt     text,
  orden         smallint NOT NULL DEFAULT 0,
  es_principal  boolean NOT NULL DEFAULT false,
  bytes         integer CHECK (bytes > 0),
  creado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_producto_foto_principal ON producto_foto (producto_id) WHERE es_principal;
COMMENT ON TABLE producto_foto IS '[mercado] Fotos del producto (UC-MKT-30).';

-- La variante (SKU) es la unidad real de venta: precio y stock cuelgan de
-- aquí. Un producto sin variantes se crea con una variante "Única", para que
-- no haya dos caminos de código.
CREATE TABLE variante (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id         uuid NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
  sku                 text NOT NULL UNIQUE,
  nombre              text NOT NULL DEFAULT 'Única',
  atributos           jsonb NOT NULL DEFAULT '{}'::jsonb,
  precio              numeric(14,2) NOT NULL CHECK (precio >= 0),
  precio_comparacion  numeric(14,2),
  moneda              codigo_moneda NOT NULL DEFAULT 'DOP',
  peso_kg             numeric(10,3) CHECK (peso_kg > 0),
  volumen_m3          numeric(10,4) CHECK (volumen_m3 > 0),
  cantidad_minima     integer NOT NULL DEFAULT 1 CHECK (cantidad_minima > 0),
  cantidad_maxima     integer,
  activa              boolean NOT NULL DEFAULT true,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  actualizado_en      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_variante_comparacion CHECK (precio_comparacion IS NULL OR precio_comparacion > precio),
  CONSTRAINT ck_variante_cantidad CHECK (cantidad_maxima IS NULL OR cantidad_maxima >= cantidad_minima)
);
CREATE INDEX ix_variante ON variante (producto_id) WHERE activa;
CREATE INDEX ix_variante_precio ON variante (precio);
COMMENT ON TABLE variante IS '[mercado] Variantes vendibles: tamaño, presentación, precio (UC-MKT-07, 32, 33).';

CREATE TABLE variante_precio_historial (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variante_id      uuid NOT NULL REFERENCES variante(id) ON DELETE CASCADE,
  precio_anterior  numeric(14,2),
  precio_nuevo     numeric(14,2) NOT NULL,
  actor_uid        uuid REFERENCES usuario(id),
  motivo           text,
  creado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_variante_precio_historial ON variante_precio_historial (variante_id, creado_en DESC);
COMMENT ON TABLE variante_precio_historial IS '[mercado] Historial de precios de cada variante.';

CREATE TABLE subasta (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id        uuid NOT NULL REFERENCES producto(id),
  variante_id        uuid REFERENCES variante(id),
  cantidad           integer NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  monto_inicial      numeric(14,2) NOT NULL CHECK (monto_inicial > 0),
  incremento_minimo  numeric(14,2) NOT NULL CHECK (incremento_minimo > 0),
  moneda             codigo_moneda NOT NULL DEFAULT 'DOP',
  inicia_en          timestamptz NOT NULL,
  termina_en         timestamptz NOT NULL,
  estado             text NOT NULL DEFAULT 'programada'
                     CHECK (estado IN ('programada','abierta','cerrada','cancelada')),
  puja_ganadora_id   uuid,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_subasta_periodo CHECK (inicia_en < termina_en)
);
COMMENT ON TABLE subasta IS '[mercado] Subastas de productos (función existente en martketplace).';

CREATE TABLE puja (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subasta_id  uuid NOT NULL REFERENCES subasta(id),
  postor_uid  uuid NOT NULL REFERENCES usuario(id),
  monto       numeric(14,2) NOT NULL CHECK (monto > 0),
  creado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subasta_id, id)
);
CREATE INDEX ix_puja_monto ON puja (subasta_id, monto DESC);
COMMENT ON TABLE puja IS '[mercado] Pujas: solo inserción, la mayor gana.';

-- El ganador tiene que ser una puja de esa misma subasta; por eso la FK es
-- compuesta. Diferible porque subasta y puja se cierran en la misma transacción.
ALTER TABLE subasta ADD CONSTRAINT fk_subasta_ganadora
  FOREIGN KEY (id, puja_ganadora_id) REFERENCES puja (subasta_id, id) DEFERRABLE INITIALLY IMMEDIATE;

CREATE FUNCTION validar_puja() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a subasta; highest numeric;
BEGIN
  SELECT * INTO a FROM subasta WHERE id = NEW.subasta_id FOR UPDATE;
  IF a.estado <> 'abierta' OR clock_timestamp() < a.inicia_en OR clock_timestamp() >= a.termina_en THEN
    RAISE EXCEPTION 'La subasta no está abierta' USING ERRCODE = '23514';
  END IF;
  SELECT max(monto) INTO highest FROM puja WHERE subasta_id = NEW.subasta_id;
  IF NEW.monto < coalesce(highest + a.incremento_minimo, a.monto_inicial) THEN
    RAISE EXCEPTION 'La puja no alcanza el mínimo' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validar_puja BEFORE INSERT ON puja FOR EACH ROW EXECUTE FUNCTION validar_puja();
CREATE TRIGGER inmutable_puja BEFORE UPDATE OR DELETE ON puja FOR EACH ROW EXECUTE FUNCTION rechazar_cambio();

CREATE TABLE pedido_urgente (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitante_uid  uuid NOT NULL REFERENCES usuario(id),
  categoria_id     uuid REFERENCES categoria(id),
  descripcion      text NOT NULL,
  cantidad         numeric(12,3) CHECK (cantidad > 0),
  unidad_medida    text,
  presupuesto      numeric(14,2) CHECK (presupuesto > 0),
  moneda           codigo_moneda NOT NULL DEFAULT 'DOP',
  requerido_para   timestamptz NOT NULL,
  estado           text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','atendida','vencida','cancelada')),
  creado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_pedido_urgente_abierto ON pedido_urgente (requerido_para) WHERE estado = 'abierta';
COMMENT ON TABLE pedido_urgente IS '[mercado] Pedidos urgentes publicados por compradores (función existente en martketplace).';

-- >>> sql/06_promotions.sql
-- =====================================================================
--  Cupones, descuentos y referidos · dueño: admin-service + martketplace
--  UC-MKT-11/34, UC-ADM-79/80
--  Un solo cupón sirve para mercado y transporte: antes cada módulo tenía
--  su propia tabla y un mismo código podía significar cosas distintas.
-- =====================================================================

CREATE TABLE cupon (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo            text NOT NULL,
  descripcion       text,
  emisor_tipo       text NOT NULL CHECK (emisor_tipo IN ('plataforma','vendedor')),
  vendedor_id       uuid REFERENCES vendedor(id),
  aplica_a          text NOT NULL CHECK (aplica_a IN ('mercado','transporte','ambos')),
  tipo              text NOT NULL CHECK (tipo IN ('porcentaje','monto_fijo','envio_gratis')),
  valor             numeric(14,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  compra_minima     numeric(14,2) NOT NULL DEFAULT 0 CHECK (compra_minima >= 0),
  descuento_maximo  numeric(14,2) CHECK (descuento_maximo > 0),
  -- Nulo = ilimitado. usos_actuales se sube con UPDATE ... WHERE usos_actuales <
  -- usos_max, nunca leyendo y escribiendo: dos compras a la vez no pasan del límite.
  usos_max          integer CHECK (usos_max > 0),
  usos_max_usuario  integer NOT NULL DEFAULT 1 CHECK (usos_max_usuario > 0),
  usos_actuales     integer NOT NULL DEFAULT 0 CHECK (usos_actuales >= 0),
  vigente_desde     timestamptz NOT NULL,
  vigente_hasta     timestamptz,
  activo            boolean NOT NULL DEFAULT true,
  creado_por_uid    uuid REFERENCES usuario(id),
  creado_en         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_cupon_emisor_tipo CHECK ((emisor_tipo = 'vendedor') = (vendedor_id IS NOT NULL)),
  CONSTRAINT ck_cupon_vendedor_mercado CHECK (emisor_tipo <> 'vendedor' OR aplica_a = 'mercado'),
  CONSTRAINT ck_cupon_porcentaje CHECK (tipo <> 'porcentaje' OR valor BETWEEN 0 AND 100),
  CONSTRAINT ck_cupon_usos CHECK (usos_max IS NULL OR usos_actuales <= usos_max),
  CONSTRAINT ck_cupon_periodo CHECK (vigente_hasta IS NULL OR vigente_desde < vigente_hasta)
);
CREATE UNIQUE INDEX uq_cupon_codigo ON cupon (upper(codigo));
COMMENT ON TABLE cupon IS '[promociones] Cupones de la plataforma o de un vendedor (UC-MKT-11, UC-ADM-79/80).';

CREATE TABLE descuento (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id    uuid NOT NULL REFERENCES vendedor(id),
  nombre         text NOT NULL,
  tipo           text NOT NULL CHECK (tipo IN ('porcentaje','monto_fijo')),
  valor          numeric(14,2) NOT NULL CHECK (valor > 0),
  alcance        text NOT NULL CHECK (alcance IN ('vendedor','categoria','producto','variante')),
  vigente_desde  timestamptz NOT NULL,
  vigente_hasta  timestamptz,
  activo         boolean NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_descuento_porcentaje CHECK (tipo <> 'porcentaje' OR valor <= 100),
  CONSTRAINT ck_descuento_periodo CHECK (vigente_hasta IS NULL OR vigente_desde < vigente_hasta)
);
CREATE INDEX ix_descuento_vendedor ON descuento (vendedor_id) WHERE activo;
COMMENT ON TABLE descuento IS '[promociones] Descuentos que aplica el vendedor sin código (UC-MKT-34).';

CREATE TABLE descuento_objetivo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descuento_id  uuid NOT NULL REFERENCES descuento(id) ON DELETE CASCADE,
  categoria_id  uuid REFERENCES categoria(id),
  producto_id   uuid REFERENCES producto(id),
  variante_id   uuid REFERENCES variante(id),
  -- Exactamente un objetivo por fila.
  CONSTRAINT ck_descuento_objetivo_uno CHECK (num_nonnulls(categoria_id, producto_id, variante_id) = 1)
);
COMMENT ON TABLE descuento_objetivo IS '[promociones] A qué categorías, productos o variantes aplica un descuento.';

CREATE TABLE codigo_referido (
  usuario_uid  uuid PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
  codigo       text NOT NULL UNIQUE,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE codigo_referido IS '[promociones] Código de referido de cada persona (UC-ADM-79).';

CREATE TABLE referido (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referidor_uid     uuid NOT NULL REFERENCES usuario(id),
  -- Una persona solo puede llegar referida una vez.
  referido_uid      uuid NOT NULL UNIQUE REFERENCES usuario(id),
  estado            text NOT NULL DEFAULT 'registrado' CHECK (estado IN ('registrado','calificado','recompensado','anulado')),
  monto_recompensa  numeric(14,2) CHECK (monto_recompensa >= 0),
  moneda            codigo_moneda NOT NULL DEFAULT 'DOP',
  recompensado_en   timestamptz,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_referido_mismo CHECK (referidor_uid <> referido_uid)
);
COMMENT ON TABLE referido IS '[promociones] Referidos y su recompensa.';

-- >>> sql/07_inventory.sql
-- =====================================================================
--  Inventario · dueño: martketplace (Triana)
--  UC-MKT-06, 35, 57, 58
-- =====================================================================

-- El stock son DOS números: `disponible` es lo que se puede vender ahora y
-- `reservado` lo que alguien tiene apartado mientras paga. Reservar pasa
-- unidades de uno al otro con un UPDATE condicional:
--   UPDATE existencia SET available = available - :n, reserved = reserved + :n,
--          version_fila = version_fila + 1
--    WHERE variante_id = :v AND available >= :n AND version_fila = :leida;
-- Si no toca filas, otro comprador ganó la carrera (UC-MKT-57).
CREATE TABLE existencia (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variante_id         uuid NOT NULL UNIQUE REFERENCES variante(id),
  disponible          integer NOT NULL DEFAULT 0 CHECK (disponible >= 0),
  reservado           integer NOT NULL DEFAULT 0 CHECK (reservado >= 0),
  -- 0 = sin alerta.
  umbral_alerta       integer NOT NULL DEFAULT 0 CHECK (umbral_alerta >= 0),
  -- Cosecha por encargo: se ofrece aunque no haya existencia.
  permite_sobreventa  boolean NOT NULL DEFAULT false,
  ubicacion           text,
  version             integer NOT NULL DEFAULT 1 CHECK (version > 0),
  creado_en           timestamptz NOT NULL DEFAULT now(),
  actualizado_en      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE existencia IS '[inventario] Existencia y reservas por variante (UC-MKT-06, 35).';

CREATE TABLE reserva (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  existencia_id  uuid NOT NULL REFERENCES existencia(id),
  cantidad       integer NOT NULL CHECK (cantidad > 0),
  origen_tipo    text NOT NULL CHECK (origen_tipo IN ('carrito','pedido')),
  -- Las FK al carrito y al pedido se agregan en sus archivos (se crean después).
  carrito_id     uuid,
  pedido_id      uuid,
  estado         text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','confirmada','liberada','expirada')),
  expira_en      timestamptz NOT NULL,
  confirmada_en  timestamptz,
  liberada_en    timestamptz,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_reserva_origen CHECK (
    (origen_tipo = 'carrito' AND carrito_id IS NOT NULL) OR (origen_tipo = 'pedido' AND pedido_id IS NOT NULL))
);
CREATE INDEX ix_reserva_vencen ON reserva (expira_en) WHERE estado = 'activa';
-- Un carrito o pedido aparta cada variante una sola vez.
CREATE UNIQUE INDEX uq_reserva_origen ON reserva (origen_tipo, coalesce(carrito_id, pedido_id), existencia_id);
COMMENT ON TABLE reserva IS '[inventario] Stock apartado durante el checkout (UC-MKT-58).';

CREATE TABLE movimiento_stock (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  existencia_id    uuid NOT NULL REFERENCES existencia(id),
  tipo             text NOT NULL CHECK (tipo IN ('ingreso','venta','devolucion','ajuste_positivo','ajuste_negativo',
                                                 'merma','reserva','liberacion_reserva')),
  -- Con signo: +50 ingreso, -3 venta. saldo_despues permite reconstruir el
  -- inventario a cualquier fecha y detectar si existencia se desincronizó.
  cantidad_delta   integer NOT NULL CHECK (cantidad_delta <> 0),
  saldo_despues    integer NOT NULL,
  referencia_tipo  text NOT NULL CHECK (referencia_tipo IN ('pedido','suborden','devolucion','reserva','manual','importacion')),
  referencia_id    uuid,
  motivo           text,
  actor_uid        uuid REFERENCES usuario(id),
  creado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_movimiento_stock_item ON movimiento_stock (existencia_id, creado_en DESC);
-- Un reintento del mismo evento no duplica el movimiento.
CREATE UNIQUE INDEX uq_movimiento_stock_idempotente ON movimiento_stock (referencia_tipo, referencia_id, existencia_id, tipo)
  WHERE referencia_id IS NOT NULL;
CREATE TRIGGER inmutable_movimiento_stock BEFORE UPDATE OR DELETE ON movimiento_stock
  FOR EACH ROW EXECUTE FUNCTION rechazar_cambio();
COMMENT ON TABLE movimiento_stock IS '[inventario] Kárdex: cada cambio de stock con su motivo.';

CREATE TABLE alerta_stock (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  existencia_id         uuid NOT NULL REFERENCES existencia(id),
  tipo                  text NOT NULL CHECK (tipo IN ('bajo_umbral','agotado')),
  disponible_en_alerta  integer NOT NULL,
  notificado_en         timestamptz,
  resuelta_en           timestamptz,
  creado_en             timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_alerta_stock_abierto ON alerta_stock (existencia_id, tipo) WHERE resuelta_en IS NULL;
COMMENT ON TABLE alerta_stock IS '[inventario] Avisos de stock bajo o agotado al vendedor.';

-- >>> sql/08_cart.sql
-- =====================================================================
--  Carrito y checkout · dueño: martketplace (Triana)
--  UC-MKT-08..18, 57, 58
-- =====================================================================

CREATE TABLE carrito (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nulo para un carrito de invitado; al iniciar sesión se fusiona.
  usuario_uid        uuid REFERENCES usuario(id),
  token_sesion_hash  text,
  estado             text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','convertido','abandonado','fusionado')),
  moneda             codigo_moneda NOT NULL DEFAULT 'DOP',
  cupon_id           uuid REFERENCES cupon(id),
  cupon_descuento    numeric(14,2) NOT NULL DEFAULT 0 CHECK (cupon_descuento >= 0),
  direccion_id       uuid REFERENCES direccion(id),
  fusionado_en_id    uuid REFERENCES carrito(id),
  expira_en          timestamptz NOT NULL,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_carrito_dueno CHECK (usuario_uid IS NOT NULL OR token_sesion_hash IS NOT NULL),
  CONSTRAINT ck_carrito_fusionado CHECK ((estado = 'fusionado') = (fusionado_en_id IS NOT NULL))
);
CREATE UNIQUE INDEX uq_carrito_activo_usuario ON carrito (usuario_uid) WHERE estado = 'activo' AND usuario_uid IS NOT NULL;
CREATE INDEX ix_carrito_vencen ON carrito (expira_en) WHERE estado = 'activo';
COMMENT ON TABLE carrito IS '[carrito] Carrito de compra (UC-MKT-08..11).';

CREATE TABLE carrito_item (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrito_id          uuid NOT NULL REFERENCES carrito(id) ON DELETE CASCADE,
  variante_id         uuid NOT NULL REFERENCES variante(id),
  vendedor_id         uuid NOT NULL REFERENCES vendedor(id),
  cantidad            integer NOT NULL CHECK (cantidad > 0),
  -- Copias tomadas al agregar: entre agregar y pagar pueden pasar horas y, si
  -- el vendedor cambia el precio, el carrito no cambia solo; se avisa al
  -- confirmar. Sin copia, el comprador ve un total y paga otro.
  sku_snapshot        text NOT NULL,
  nombre_snapshot     text NOT NULL,
  variante_snapshot   text NOT NULL,
  foto_snapshot       text,
  precio_snapshot     numeric(14,2) NOT NULL CHECK (precio_snapshot >= 0),
  unidad_snapshot     text NOT NULL,
  regimen_itbis       text NOT NULL DEFAULT 'exento' CHECK (regimen_itbis IN ('exento','gravado','tasa_cero')),
  peso_kg_snapshot    numeric(10,3) CHECK (peso_kg_snapshot > 0),
  descuento_unitario  numeric(14,2) NOT NULL DEFAULT 0 CHECK (descuento_unitario >= 0),
  -- Se refrescan al abrir el carrito; si el precio difiere o no hay stock, se avisa (UC-MKT-57).
  precio_actual       numeric(14,2),
  disponible_actual   integer,
  agregado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (carrito_id, variante_id)
);
CREATE INDEX ix_carrito_item_vendedor ON carrito_item (carrito_id, vendedor_id);
COMMENT ON TABLE carrito_item IS '[carrito] Líneas del carrito con el precio y los datos vistos al agregar (UC-MKT-08..10).';

CREATE TABLE cotizacion_transporte (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrito_id     uuid NOT NULL REFERENCES carrito(id) ON DELETE CASCADE,
  vendedor_id    uuid NOT NULL REFERENCES vendedor(id),
  origen_texto   text NOT NULL,
  origen_lat     latitud,
  origen_lng     longitud,
  destino_texto  text NOT NULL,
  destino_lat    latitud,
  destino_lng    longitud,
  distancia_km   numeric(10,2) CHECK (distancia_km >= 0),
  ruta_id        uuid REFERENCES ruta(id),
  peso_total_kg  numeric(12,3) CHECK (peso_total_kg > 0),
  tipo_vehiculo  text CHECK (tipo_vehiculo IN ('volteo','plataforma','otro')),
  costo          numeric(14,2) NOT NULL CHECK (costo >= 0),
  moneda         codigo_moneda NOT NULL DEFAULT 'DOP',
  -- Respuesta del cálculo de transporte, tal cual.
  desglose       jsonb,
  -- Una cotización vencida no se cobra: se recotiza antes de crear el pedido.
  vigente_hasta  timestamptz NOT NULL,
  creado_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_cotizacion_transporte_carrito ON cotizacion_transporte (carrito_id, vendedor_id, vigente_hasta);
COMMENT ON TABLE cotizacion_transporte IS '[carrito] Cotización del transporte de una tienda al comprador, con vencimiento (UC-MKT-15).';

-- Cada tienda del carrito entrega por separado: modalidad, dirección y costo.
CREATE TABLE carrito_entrega (
  carrito_id          uuid NOT NULL REFERENCES carrito(id) ON DELETE CASCADE,
  vendedor_id         uuid NOT NULL REFERENCES vendedor(id),
  modalidad           text NOT NULL DEFAULT 'envio_baney' CHECK (modalidad IN ('envio_baney','retiro_local','acuerdo_vendedor')),
  direccion_id        uuid REFERENCES direccion(id),
  punto_retiro_id     uuid REFERENCES vendedor_ubicacion(id),
  punto_retiro_texto  text,
  cotizacion_id       uuid REFERENCES cotizacion_transporte(id),
  costo_transporte    numeric(14,2) NOT NULL DEFAULT 0 CHECK (costo_transporte >= 0),
  eta_minutos         integer CHECK (eta_minutos > 0),
  ventana_desde       timestamptz,
  ventana_hasta       timestamptz,
  notas               text,
  actualizado_en      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (carrito_id, vendedor_id),
  CONSTRAINT ck_carrito_entrega_modalidad CHECK (
    (modalidad = 'envio_baney' AND direccion_id IS NOT NULL) OR
    (modalidad = 'retiro_local' AND (punto_retiro_id IS NOT NULL OR punto_retiro_texto IS NOT NULL)) OR
    modalidad = 'acuerdo_vendedor')
);
COMMENT ON TABLE carrito_entrega IS '[carrito] Entrega o retiro elegido por tienda (UC-MKT-12..14).';

-- El checkout puede repetirse por un reintento de red; la clave de
-- idempotencia hace que el segundo intento devuelva el mismo pedido.
CREATE TABLE intento_checkout (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrito_id       uuid NOT NULL REFERENCES carrito(id),
  idempotency_key  text NOT NULL UNIQUE,
  -- Por qué falló: sin esto nadie sabe cuántos carritos se pierden por stock
  -- y cuántos por tarjeta rechazada.
  resultado        text NOT NULL DEFAULT 'iniciado'
                   CHECK (resultado IN ('iniciado','ok','fallo_stock','fallo_precio','fallo_cupon','fallo_pago',
                                        'fallo_transporte','expirado')),
  detalle          jsonb,
  pedido_id        uuid,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  finalizado_en    timestamptz
);
CREATE INDEX ix_intento_checkout_carrito ON intento_checkout (carrito_id, creado_en);
COMMENT ON TABLE intento_checkout IS '[carrito] Intentos de checkout y su resultado (UC-MKT-16).';

ALTER TABLE reserva ADD CONSTRAINT fk_reserva_carrito FOREIGN KEY (carrito_id) REFERENCES carrito(id);

-- >>> sql/09_orders.sql
-- =====================================================================
--  Pedidos y devoluciones · dueño: martketplace (Triana)
--  UC-MKT-18..26, 36..42, 55, 56, UC-ADM-06/09
--  Un pedido se divide en una suborden por vendedor (UC-MKT-55/56): cada
--  vendedor acepta, prepara y despacha lo suyo.
-- =====================================================================

CREATE TABLE pedido (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero              text NOT NULL UNIQUE,
  comprador_uid       uuid NOT NULL REFERENCES usuario(id),
  carrito_id          uuid REFERENCES carrito(id),
  estado              text NOT NULL DEFAULT 'creado'
                      CHECK (estado IN ('creado','pago_pendiente','pagado','en_preparacion','parcialmente_despachado',
                                        'despachado','completado','cancelado','reembolsado')),
  idempotency_key     text NOT NULL UNIQUE,
  -- Datos del comprador al momento de comprar: la factura no cambia si
  -- después edita su perfil.
  comprador_nombre    text NOT NULL,
  comprador_email     text,
  comprador_telefono  text,
  -- Si pide factura con crédito fiscal (B01).
  comprador_rnc       text,
  -- Copia completa: la dirección puede borrarse después.
  direccion_envio     jsonb,
  requiere_factura    boolean NOT NULL DEFAULT false,
  cupon_id            uuid REFERENCES cupon(id),
  cupon_codigo        text,
  -- Suma de las subórdenes, guardada para no recalcular en cada listado.
  subtotal            numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  descuento_total     numeric(14,2) NOT NULL DEFAULT 0 CHECK (descuento_total >= 0),
  itbis_total         numeric(14,2) NOT NULL DEFAULT 0 CHECK (itbis_total >= 0),
  transporte_total    numeric(14,2) NOT NULL DEFAULT 0 CHECK (transporte_total >= 0),
  total               numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  moneda              codigo_moneda NOT NULL DEFAULT 'DOP',
  nota_comprador      text,
  pagado_en           timestamptz,
  completado_en       timestamptz,
  cancelado_en        timestamptz,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  actualizado_en      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_pedido_total CHECK (total = subtotal - descuento_total + itbis_total + transporte_total)
);
CREATE INDEX ix_pedido_comprador ON pedido (comprador_uid, creado_en DESC);
CREATE INDEX ix_pedido_estado ON pedido (estado, creado_en);
COMMENT ON TABLE pedido IS '[pedidos] Pedido del comprador (UC-MKT-16..19, 21, 26).';

CREATE TABLE suborden (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id                uuid NOT NULL REFERENCES pedido(id),
  numero                   text NOT NULL UNIQUE,
  vendedor_id              uuid NOT NULL REFERENCES vendedor(id),
  vendedor_nombre          text NOT NULL,
  estado                   text NOT NULL DEFAULT 'pendiente_aceptacion'
                           CHECK (estado IN ('pendiente_aceptacion','aceptada','rechazada','en_preparacion','lista_despacho',
                                             'en_transito','entregada','cancelada','devolucion_solicitada','devuelta')),
  modalidad_entrega        text NOT NULL DEFAULT 'envio_baney'
                           CHECK (modalidad_entrega IN ('envio_baney','retiro_local','acuerdo_vendedor')),
  -- Con envío BANEY la suborden pide un transporte (UC-MKT-40); el viaje y su
  -- rastreo (UC-MKT-20) salen de esa solicitud.
  solicitud_transporte_id  uuid UNIQUE REFERENCES solicitud_transporte(id),
  subtotal                 numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  descuento                numeric(14,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  itbis                    numeric(14,2) NOT NULL DEFAULT 0 CHECK (itbis >= 0),
  transporte               numeric(14,2) NOT NULL DEFAULT 0 CHECK (transporte >= 0),
  total                    numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  -- Código que el comprador le da al transportista al recibir; con hash.
  codigo_entrega_hash      text,
  motivo_rechazo           text,
  -- Si el vendedor no acepta antes, se rechaza sola.
  limite_aceptacion        timestamptz,
  aceptada_en              timestamptz,
  preparada_en             timestamptz,
  despachada_en            timestamptz,
  entregada_en             timestamptz,
  cancelada_en             timestamptz,
  creado_en                timestamptz NOT NULL DEFAULT now(),
  actualizado_en           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pedido_id, vendedor_id),
  CONSTRAINT ck_suborden_total CHECK (total = subtotal - descuento + itbis + transporte),
  CONSTRAINT ck_suborden_rechazado CHECK (estado <> 'rechazada' OR motivo_rechazo IS NOT NULL)
);
CREATE INDEX ix_suborden ON suborden (vendedor_id, estado, creado_en DESC);
CREATE INDEX ix_suborden_limite ON suborden (estado, limite_aceptacion);
COMMENT ON TABLE suborden IS '[pedidos] Parte del pedido de cada vendedor (UC-MKT-36..40, 55, 56).';

CREATE TABLE suborden_item (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suborden_id          uuid NOT NULL REFERENCES suborden(id),
  variante_id          uuid NOT NULL REFERENCES variante(id),
  sku                  text NOT NULL,
  nombre               text NOT NULL,
  variante_nombre      text NOT NULL,
  foto_url             text,
  unidad_medida        text NOT NULL,
  cantidad             integer NOT NULL CHECK (cantidad > 0),
  cantidad_despachada  integer NOT NULL DEFAULT 0 CHECK (cantidad_despachada >= 0),
  cantidad_devuelta    integer NOT NULL DEFAULT 0 CHECK (cantidad_devuelta >= 0),
  precio_unitario      numeric(14,2) NOT NULL CHECK (precio_unitario >= 0),
  descuento_unitario   numeric(14,2) NOT NULL DEFAULT 0 CHECK (descuento_unitario >= 0),
  regimen_itbis        text NOT NULL DEFAULT 'exento' CHECK (regimen_itbis IN ('exento','gravado','tasa_cero')),
  -- 0.1800 cuando grava; la del momento de la compra.
  tasa_itbis           numeric(5,4) NOT NULL DEFAULT 0 CHECK (tasa_itbis BETWEEN 0 AND 1),
  itbis_linea          numeric(14,2) NOT NULL DEFAULT 0 CHECK (itbis_linea >= 0),
  total_linea          numeric(14,2) NOT NULL CHECK (total_linea >= 0),
  CONSTRAINT ck_suborden_item_cantidades CHECK (cantidad_despachada <= cantidad AND cantidad_devuelta <= cantidad)
);
CREATE INDEX ix_suborden_item_variante ON suborden_item (variante_id);
COMMENT ON TABLE suborden_item IS '[pedidos] Líneas de la suborden con el precio y el impuesto del momento.';

CREATE TABLE pedido_evento (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id          uuid NOT NULL REFERENCES pedido(id),
  suborden_id        uuid REFERENCES suborden(id),
  tipo               text NOT NULL,
  estado_anterior    text,
  estado_nuevo       text,
  actor_tipo         text NOT NULL CHECK (actor_tipo IN ('comprador','vendedor','administrador','sistema','transportista')),
  actor_uid          uuid REFERENCES usuario(id),
  mensaje            text,
  visible_comprador  boolean NOT NULL DEFAULT true,
  datos              jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_pedido_evento ON pedido_evento (pedido_id, creado_en);
COMMENT ON TABLE pedido_evento IS '[pedidos] Línea de tiempo del pedido que ve el comprador (UC-MKT-19).';

CREATE TABLE cancelacion (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id         uuid NOT NULL REFERENCES pedido(id),
  suborden_id       uuid REFERENCES suborden(id),
  solicitante_uid   uuid REFERENCES usuario(id),
  solicitante_tipo  text NOT NULL CHECK (solicitante_tipo IN ('comprador','vendedor','administrador','sistema')),
  motivo            text NOT NULL CHECK (motivo IN ('arrepentimiento','sin_stock','precio_erroneo','no_acepta_a_tiempo',
                                                    'fraude_sospechado','pago_fallido','otro')),
  descripcion       text,
  penalidad         numeric(14,2) NOT NULL DEFAULT 0 CHECK (penalidad >= 0),
  creado_en         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE cancelacion IS '[pedidos] Cancelaciones del pedido entero o de una suborden (UC-MKT-21).';

-- Devolución de mercancía (UC-MKT-22, gestionada por el vendedor en UC-MKT-41).
-- Los reembolsos sin devolución (cancelación, cobro duplicado, ajuste) y la
-- autorización del admin (UC-MKT-23/49) van en `reembolso`.
CREATE TABLE devolucion (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero             text NOT NULL UNIQUE,
  suborden_id        uuid NOT NULL REFERENCES suborden(id),
  solicitante_uid    uuid NOT NULL REFERENCES usuario(id),
  motivo             text NOT NULL CHECK (motivo IN ('producto_danado','producto_incorrecto','faltante','calidad',
                                                     'no_corresponde_descripcion','entrega_tardia','otro')),
  descripcion        text,
  estado             text NOT NULL DEFAULT 'solicitada'
                     CHECK (estado IN ('solicitada','aprobada','rechazada','en_transito','recibida',
                                       'reembolsada','cerrada')),
  monto_solicitado   numeric(14,2) NOT NULL CHECK (monto_solicitado > 0),
  monto_aprobado     numeric(14,2) CHECK (monto_aprobado >= 0),
  resuelta_por_uid   uuid REFERENCES usuario(id),
  resuelta_por_tipo  text CHECK (resuelta_por_tipo IN ('vendedor','administrador')),
  motivo_resolucion  text,
  limite_respuesta   timestamptz,
  -- Las FK al reembolso y a la nota de crédito se agregan en sus archivos.
  reembolso_id       uuid,
  nota_credito_id    uuid,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  resuelta_en        timestamptz,
  CONSTRAINT ck_devolucion_monto CHECK (monto_aprobado IS NULL OR monto_aprobado <= monto_solicitado)
);
CREATE INDEX ix_devolucion_vendedor_pedido ON devolucion (suborden_id);
CREATE INDEX ix_devolucion_abierto ON devolucion (limite_respuesta) WHERE estado IN ('solicitada','aprobada','en_transito');
CREATE INDEX ix_devolucion_estado ON devolucion (estado, creado_en);
COMMENT ON TABLE devolucion IS '[pedidos] Devoluciones de mercancía (UC-MKT-22, 41, UC-ADM-09).';

CREATE TABLE devolucion_item (
  devolucion_id     uuid NOT NULL REFERENCES devolucion(id) ON DELETE CASCADE,
  suborden_item_id  uuid NOT NULL REFERENCES suborden_item(id),
  cantidad          integer NOT NULL CHECK (cantidad > 0),
  monto             numeric(14,2) NOT NULL CHECK (monto >= 0),
  PRIMARY KEY (devolucion_id, suborden_item_id)
);
COMMENT ON TABLE devolucion_item IS '[pedidos] Qué líneas y cuántas unidades se devuelven.';

CREATE TABLE devolucion_evidencia (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devolucion_id   uuid NOT NULL REFERENCES devolucion(id) ON DELETE CASCADE,
  tipo            text NOT NULL DEFAULT 'foto' CHECK (tipo IN ('foto','video','documento')),
  url             text NOT NULL UNIQUE,
  subida_por_uid  uuid NOT NULL REFERENCES usuario(id),
  creado_en       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE devolucion_evidencia IS '[pedidos] Fotos y documentos de la devolución.';

CREATE TABLE cupon_uso (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cupon_id                 uuid NOT NULL REFERENCES cupon(id),
  usuario_uid              uuid NOT NULL REFERENCES usuario(id),
  pedido_id                uuid REFERENCES pedido(id),
  solicitud_transporte_id  uuid REFERENCES solicitud_transporte(id),
  monto_descontado         numeric(14,2) NOT NULL CHECK (monto_descontado >= 0),
  usado_en                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_cupon_uso_destino CHECK (num_nonnulls(pedido_id, solicitud_transporte_id) = 1)
);
CREATE INDEX ix_cupon_uso_usuario ON cupon_uso (cupon_id, usuario_uid);
CREATE UNIQUE INDEX uq_cupon_uso_pedido ON cupon_uso (cupon_id, pedido_id) WHERE pedido_id IS NOT NULL;
COMMENT ON TABLE cupon_uso IS '[promociones] Uso de cada cupón en un pedido o un viaje.';

ALTER TABLE reserva ADD CONSTRAINT fk_reserva_pedido FOREIGN KEY (pedido_id) REFERENCES pedido(id);
ALTER TABLE intento_checkout ADD CONSTRAINT fk_intento_checkout_pedido FOREIGN KEY (pedido_id) REFERENCES pedido(id);

-- >>> sql/10_payments.sql
-- =====================================================================
--  Pagos · dueño: payment_service (Adrian)
--  UC-PAY-01..29, UC-USER-09, UC-TRA-47, UC-ADM-08
--  El monto, las partes y los reembolsos de un pago son de este módulo;
--  disputas, devoluciones y caja los consultan y los piden por aquí.
-- =====================================================================

CREATE TABLE metodo_pago (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_uid       uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  proveedor         text NOT NULL CHECK (proveedor IN ('azul','cardnet')),
  -- Token de la pasarela: el número de la tarjeta nunca llega a la base.
  token_proveedor   text NOT NULL,
  marca_tarjeta     text NOT NULL CHECK (marca_tarjeta IN ('visa','mastercard','amex','otra')),
  ultimos4          char(4) NOT NULL CHECK (ultimos4 ~ '^[0-9]{4}$'),
  mes_vencimiento   smallint NOT NULL CHECK (mes_vencimiento BETWEEN 1 AND 12),
  anio_vencimiento  smallint NOT NULL CHECK (anio_vencimiento BETWEEN 2000 AND 2100),
  titular_nombre    text,
  es_principal      boolean NOT NULL DEFAULT false,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proveedor, token_proveedor)
);
CREATE INDEX ix_metodo_pago_usuario ON metodo_pago (usuario_uid);
CREATE UNIQUE INDEX uq_metodo_pago_principal ON metodo_pago (usuario_uid) WHERE es_principal;
COMMENT ON TABLE metodo_pago IS '[pagos] Tarjetas tokenizadas de la persona (UC-USER-09, UC-PAY-12/13).';

CREATE TABLE pago (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pagador_uid                    uuid NOT NULL REFERENCES usuario(id),
  -- Qué se paga. Disputas guarda este mismo valor como `entidad_tipo`.
  concepto                       text NOT NULL CHECK (concepto IN ('pedido','viaje','seguro','credito_empresa')),
  pedido_id                      uuid REFERENCES pedido(id),
  viaje_id                       uuid REFERENCES viaje(id),
  metodo                         text NOT NULL CHECK (metodo IN ('tarjeta','transferencia','efectivo','credito_empresa')),
  metodo_pago_id                 uuid REFERENCES metodo_pago(id),
  proveedor                      text NOT NULL CHECK (proveedor IN ('azul','cardnet','banco','manual')),
  monto                          numeric(14,2) NOT NULL CHECK (monto > 0),
  monto_capturado                numeric(14,2) NOT NULL DEFAULT 0 CHECK (monto_capturado >= 0),
  monto_reembolsado              numeric(14,2) NOT NULL DEFAULT 0 CHECK (monto_reembolsado >= 0),
  moneda                         codigo_moneda NOT NULL DEFAULT 'DOP',
  estado                         text NOT NULL DEFAULT 'creado'
                                 CHECK (estado IN ('creado','preautorizado','autorizado','capturado','rechazado','cancelado',
                                                   'fallido','reembolsado_parcial','reembolsado')),
  motivo_fallo                   text,
  -- UC-PAY-11/23: el mismo cobro pedido dos veces devuelve el primero.
  idempotency_key                text NOT NULL UNIQUE,
  referencia_proveedor           text,
  -- Transferencia (UC-PAY-25): comprobante que sube quien paga.
  comprobante_transferencia_url  text,
  -- Efectivo (UC-PAY-24/27): quién lo recibió; la comisión que debe a BANEY
  -- se registra en caja como deuda de esa cuenta.
  efectivo_recibido_por_uid      uuid REFERENCES usuario(id),
  autorizado_en                  timestamptz,
  capturado_en                   timestamptz,
  cancelado_en                   timestamptz,
  creado_en                      timestamptz NOT NULL DEFAULT now(),
  actualizado_en                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_pago_destino CHECK (
    (concepto = 'pedido' AND pedido_id IS NOT NULL AND viaje_id IS NULL) OR
    (concepto = 'viaje' AND viaje_id IS NOT NULL AND pedido_id IS NULL) OR
    (concepto IN ('seguro','credito_empresa') AND pedido_id IS NULL AND viaje_id IS NULL)),
  CONSTRAINT ck_pago_montos CHECK (monto_capturado <= monto AND monto_reembolsado <= monto_capturado),
  CONSTRAINT ck_pago_tarjeta CHECK (metodo <> 'tarjeta' OR metodo_pago_id IS NOT NULL),
  CONSTRAINT ck_pago_efectivo CHECK (metodo <> 'efectivo' OR proveedor = 'manual')
);
CREATE UNIQUE INDEX uq_pago_proveedor_referencia ON pago (proveedor, referencia_proveedor) WHERE referencia_proveedor IS NOT NULL;
CREATE INDEX ix_pago_pedido ON pago (pedido_id) WHERE pedido_id IS NOT NULL;
CREATE INDEX ix_pago_viaje ON pago (viaje_id) WHERE viaje_id IS NOT NULL;
CREATE INDEX ix_pago_pagador ON pago (pagador_uid, creado_en DESC);
CREATE INDEX ix_pago_estado ON pago (estado, creado_en);
COMMENT ON TABLE pago IS '[pagos] Cobro de un pedido, un viaje, un seguro o un crédito (UC-PAY-01..06, 09, 15, 24, 25).';

CREATE TABLE pago_transaccion (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id               uuid NOT NULL REFERENCES pago(id),
  operacion             text NOT NULL CHECK (operacion IN ('preautorizacion','autorizacion','captura','anulacion',
                                                           'reembolso','reintento')),
  estado                text NOT NULL CHECK (estado IN ('exitosa','rechazada','error','pendiente')),
  monto                 numeric(14,2) NOT NULL CHECK (monto >= 0),
  moneda                codigo_moneda NOT NULL DEFAULT 'DOP',
  referencia_proveedor  text,
  codigo_respuesta      text,
  -- Respuesta de la pasarela sin datos de tarjeta, para soporte y conciliación.
  respuesta_proveedor   jsonb,
  ocurrido_en           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_pago_transaccion ON pago_transaccion (pago_id, ocurrido_en);
CREATE TRIGGER inmutable_pago_transaccion BEFORE UPDATE OR DELETE ON pago_transaccion
  FOR EACH ROW EXECUTE FUNCTION rechazar_cambio();
COMMENT ON TABLE pago_transaccion IS '[pagos] Cada operación con la pasarela y su respuesta (UC-PAY-02..05).';

-- Un solo lugar para los reembolsos: disputas, devoluciones y cancelaciones
-- piden aquí y guardan el id. Es también la solicitud de reembolso del
-- mercado (UC-MKT-23) que el admin autoriza o rechaza (UC-MKT-49): hay
-- reembolsos sin devolución (pedido cancelado antes de despachar, cobro
-- duplicado, ajuste manual).
CREATE TABLE reembolso (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id               uuid NOT NULL REFERENCES pago(id),
  -- En un pedido con varios vendedores, a qué suborden corresponde.
  suborden_id           uuid REFERENCES suborden(id),
  monto                 numeric(14,2) NOT NULL CHECK (monto > 0),
  moneda                codigo_moneda NOT NULL DEFAULT 'DOP',
  origen                text NOT NULL CHECK (origen IN ('disputa','devolucion','cancelacion','ajuste_manual','cobro_duplicado')),
  -- Id de la disputa, devolución o cancelación que lo originó.
  origen_id             uuid,
  motivo                text NOT NULL,
  estado                text NOT NULL DEFAULT 'solicitado'
                        CHECK (estado IN ('solicitado','autorizado','rechazado','procesando','completado','fallido')),
  idempotency_key       text NOT NULL UNIQUE,
  solicitado_por_uid    uuid REFERENCES usuario(id),
  autorizado_por_uid    uuid REFERENCES usuario(id),
  autorizado_en         timestamptz,
  motivo_rechazo        text,
  -- Nota de crédito fiscal que emite facturación; la FK se agrega en 15_billing_fiscal.sql.
  nota_credito_id       uuid,
  referencia_proveedor  text,
  motivo_fallo          text,
  creado_en             timestamptz NOT NULL DEFAULT now(),
  completado_en         timestamptz,
  CONSTRAINT ck_reembolso_origen CHECK (origen IN ('ajuste_manual','cobro_duplicado') OR origen_id IS NOT NULL),
  CONSTRAINT ck_reembolso_autorizado CHECK (estado NOT IN ('autorizado','procesando','completado') OR autorizado_en IS NOT NULL),
  CONSTRAINT ck_reembolso_rechazado CHECK (estado <> 'rechazado' OR motivo_rechazo IS NOT NULL)
);
CREATE INDEX ix_reembolso_estado ON reembolso (estado, creado_en);
CREATE INDEX ix_reembolso_pago ON reembolso (pago_id);
CREATE INDEX ix_reembolso_origen ON reembolso (origen, origen_id);
COMMENT ON TABLE reembolso IS '[pagos] Solicitud, autorización y ejecución de reembolsos totales o parciales (UC-PAY-07/08, UC-MKT-23/49, UC-TRA-40, UC-CAJ-12).';

CREATE TABLE pago_webhook (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor     text NOT NULL CHECK (proveedor IN ('azul','cardnet')),
  evento_id     text NOT NULL,
  tipo_evento   text NOT NULL,
  -- UC-PAY-19: un webhook con firma inválida se guarda para investigar, pero
  -- nunca se procesa.
  firma_valida  boolean NOT NULL,
  pago_id       uuid REFERENCES pago(id),
  carga         jsonb NOT NULL,
  recibido_en   timestamptz NOT NULL DEFAULT now(),
  procesado_en  timestamptz,
  error         text,
  UNIQUE (proveedor, evento_id),
  CONSTRAINT ck_pago_webhook_procesado CHECK (procesado_en IS NULL OR firma_valida)
);
CREATE INDEX ix_pago_webhook_pendiente ON pago_webhook (recibido_en) WHERE procesado_en IS NULL AND firma_valida;
COMMENT ON TABLE pago_webhook IS '[pagos] Webhooks recibidos de la pasarela, sin duplicados (UC-PAY-10, 19).';

ALTER TABLE devolucion ADD CONSTRAINT fk_devolucion_reembolso FOREIGN KEY (reembolso_id) REFERENCES reembolso(id);

-- >>> sql/11_disputes.sql
-- =====================================================================
--  Disputas · dueño: Servicio_disputas (Zadkiel)
--  UC-DIS-01/02/03/09, UC-TRA-18/39/40, UC-ADM-10/54/57, UC-MKT-48
--  Mismas columnas que el modelo del servicio: una disputa es sobre un pago
--  cobrado, y el historial va en disputa_evento.
-- =====================================================================

CREATE SEQUENCE disputa_numero_seq;

CREATE TABLE disputa (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                   integer NOT NULL UNIQUE DEFAULT nextval('disputa_numero_seq'),
  abierta_por_uid          uuid NOT NULL REFERENCES usuario(id),
  -- La otra parte (quien cobró o quien pagó); nula si el pago no la tiene.
  contraparte_uid          uuid REFERENCES usuario(id),
  pago_id                  uuid NOT NULL REFERENCES pago(id),
  entidad_tipo             text NOT NULL CHECK (entidad_tipo IN ('pedido','viaje','seguro','credito_empresa')),
  -- Id del pedido o viaje; sin FK porque cambia de tabla según entidad_tipo.
  -- El vínculo con integridad es pago_id.
  entidad_id               uuid NOT NULL,
  pagador_uid              uuid NOT NULL REFERENCES usuario(id),
  -- En un pedido con varios vendedores, la suborden en disputa (UC-MKT-48).
  suborden_id              uuid REFERENCES suborden(id),
  -- Mientras siga abierta, caja retiene los fondos de esa venta o viaje.
  congela_payout           boolean NOT NULL DEFAULT true,
  motivo                   text NOT NULL CHECK (motivo IN ('cobro_incorrecto','cobro_duplicado','cargo_no_autorizado',
                                                           'servicio_no_prestado','mercancia_danada','mercancia_faltante',
                           'no_es_lo_acordado','retraso','mal_trato','otro')),
  descripcion              text NOT NULL,
  monto                    numeric(14,2) NOT NULL CHECK (monto > 0),
  moneda                   codigo_moneda NOT NULL,
  estado                   text NOT NULL DEFAULT 'abierta'
                           CHECK (estado IN ('abierta','en_revision','reembolso_solicitado','resuelta')),
  -- Copia de pago_id mientras la disputa sigue en curso: su UNIQUE impide
  -- dos disputas abiertas sobre el mismo pago y se vacía al resolver.
  pago_activo_id           uuid UNIQUE,
  reembolso_solicitado_en  timestamptz,
  asignada_a_uid           uuid REFERENCES usuario(id),
  asignada_en              timestamptz,
  resultado                text CHECK (resultado IN ('reembolso_total','reembolso_parcial','sin_reembolso')),
  monto_reembolso          numeric(14,2) CHECK (monto_reembolso > 0),
  reembolso_id             uuid REFERENCES reembolso(id),
  resuelta_por_uid         uuid REFERENCES usuario(id),
  resuelta_en              timestamptz,
  motivo_resolucion        text,
  creado_en                timestamptz NOT NULL DEFAULT now(),
  actualizado_en           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_disputa_activo CHECK (
    (estado = 'resuelta' AND pago_activo_id IS NULL) OR
    (estado <> 'resuelta' AND pago_activo_id = pago_id)),
  CONSTRAINT ck_disputa_resuelto CHECK (
    (estado = 'resuelta') = (resultado IS NOT NULL AND resuelta_en IS NOT NULL AND motivo_resolucion IS NOT NULL)),
  CONSTRAINT ck_disputa_reembolso CHECK (
    (resultado IN ('reembolso_total','reembolso_parcial')) = (monto_reembolso IS NOT NULL)),
  CONSTRAINT ck_disputa_reembolso_monto CHECK (monto_reembolso IS NULL OR monto_reembolso <= monto),
  CONSTRAINT ck_disputa_vendedor_pedido CHECK (suborden_id IS NULL OR entidad_tipo = 'pedido')
);
CREATE INDEX ix_disputa_bandeja ON disputa (estado, creado_en) WHERE estado <> 'resuelta';
CREATE INDEX ix_disputa_asignada ON disputa (asignada_a_uid) WHERE asignada_a_uid IS NOT NULL;
CREATE INDEX ix_disputa_pago ON disputa (pago_id);
CREATE INDEX ix_disputa_entidad ON disputa (entidad_tipo, entidad_id);
COMMENT ON TABLE disputa IS '[disputas] Disputa sobre un pago cobrado: motivo, asignación y resolución con o sin reembolso.';

CREATE TABLE disputa_evidencia (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disputa_id      uuid NOT NULL REFERENCES disputa(id) ON DELETE CASCADE,
  subido_por_uid  uuid NOT NULL REFERENCES usuario(id),
  nombre_archivo  text NOT NULL,
  tipo_contenido  text NOT NULL CHECK (tipo_contenido IN ('application/pdf','image/jpeg','image/png')),
  bytes           integer NOT NULL CHECK (bytes > 0),
  url             text NOT NULL UNIQUE,
  nota            text,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_disputa_evidencia ON disputa_evidencia (disputa_id);
COMMENT ON TABLE disputa_evidencia IS '[disputas] Archivos de evidencia; no se editan ni se borran (UC-DIS-03).';

CREATE TABLE disputa_evento (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disputa_id  uuid NOT NULL REFERENCES disputa(id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('abierta','motivo_cambiado','evidencia_agregada','reembolso_solicitado',
                                            'asignada','reembolso_emitido','resuelta')),
  actor_uid   uuid REFERENCES usuario(id),
  -- Nunca tokens ni el contenido de los archivos.
  detalle     jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_disputa_evento ON disputa_evento (disputa_id, creado_en);
CREATE TRIGGER inmutable_disputa_evento BEFORE UPDATE ON disputa_evento FOR EACH ROW EXECUTE FUNCTION rechazar_cambio();
COMMENT ON TABLE disputa_evento IS '[disputas] Historial de la disputa: quién, qué y cuándo.';

-- >>> sql/12_support.sql
-- =====================================================================
--  Soporte · dueño: soporte (Zadkiel)
--  UC-SUP-01/02/03/08, UC-HOME-14
--  Los plazos de respuesta por prioridad van en configuracion, no en una tabla.
-- =====================================================================

CREATE SEQUENCE ticket_numero_seq;

CREATE TABLE ticket (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                    integer NOT NULL UNIQUE DEFAULT nextval('ticket_numero_seq'),
  solicitante_uid           uuid NOT NULL REFERENCES usuario(id),
  asunto                    text NOT NULL,
  categoria                 text NOT NULL CHECK (categoria IN ('cuenta','pago','viaje','pedido','facturacion','tecnico','otro')),
  canal                     text NOT NULL DEFAULT 'app' CHECK (canal IN ('app','web','correo','telefono','whatsapp')),
  prioridad                 text NOT NULL DEFAULT 'normal' CHECK (prioridad IN ('baja','normal','alta','urgente')),
  estado                    text NOT NULL DEFAULT 'abierto'
                            CHECK (estado IN ('abierto','en_atencion','esperando_usuario','cerrado')),
  pedido_id                 uuid REFERENCES pedido(id),
  viaje_id                  uuid REFERENCES viaje(id),
  disputa_id                uuid REFERENCES disputa(id),
  asignada_a_uid            uuid REFERENCES usuario(id),
  primera_respuesta_limite  timestamptz,
  primera_respuesta_en      timestamptz,
  cerrado_en                timestamptz,
  cerrado_por_uid           uuid REFERENCES usuario(id),
  motivo_cierre             text,
  creado_en                 timestamptz NOT NULL DEFAULT now(),
  actualizado_en            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_ticket_cerrado CHECK ((estado = 'cerrado') = (cerrado_en IS NOT NULL))
);
CREATE INDEX ix_ticket_cola ON ticket (prioridad, creado_en) WHERE estado <> 'cerrado';
CREATE INDEX ix_ticket_solicitante ON ticket (solicitante_uid, creado_en DESC);
CREATE INDEX ix_ticket_asignada ON ticket (asignada_a_uid) WHERE estado <> 'cerrado';
COMMENT ON TABLE ticket IS '[soporte] Ticket de atención (UC-SUP-01, 02, 08, UC-HOME-14).';

CREATE TABLE ticket_mensaje (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  autor_uid   uuid NOT NULL REFERENCES usuario(id),
  cuerpo      text NOT NULL,
  -- Nota interna del equipo: la persona que abrió el ticket no la ve.
  es_interno  boolean NOT NULL DEFAULT false,
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_ticket_mensaje ON ticket_mensaje (ticket_id, creado_en);
COMMENT ON TABLE ticket_mensaje IS '[soporte] Respuestas del ticket (UC-SUP-03).';

CREATE TABLE ticket_adjunto (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensaje_id      uuid NOT NULL REFERENCES ticket_mensaje(id) ON DELETE CASCADE,
  nombre_archivo  text NOT NULL,
  tipo_contenido  text NOT NULL,
  bytes           integer NOT NULL CHECK (bytes > 0),
  url             text NOT NULL UNIQUE,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ticket_adjunto IS '[soporte] Archivos adjuntos a una respuesta.';

-- >>> sql/13_chat.sql
-- =====================================================================
--  Chat · dueño: chat_service (Adrian)
--  UC-CHAT-01..08, 19, UC-TRA-10
-- =====================================================================

CREATE TABLE conversacion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Todo chat va atado a un viaje o a un pedido (UC-CHAT-19): así soporte y
  -- disputas pueden leer la conversación del caso.
  contexto_tipo   text NOT NULL CHECK (contexto_tipo IN ('viaje','pedido')),
  viaje_id        uuid REFERENCES viaje(id),
  pedido_id       uuid REFERENCES pedido(id),
  estado          text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','finalizada')),
  creado_por_uid  uuid NOT NULL REFERENCES usuario(id),
  creado_en       timestamptz NOT NULL DEFAULT now(),
  cerrado_en      timestamptz,
  CONSTRAINT ck_conversacion_contexto CHECK (
    (contexto_tipo = 'viaje' AND viaje_id IS NOT NULL AND pedido_id IS NULL) OR
    (contexto_tipo = 'pedido' AND pedido_id IS NOT NULL AND viaje_id IS NULL)),
  CONSTRAINT ck_conversacion_cerrado CHECK ((estado = 'finalizada') = (cerrado_en IS NOT NULL))
);
CREATE UNIQUE INDEX uq_conversacion_viaje ON conversacion (viaje_id) WHERE viaje_id IS NOT NULL;
CREATE INDEX ix_conversacion_pedido ON conversacion (pedido_id) WHERE pedido_id IS NOT NULL;
COMMENT ON TABLE conversacion IS '[chat] Conversación de un viaje o un pedido (UC-CHAT-01, 07, 19).';

CREATE TABLE conversacion_participante (
  conversacion_id    uuid NOT NULL REFERENCES conversacion(id) ON DELETE CASCADE,
  usuario_uid        uuid NOT NULL REFERENCES usuario(id),
  rol                text NOT NULL CHECK (rol IN ('cliente','transportista','vendedor','comprador','soporte')),
  unido_en           timestamptz NOT NULL DEFAULT now(),
  salio_en           timestamptz,
  -- Hasta dónde leyó: los no leídos se cuentan sin una fila por mensaje.
  ultima_lectura_en  timestamptz,
  PRIMARY KEY (conversacion_id, usuario_uid)
);
CREATE INDEX ix_conversacion_participante_usuario ON conversacion_participante (usuario_uid);
COMMENT ON TABLE conversacion_participante IS '[chat] Quién está en la conversación y hasta dónde leyó (UC-CHAT-04).';

CREATE TABLE mensaje (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id  uuid NOT NULL,
  remitente_uid    uuid NOT NULL,
  cuerpo           text,
  enviado_en       timestamptz NOT NULL DEFAULT now(),
  editado_en       timestamptz,
  eliminado_en     timestamptz,
  -- Solo un participante puede escribir en la conversación.
  FOREIGN KEY (conversacion_id, remitente_uid) REFERENCES conversacion_participante (conversacion_id, usuario_uid)
);
CREATE INDEX ix_mensaje_conversacion ON mensaje (conversacion_id, enviado_en);
COMMENT ON TABLE mensaje IS '[chat] Mensajes (UC-CHAT-02, 03, 08).';

CREATE TABLE mensaje_adjunto (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensaje_id      uuid NOT NULL REFERENCES mensaje(id) ON DELETE CASCADE,
  tipo_contenido  text NOT NULL CHECK (tipo_contenido IN ('image/jpeg','image/png','application/pdf')),
  bytes           integer NOT NULL CHECK (bytes > 0),
  url             text NOT NULL UNIQUE,
  sha256          char(64),
  creado_en       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE mensaje_adjunto IS '[chat] Imágenes adjuntas a un mensaje (UC-CHAT-05).';

CREATE TABLE bloqueo_usuario (
  bloqueador_uid  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  bloqueado_uid   uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  motivo          text,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bloqueador_uid, bloqueado_uid),
  CONSTRAINT ck_bloqueo_usuario_mismo CHECK (bloqueador_uid <> bloqueado_uid)
);
COMMENT ON TABLE bloqueo_usuario IS '[chat] Personas que alguien bloqueó en el chat (UC-CHAT-06).';

-- >>> sql/14_notifications.sql
-- =====================================================================
--  Notificaciones · dueño: notification_Service (Adrian)
--  UC-NOTIF-01..24, UC-HOME-15
-- =====================================================================

-- Sin el token del dispositivo no hay a dónde mandar un push.
CREATE TABLE dispositivo (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_uid    uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  plataforma     text NOT NULL CHECK (plataforma IN ('ios','android','web')),
  token          text NOT NULL UNIQUE,
  version_app    text,
  ultima_vez_en  timestamptz NOT NULL DEFAULT now(),
  revocado_en    timestamptz,
  creado_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_dispositivo_usuario ON dispositivo (usuario_uid) WHERE revocado_en IS NULL;
COMMENT ON TABLE dispositivo IS '[notificaciones] Tokens FCM/APNs de los teléfonos de cada persona (UC-NOTIF-01).';

CREATE TABLE notificacion_plantilla (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo     text NOT NULL,
  canal      text NOT NULL CHECK (canal IN ('push','sms','email','in_app')),
  idioma     text NOT NULL CHECK (idioma IN ('es','en','ht')),
  version    integer NOT NULL DEFAULT 1 CHECK (version > 0),
  asunto     text,
  cuerpo     text NOT NULL,
  activa     boolean NOT NULL DEFAULT true,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (codigo, canal, idioma, version),
  CONSTRAINT ck_notificacion_plantilla_email_sujeto CHECK (canal <> 'email' OR asunto IS NOT NULL)
);
CREATE UNIQUE INDEX uq_notificacion_plantilla_activo ON notificacion_plantilla (codigo, canal, idioma) WHERE activa;
COMMENT ON TABLE notificacion_plantilla IS '[notificaciones] Plantillas por canal e idioma.';

CREATE TABLE notificacion (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_uid       uuid NOT NULL REFERENCES usuario(id),
  categoria         text NOT NULL CHECK (categoria IN ('confirmacion','pedido','viaje','pago','cancelacion','promocion',
                                                       'seguridad','soporte','sistema')),
  plantilla_codigo  text NOT NULL,
  titulo            text NOT NULL,
  cuerpo            text NOT NULL,
  carga             jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Orden de canales a intentar (UC-NOTIF-15): push → sms → email.
  orden_canales     text[] NOT NULL DEFAULT ARRAY['push','sms','email']
                    CHECK (orden_canales <@ ARRAY['push','sms','email','in_app']::text[]),
  estado            text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviada','fallida','cancelada')),
  -- El mismo evento no avisa dos veces aunque llegue repetido.
  idempotency_key   text NOT NULL UNIQUE,
  leida_en          timestamptz,
  creado_en         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_notificacion_bandeja ON notificacion (usuario_uid, creado_en DESC);
CREATE INDEX ix_notificacion_pendiente ON notificacion (creado_en) WHERE estado = 'pendiente';
COMMENT ON TABLE notificacion IS '[notificaciones] Aviso a una persona y su bandeja dentro de la app (UC-NOTIF-04..09).';

CREATE TABLE notificacion_envio (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacion_id       uuid NOT NULL REFERENCES notificacion(id) ON DELETE CASCADE,
  canal                 text NOT NULL CHECK (canal IN ('push','sms','email','in_app')),
  intento               smallint NOT NULL CHECK (intento > 0),
  proveedor             text NOT NULL CHECK (proveedor IN ('fcm','apns','twilio','smtp','interno')),
  dispositivo_id        uuid REFERENCES dispositivo(id),
  referencia_proveedor  text,
  estado                text NOT NULL CHECK (estado IN ('enviado','entregado','fallido','rebotado')),
  error                 text,
  proximo_intento_en    timestamptz,
  intentado_en          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notificacion_id, canal, intento)
);
CREATE INDEX ix_notificacion_envio_reintento ON notificacion_envio (proximo_intento_en) WHERE estado = 'fallido' AND proximo_intento_en IS NOT NULL;
COMMENT ON TABLE notificacion_envio IS '[notificaciones] Cada intento de envío por canal, con reintentos (UC-NOTIF-10, 15).';

-- Preferencia fina por tema y canal. Los avisos de seguridad no se pueden
-- apagar: el servicio los manda aunque aquí diga false.
CREATE TABLE notificacion_preferencia (
  usuario_uid     uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  categoria       text NOT NULL CHECK (categoria IN ('confirmacion','pedido','viaje','pago','cancelacion','promocion',
                                                     'soporte','sistema')),
  canal           text NOT NULL CHECK (canal IN ('push','sms','email')),
  activa          boolean NOT NULL,
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_uid, categoria, canal)
);
COMMENT ON TABLE notificacion_preferencia IS '[notificaciones] Qué avisos quiere recibir cada persona y por dónde (UC-NOTIF-11, UC-HOME-15).';

-- >>> sql/15_billing_fiscal.sql
-- =====================================================================
--  Facturación y DGII · dueños: billing-service (Triana) y dgii-service (Adrian)
--  UC-BILL-01..08, UC-DGII-01..17, UC-PAY-26, UC-TRA-17/42, UC-ADM-12/60
-- =====================================================================

-- Expediente fiscal (UC-DGII-01..11): de una persona o de una empresa.
CREATE TABLE contribuyente (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_uid           uuid REFERENCES usuario(id),
  empresa_id            uuid REFERENCES empresa(id),
  -- BANEY también es contribuyente: emite las facturas de comisión.
  es_plataforma         boolean NOT NULL DEFAULT false,
  rnc                   text NOT NULL UNIQUE,
  tipo_documento        text NOT NULL CHECK (tipo_documento IN ('rnc','cedula')),
  razon_social          text NOT NULL,
  nombre_comercial      text,
  tipo_contribuyente    text NOT NULL CHECK (tipo_contribuyente IN ('persona_fisica','persona_juridica','rst','gubernamental')),
  -- Lo que respondió la DGII al validar el RNC (UC-DGII-02/03).
  dgii_estado           text CHECK (dgii_estado IN ('activo','suspendido','dado_de_baja','no_encontrado')),
  dgii_validado_en      timestamptz,
  estado_formalizacion  text NOT NULL DEFAULT 'borrador'
                        CHECK (estado_formalizacion IN ('borrador','en_revision','correccion_solicitada','aprobado','rechazado')),
  revisado_por_uid      uuid REFERENCES usuario(id),
  revisado_en           timestamptz,
  nota_revision         text,
  creado_en             timestamptz NOT NULL DEFAULT now(),
  actualizado_en        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_contribuyente_dueno CHECK (num_nonnulls(usuario_uid, empresa_id) + es_plataforma::int = 1),
  CONSTRAINT ck_contribuyente_rnc_id CHECK (
    (tipo_documento = 'rnc' AND rnc ~ '^[0-9]{9}$') OR (tipo_documento = 'cedula' AND rnc ~ '^[0-9]{11}$'))
);
CREATE UNIQUE INDEX uq_contribuyente_plataforma ON contribuyente (es_plataforma) WHERE es_plataforma;
CREATE UNIQUE INDEX uq_contribuyente_usuario ON contribuyente (usuario_uid) WHERE usuario_uid IS NOT NULL;
CREATE UNIQUE INDEX uq_contribuyente_empresa ON contribuyente (empresa_id) WHERE empresa_id IS NOT NULL;
COMMENT ON TABLE contribuyente IS '[fiscal] Contribuyente y su expediente de formalización (UC-DGII-01..04, 09..11).';

CREATE TABLE documento_formalizacion (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contribuyente_id   uuid NOT NULL REFERENCES contribuyente(id) ON DELETE CASCADE,
  tipo               text NOT NULL CHECK (tipo IN ('certificado_rnc','registro_mercantil','acta_constitutiva',
                                                   'cedula_representante','otro')),
  url                text NOT NULL UNIQUE,
  version            integer NOT NULL DEFAULT 1 CHECK (version > 0),
  -- Al reemplazar un documento (UC-DGII-06) se guarda cuál reemplaza.
  reemplaza_id       uuid REFERENCES documento_formalizacion(id),
  fecha_vencimiento  date,
  estado             text NOT NULL DEFAULT 'pendiente_revision'
                     CHECK (estado IN ('pendiente_revision','aprobado','rechazado','correccion_solicitada','reemplazado')),
  nota_revision      text,
  subido_por_uid     uuid NOT NULL REFERENCES usuario(id),
  revisado_por_uid   uuid REFERENCES usuario(id),
  revisado_en        timestamptz,
  creado_en          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_documento_formalizacion_perfil ON documento_formalizacion (contribuyente_id, estado);
CREATE INDEX ix_documento_formalizacion_vencimiento ON documento_formalizacion (fecha_vencimiento) WHERE estado = 'aprobado';
COMMENT ON TABLE documento_formalizacion IS '[fiscal] Documentos del expediente y su revisión (UC-DGII-05..08, 17).';

CREATE TABLE tasa_impuesto (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo         text NOT NULL,
  nombre         text NOT NULL,
  tasa           numeric(5,4) NOT NULL CHECK (tasa BETWEEN 0 AND 1),
  vigente_desde  date NOT NULL,
  vigente_hasta  date,
  UNIQUE (codigo, vigente_desde),
  CONSTRAINT ck_tasa_impuesto_periodo CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)
);
COMMENT ON TABLE tasa_impuesto IS '[fiscal] Tasas de impuesto vigentes por fecha: ITBIS, retenciones (UC-DGII-12, UC-BILL-03).';

-- Rangos de NCF / e-CF autorizados por la DGII a cada emisor. Es lo más
-- delicado del esquema: dos facturas no pueden llevar el mismo NCF ni puede
-- haber huecos. Se consume con un UPDATE condicional dentro de la
-- transacción que emite la factura, nunca leyendo y luego escribiendo:
--   UPDATE ncf_secuencia SET actual = actual + 1
--    WHERE id = :id AND actual < hasta AND activo AND fecha_vencimiento >= current_date
--   RETURNING actual;   -- sin fila: rango agotado o vencido, abortar
CREATE TABLE ncf_secuencia (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contribuyente_id    uuid NOT NULL REFERENCES contribuyente(id),
  -- B01 crédito fiscal · B02 consumo · B04 nota de crédito · E31/E32... e-CF.
  tipo_ecf            text NOT NULL CHECK (tipo_ecf IN ('B01','B02','B04','B11','B14','B15','B16','B17',
                                                        'E31','E32','E34','E41','E43','E44','E45','E46','E47')),
  serie               char(1) NOT NULL DEFAULT 'B',
  desde               bigint NOT NULL CHECK (desde > 0),
  hasta               bigint NOT NULL,
  actual              bigint NOT NULL,
  fecha_autorizacion  date NOT NULL,
  fecha_vencimiento   date NOT NULL,
  activa              boolean NOT NULL DEFAULT true,
  -- Avisar cuando queden menos de estos números.
  umbral_alerta       bigint NOT NULL DEFAULT 100 CHECK (umbral_alerta >= 0),
  creado_en           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contribuyente_id, tipo_ecf, desde),
  CONSTRAINT ck_ncf_secuencia_rango CHECK (desde <= hasta AND actual BETWEEN desde - 1 AND hasta)
);
CREATE UNIQUE INDEX uq_ncf_secuencia_activo ON ncf_secuencia (contribuyente_id, tipo_ecf) WHERE activa;
COMMENT ON TABLE ncf_secuencia IS '[fiscal] Secuencias de comprobantes autorizadas (UC-BILL-07).';

CREATE TABLE regla_comision (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          text NOT NULL,
  aplica_a        text NOT NULL CHECK (aplica_a IN ('mercado','transporte')),
  ambito          text NOT NULL CHECK (ambito IN ('global','categoria','vendedor','tipo_vehiculo','transportista','empresa')),
  -- Id de la categoría, el vendedor o la empresa, o el tipo de vehículo.
  ambito_ref      text,
  tipo            text NOT NULL CHECK (tipo IN ('porcentaje','fijo','mixto')),
  porcentaje      numeric(5,4) NOT NULL DEFAULT 0 CHECK (porcentaje BETWEEN 0 AND 1),
  monto_fijo      numeric(14,2) NOT NULL DEFAULT 0 CHECK (monto_fijo >= 0),
  minimo          numeric(14,2) CHECK (minimo >= 0),
  maximo          numeric(14,2),
  moneda          codigo_moneda NOT NULL DEFAULT 'DOP',
  -- Cuando varias reglas aplican, gana la de menor prioridad.
  prioridad       smallint NOT NULL DEFAULT 100,
  vigente_desde   timestamptz NOT NULL,
  vigente_hasta   timestamptz,
  creado_por_uid  uuid NOT NULL REFERENCES usuario(id),
  creado_en       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_regla_comision_ambito CHECK ((ambito = 'global') = (ambito_ref IS NULL)),
  CONSTRAINT ck_regla_comision_limites CHECK (maximo IS NULL OR minimo IS NULL OR maximo >= minimo),
  CONSTRAINT ck_regla_comision_periodo CHECK (vigente_hasta IS NULL OR vigente_desde < vigente_hasta)
);
CREATE INDEX ix_regla_comision_busqueda ON regla_comision (aplica_a, ambito, ambito_ref, vigente_desde, prioridad);
COMMENT ON TABLE regla_comision IS '[facturacion] Comisión BANEY global, por categoría, vendedor o tipo de vehículo (UC-ADM-60, UC-TRA-42, UC-BILL-02).';

CREATE TABLE liquidacion (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero             text NOT NULL UNIQUE,
  beneficiario_uid   uuid NOT NULL REFERENCES usuario(id),
  beneficiario_tipo  text NOT NULL CHECK (beneficiario_tipo IN ('vendedor','transportista')),
  beneficiario_rnc   text,
  periodo_desde      date NOT NULL,
  periodo_hasta      date NOT NULL,
  moneda             codigo_moneda NOT NULL DEFAULT 'DOP',
  bruto              numeric(14,2) NOT NULL DEFAULT 0,
  comisiones         numeric(14,2) NOT NULL DEFAULT 0 CHECK (comisiones >= 0),
  retenciones        numeric(14,2) NOT NULL DEFAULT 0 CHECK (retenciones >= 0),
  ajustes            numeric(14,2) NOT NULL DEFAULT 0,
  neto               numeric(14,2) NOT NULL DEFAULT 0,
  estado             text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada','pagada','anulada')),
  cerrada_en         timestamptz,
  pagada_en          timestamptz,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  -- La liquidación es el corte del período: se cierra y ya no cambia; lo
  -- que llegue después entra en la siguiente.
  UNIQUE (beneficiario_tipo, beneficiario_uid, periodo_desde, periodo_hasta),
  CONSTRAINT ck_liquidacion_periodo CHECK (periodo_desde <= periodo_hasta),
  CONSTRAINT ck_liquidacion_neto CHECK (neto = bruto - comisiones - retenciones + ajustes)
);
CREATE INDEX ix_liquidacion_beneficiario ON liquidacion (beneficiario_uid, periodo_desde DESC);
COMMENT ON TABLE liquidacion IS '[facturacion] Liquidación de un vendedor o transportista por período (UC-BILL-04/05, UC-TRA-188).';

-- Nada se edita: una factura emitida es un documento fiscal. Si está mal,
-- se anula o se emite una nota de crédito. La DGII puede auditar 3 años atrás.
-- En un marketplace hay dos facturaciones: vendedor → comprador por la
-- mercancía y plataforma → vendedor por la comisión; emisor_tipo las separa.
CREATE TABLE factura (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_interno           text NOT NULL UNIQUE,
  tipo_documento           text NOT NULL DEFAULT 'factura' CHECK (tipo_documento IN ('factura','nota_credito','nota_debito')),
  factura_origen_id        uuid REFERENCES factura(id),
  emisor_tipo              text NOT NULL CHECK (emisor_tipo IN ('plataforma','vendedor','transportista')),
  emisor_contribuyente_id  uuid NOT NULL REFERENCES contribuyente(id),
  -- Copia del emisor al emitir: la factura no cambia si después cambia el perfil.
  emisor_rnc               text NOT NULL,
  emisor_nombre            text NOT NULL,
  receptor_uid             uuid REFERENCES usuario(id),
  -- Nulo = consumidor final (B02).
  receptor_rnc             text,
  receptor_nombre          text NOT NULL,
  receptor_direccion       text,
  receptor_email           text,
  -- Se asigna al emitir, no al crear el borrador.
  ncf                      text,
  ncf_secuencia_id         uuid REFERENCES ncf_secuencia(id),
  ncf_vencimiento          date,
  tipo_ecf                 text,
  moneda                   codigo_moneda NOT NULL DEFAULT 'DOP',
  tasa_cambio              numeric(12,6) NOT NULL DEFAULT 1 CHECK (tasa_cambio > 0),
  subtotal                 numeric(14,2) NOT NULL CHECK (subtotal >= 0),
  descuento                numeric(14,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  monto_exento             numeric(14,2) NOT NULL DEFAULT 0 CHECK (monto_exento >= 0),
  base_imponible           numeric(14,2) NOT NULL DEFAULT 0 CHECK (base_imponible >= 0),
  itbis                    numeric(14,2) NOT NULL DEFAULT 0 CHECK (itbis >= 0),
  propina_legal            numeric(14,2) NOT NULL DEFAULT 0 CHECK (propina_legal >= 0),
  total                    numeric(14,2) NOT NULL CHECK (total >= 0),
  -- De qué es la factura. Una sola FK con valor según source.
  origen                   text NOT NULL CHECK (origen IN ('pedido','suborden','viaje','comision','liquidacion',
                                                           'credito_empresa','seguro','manual')),
  pedido_id                uuid REFERENCES pedido(id),
  suborden_id              uuid REFERENCES suborden(id),
  viaje_id                 uuid REFERENCES viaje(id),
  liquidacion_id           uuid REFERENCES liquidacion(id),
  estado                   text NOT NULL DEFAULT 'borrador'
                           CHECK (estado IN ('borrador','emitida','enviada_dgii','aceptada_dgii','rechazada_dgii','anulada')),
  dgii_track_id            text,
  dgii_codigo_seguridad    text,
  dgii_respuesta           jsonb,
  dgii_enviada_en          timestamptz,
  motivo_anulacion         text,
  anulada_en               timestamptz,
  xml_url                  text,
  pdf_url                  text,
  fecha_emision            timestamptz,
  creado_en                timestamptz NOT NULL DEFAULT now(),
  actualizado_en           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_factura_notas CHECK ((tipo_documento = 'factura') = (factura_origen_id IS NULL)),
  CONSTRAINT ck_factura_emitida CHECK (estado = 'borrador' OR (ncf IS NOT NULL AND fecha_emision IS NOT NULL)),
  CONSTRAINT ck_factura_anulada CHECK ((estado = 'anulada') = (anulada_en IS NOT NULL AND motivo_anulacion IS NOT NULL)),
  CONSTRAINT ck_factura_total CHECK (total = monto_exento + base_imponible + itbis + propina_legal),
  CONSTRAINT ck_factura_origen CHECK (
    (origen = 'pedido' AND pedido_id IS NOT NULL) OR
    (origen = 'suborden' AND suborden_id IS NOT NULL) OR
    (origen = 'viaje' AND viaje_id IS NOT NULL) OR
    (origen = 'liquidacion' AND liquidacion_id IS NOT NULL) OR
    origen IN ('comision','credito_empresa','seguro','manual'))
);
-- Un NCF jamás se repite para un mismo emisor.
CREATE UNIQUE INDEX uq_factura_ncf ON factura (emisor_contribuyente_id, ncf) WHERE ncf IS NOT NULL;
-- No se factura dos veces la misma venta, viaje o liquidación (anulada sí se puede volver a emitir).
CREATE UNIQUE INDEX uq_factura_pedido ON factura (pedido_id, tipo_documento) WHERE pedido_id IS NOT NULL AND estado <> 'anulada' AND tipo_documento = 'factura';
CREATE UNIQUE INDEX uq_factura_vendedor_pedido ON factura (suborden_id, tipo_documento)
  WHERE suborden_id IS NOT NULL AND estado <> 'anulada' AND tipo_documento = 'factura';
CREATE UNIQUE INDEX uq_factura_viaje ON factura (viaje_id, tipo_documento) WHERE viaje_id IS NOT NULL AND estado <> 'anulada' AND tipo_documento = 'factura';
CREATE UNIQUE INDEX uq_factura_liquidacion ON factura (liquidacion_id, tipo_documento)
  WHERE liquidacion_id IS NOT NULL AND estado <> 'anulada' AND tipo_documento = 'factura';
CREATE INDEX ix_factura_receptor ON factura (receptor_uid, fecha_emision DESC);
CREATE INDEX ix_factura_emisor_tipo ON factura (emisor_contribuyente_id, fecha_emision DESC);
CREATE INDEX ix_factura_periodo ON factura (fecha_emision);
CREATE INDEX ix_factura_pendiente_dgii ON factura (creado_en) WHERE estado IN ('emitida','rechazada_dgii');
COMMENT ON TABLE factura IS '[facturacion] Facturas y notas con NCF/e-CF (UC-BILL-01, 07, 08, UC-DGII-13..16, UC-PAY-26, UC-TRA-17).';

CREATE TABLE factura_linea (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id       uuid NOT NULL REFERENCES factura(id) ON DELETE CASCADE,
  linea            integer NOT NULL CHECK (linea > 0),
  codigo           text,
  descripcion      text NOT NULL,
  unidad_medida    text NOT NULL DEFAULT 'unidad',
  cantidad         numeric(14,3) NOT NULL CHECK (cantidad > 0),
  precio_unitario  numeric(14,4) NOT NULL CHECK (precio_unitario >= 0),
  descuento        numeric(14,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  regimen_itbis    text NOT NULL CHECK (regimen_itbis IN ('exento','gravado','tasa_cero')),
  -- Congelada: la de la fecha de emisión, aunque la tasa cambie después.
  tasa_itbis       numeric(5,4) NOT NULL DEFAULT 0 CHECK (tasa_itbis BETWEEN 0 AND 1),
  monto_itbis      numeric(14,2) NOT NULL DEFAULT 0 CHECK (monto_itbis >= 0),
  total_linea      numeric(14,2) NOT NULL CHECK (total_linea >= 0),
  UNIQUE (factura_id, linea)
);
COMMENT ON TABLE factura_linea IS '[facturacion] Detalle de la factura.';

CREATE TABLE dgii_envio (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id     uuid NOT NULL REFERENCES factura(id),
  intento        integer NOT NULL CHECK (intento > 0),
  endpoint       text NOT NULL,
  peticion       jsonb,
  respuesta      jsonb,
  codigo_http    integer,
  resultado      text NOT NULL CHECK (resultado IN ('aceptado','rechazado','error_red','pendiente')),
  mensaje_error  text,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (factura_id, intento)
);
COMMENT ON TABLE dgii_envio IS '[fiscal] Cada envío de un e-CF a la DGII y su respuesta.';

CREATE TABLE comision (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- La suborden o el viaje que la generó.
  suborden_id          uuid REFERENCES suborden(id),
  viaje_id             uuid REFERENCES viaje(id),
  obligado_uid         uuid NOT NULL REFERENCES usuario(id),
  obligado_tipo        text NOT NULL CHECK (obligado_tipo IN ('vendedor','transportista')),
  regla_id             uuid NOT NULL REFERENCES regla_comision(id),
  base_calculo         numeric(14,2) NOT NULL CHECK (base_calculo >= 0),
  porcentaje_aplicado  numeric(5,4) NOT NULL CHECK (porcentaje_aplicado BETWEEN 0 AND 1),
  monto                numeric(14,2) NOT NULL CHECK (monto >= 0),
  -- La comisión sí paga ITBIS: es un servicio de BANEY.
  itbis_comision       numeric(14,2) NOT NULL DEFAULT 0 CHECK (itbis_comision >= 0),
  total                numeric(14,2) NOT NULL CHECK (total >= 0),
  moneda               codigo_moneda NOT NULL DEFAULT 'DOP',
  -- Factura que BANEY le emite al vendedor o transportista.
  factura_id           uuid REFERENCES factura(id),
  liquidacion_id       uuid REFERENCES liquidacion(id),
  estado               text NOT NULL DEFAULT 'calculada' CHECK (estado IN ('calculada','facturada','liquidada','anulada')),
  creado_en            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_comision_origen CHECK (num_nonnulls(suborden_id, viaje_id) = 1),
  CONSTRAINT ck_comision_total CHECK (total = monto + itbis_comision)
);
CREATE UNIQUE INDEX uq_comision_vendedor_pedido ON comision (suborden_id) WHERE suborden_id IS NOT NULL AND estado <> 'anulada';
CREATE UNIQUE INDEX uq_comision_viaje ON comision (viaje_id) WHERE viaje_id IS NOT NULL AND estado <> 'anulada';
COMMENT ON TABLE comision IS '[facturacion] Comisión BANEY por cada venta o viaje (UC-BILL-02, UC-TRA-156).';

CREATE TABLE liquidacion_linea (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liquidacion_id   uuid NOT NULL REFERENCES liquidacion(id) ON DELETE CASCADE,
  concepto         text NOT NULL CHECK (concepto IN ('venta','flete','comision','retencion_itbis','retencion_isr',
                                                     'reembolso','penalidad','ajuste','propina','cargo_adicional')),
  suborden_id      uuid REFERENCES suborden(id),
  viaje_id         uuid REFERENCES viaje(id),
  comision_id      uuid REFERENCES comision(id),
  devolucion_id    uuid REFERENCES devolucion(id),
  descripcion      text NOT NULL,
  -- Con signo: + suma al neto, − resta.
  monto            numeric(14,2) NOT NULL,
  fecha_operacion  date NOT NULL
);
CREATE INDEX ix_liquidacion_linea ON liquidacion_linea (liquidacion_id, concepto);
COMMENT ON TABLE liquidacion_linea IS '[facturacion] Detalle de la liquidación con el desglose por viaje o venta (UC-TRA-188).';

CREATE TABLE retencion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liquidacion_id  uuid NOT NULL REFERENCES liquidacion(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('itbis_retenido','isr','otro')),
  base            numeric(14,2) NOT NULL CHECK (base >= 0),
  tasa            numeric(5,4) NOT NULL CHECK (tasa BETWEEN 0 AND 1),
  monto           numeric(14,2) NOT NULL CHECK (monto >= 0),
  norma           text,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE retencion IS '[facturacion] Retenciones de ITBIS e ISR aplicadas en una liquidación.';

CREATE TABLE cierre_contable (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_anio      smallint NOT NULL CHECK (periodo_anio BETWEEN 2024 AND 2100),
  periodo_mes       smallint NOT NULL CHECK (periodo_mes BETWEEN 1 AND 12),
  total_facturado   numeric(16,2) NOT NULL DEFAULT 0,
  total_itbis       numeric(16,2) NOT NULL DEFAULT 0,
  total_comisiones  numeric(16,2) NOT NULL DEFAULT 0,
  total_liquidado   numeric(16,2) NOT NULL DEFAULT 0,
  total_reembolsos  numeric(16,2) NOT NULL DEFAULT 0,
  -- Contra caja; 0 = cuadrado.
  diferencia_caja   numeric(16,2) NOT NULL DEFAULT 0,
  estado            text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','en_revision','cerrado','reabierto')),
  cerrado_por_uid   uuid REFERENCES usuario(id),
  cerrado_en        timestamptz,
  notas             text,
  UNIQUE (periodo_anio, periodo_mes)
);
COMMENT ON TABLE cierre_contable IS '[facturacion] Cierre contable mensual (UC-BILL-06).';

ALTER TABLE devolucion ADD CONSTRAINT fk_devolucion_credito_nota FOREIGN KEY (nota_credito_id) REFERENCES factura(id);
ALTER TABLE reembolso ADD CONSTRAINT fk_reembolso_credito_nota FOREIGN KEY (nota_credito_id) REFERENCES factura(id);

-- >>> sql/16_cash.sql
-- =====================================================================
--  Caja (finanzas del vendedor y del transportista) · dueño: caja-service (Triana)
--  UC-CAJ-01..20, UC-TRA-33/34, UC-PAY-27/28
--  El saldo nunca se escribe a mano: sale de sumar los movimientos, que
--  son de solo inserción. Un trigger mantiene el saldo al día.
-- =====================================================================

CREATE TABLE cuenta (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_tipo    text NOT NULL CHECK (titular_tipo IN ('plataforma','vendedor','transportista')),
  titular_uid     uuid REFERENCES usuario(id),
  titular_nombre  text NOT NULL,
  titular_rnc     text,
  moneda          codigo_moneda NOT NULL DEFAULT 'DOP',
  estado          text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','suspendida','cerrada')),
  creado_en       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_cuenta_titular CHECK ((titular_tipo = 'plataforma') = (titular_uid IS NULL))
);
CREATE UNIQUE INDEX uq_cuenta_titular ON cuenta (titular_uid, titular_tipo, moneda) WHERE titular_uid IS NOT NULL;
CREATE UNIQUE INDEX uq_cuenta_plataforma ON cuenta (moneda) WHERE titular_tipo = 'plataforma';
COMMENT ON TABLE cuenta IS '[caja] Cuenta de saldo de cada vendedor, transportista y de BANEY (UC-CAJ-01).';

CREATE TABLE saldo_cuenta (
  cuenta_id             uuid PRIMARY KEY REFERENCES cuenta(id),
  disponible            numeric(16,2) NOT NULL DEFAULT 0,
  pendiente             numeric(16,2) NOT NULL DEFAULT 0,
  retenido              numeric(16,2) NOT NULL DEFAULT 0,
  total                 numeric(16,2) GENERATED ALWAYS AS (disponible + pendiente + retenido) STORED,
  ultimo_movimiento_id  uuid,
  -- Última vez que un proceso nocturno lo comparó con la suma del libro (v_descuadre_saldos).
  verificado_en         timestamptz,
  actualizado_en        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE saldo_cuenta IS '[caja] Saldo disponible, pendiente y retenido; lo mantiene el trigger de movimiento.';

CREATE TABLE cuenta_bancaria (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id          uuid NOT NULL REFERENCES cuenta(id),
  banco              text NOT NULL,
  tipo               text NOT NULL CHECK (tipo IN ('ahorro','corriente')),
  -- Cifrado por la app; aquí solo se ven los últimos 4 dígitos.
  numero_cifrado     bytea NOT NULL,
  ultimos4           char(4) NOT NULL CHECK (ultimos4 ~ '^[0-9]{4}$'),
  titular_nombre     text NOT NULL,
  titular_documento  text NOT NULL,
  moneda             codigo_moneda NOT NULL DEFAULT 'DOP',
  verificada         boolean NOT NULL DEFAULT false,
  verificada_en      timestamptz,
  es_principal       boolean NOT NULL DEFAULT false,
  activa             boolean NOT NULL DEFAULT true,
  creado_en          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_cuenta_bancaria_principal ON cuenta_bancaria (cuenta_id) WHERE es_principal AND activa;
COMMENT ON TABLE cuenta_bancaria IS '[caja] Cuenta bancaria para recibir los payout (UC-CAJ-18).';

CREATE TABLE payout (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero               text NOT NULL UNIQUE,
  cuenta_id            uuid NOT NULL REFERENCES cuenta(id),
  cuenta_bancaria_id   uuid NOT NULL REFERENCES cuenta_bancaria(id),
  liquidacion_id       uuid REFERENCES liquidacion(id),
  origen               text NOT NULL CHECK (origen IN ('solicitud_manual','programado','liquidacion')),
  monto                numeric(14,2) NOT NULL CHECK (monto > 0),
  comision_retiro      numeric(14,2) NOT NULL DEFAULT 0 CHECK (comision_retiro >= 0),
  monto_neto           numeric(14,2) NOT NULL CHECK (monto_neto > 0),
  moneda               codigo_moneda NOT NULL DEFAULT 'DOP',
  estado               text NOT NULL DEFAULT 'solicitado'
                       CHECK (estado IN ('solicitado','aprobado','rechazado','en_proceso','pagado','fallido','revertido')),
  motivo_rechazo       text,
  aprobado_por_uid     uuid REFERENCES usuario(id),
  referencia_bancaria  text,
  -- Nunca pagar dos veces el mismo retiro.
  idempotency_key      text NOT NULL UNIQUE,
  solicitado_en        timestamptz NOT NULL DEFAULT now(),
  aprobado_en          timestamptz,
  pagado_en            timestamptz,
  CONSTRAINT ck_payout_neto CHECK (monto_neto = monto - comision_retiro)
);
CREATE INDEX ix_payout_cuenta ON payout (cuenta_id, estado, solicitado_en DESC);
CREATE INDEX ix_payout_estado ON payout (estado, solicitado_en);
COMMENT ON TABLE payout IS '[caja] Retiros de fondos a la cuenta bancaria (UC-CAJ-06, 19, UC-TRA-34, UC-BILL-04/05).';

CREATE TABLE payout_programacion (
  cuenta_id        uuid PRIMARY KEY REFERENCES cuenta(id),
  frecuencia       text NOT NULL CHECK (frecuencia IN ('diaria','semanal','quincenal','mensual','manual')),
  dia_semana       smallint CHECK (dia_semana BETWEEN 1 AND 7),
  dia_mes          smallint CHECK (dia_mes BETWEEN 1 AND 28),
  monto_minimo     numeric(14,2) NOT NULL DEFAULT 0 CHECK (monto_minimo >= 0),
  activa           boolean NOT NULL DEFAULT true,
  proxima_corrida  date,
  CONSTRAINT ck_payout_programacion_fecha CHECK (
    (frecuencia = 'semanal') = (dia_semana IS NOT NULL) AND (frecuencia = 'mensual') = (dia_mes IS NOT NULL))
);
COMMENT ON TABLE payout_programacion IS '[caja] Frecuencia automática de payout (UC-PAY-28).';

CREATE TABLE conciliacion (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origen             text NOT NULL CHECK (origen IN ('azul','cardnet','banco','manual')),
  periodo_desde      date NOT NULL,
  periodo_hasta      date NOT NULL,
  archivo_url        text,
  total_externo      numeric(16,2) NOT NULL DEFAULT 0,
  total_interno      numeric(16,2) NOT NULL DEFAULT 0,
  diferencia         numeric(16,2) GENERATED ALWAYS AS (total_externo - total_interno) STORED,
  lineas_cuadradas   integer NOT NULL DEFAULT 0,
  lineas_sobrantes   integer NOT NULL DEFAULT 0,
  lineas_faltantes   integer NOT NULL DEFAULT 0,
  estado             text NOT NULL DEFAULT 'en_proceso' CHECK (estado IN ('en_proceso','cuadrada','con_diferencias','cerrada')),
  ejecutado_por_uid  uuid REFERENCES usuario(id),
  creado_en          timestamptz NOT NULL DEFAULT now(),
  cerrada_en         timestamptz,
  CONSTRAINT ck_conciliacion_periodo CHECK (periodo_desde <= periodo_hasta)
);
COMMENT ON TABLE conciliacion IS '[caja] Conciliación contra el reporte de la pasarela o el banco (UC-CAJ-09, UC-BILL-06).';

CREATE TABLE movimiento (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id           uuid NOT NULL REFERENCES cuenta(id),
  tipo                text NOT NULL CHECK (tipo IN ('venta','flete','comision','itbis','retencion','payout','reembolso',
                                                    'devolucion','penalidad','ajuste','contra_asiento','cargo_pasarela',
                      'cobro_efectivo','comision_efectivo')),
  -- Positivo suma al saldo, negativo resta.
  monto               numeric(14,2) NOT NULL CHECK (monto <> 0),
  saldo_despues       numeric(16,2) NOT NULL,
  moneda              codigo_moneda NOT NULL,
  -- Pendiente hasta que el pago se libera; retenido mientras hay una disputa.
  estado_fondos       text NOT NULL DEFAULT 'pendiente' CHECK (estado_fondos IN ('pendiente','disponible','retenido')),
  -- T+N según la política de liberación de fondos.
  disponible_desde    date,
  fecha_valor         date NOT NULL DEFAULT current_date,
  pago_id             uuid REFERENCES pago(id),
  reembolso_id        uuid REFERENCES reembolso(id),
  factura_id          uuid REFERENCES factura(id),
  comision_id         uuid REFERENCES comision(id),
  liquidacion_id      uuid REFERENCES liquidacion(id),
  payout_id           uuid REFERENCES payout(id),
  suborden_id         uuid REFERENCES suborden(id),
  viaje_id            uuid REFERENCES viaje(id),
  descripcion         text NOT NULL,
  -- Id de la transacción en Azul/CardNet, para conciliar.
  referencia_externa  text,
  conciliado          boolean NOT NULL DEFAULT false,
  conciliacion_id     uuid REFERENCES conciliacion(id),
  -- Corregir un movimiento es crear otro que lo compensa y apunta a él.
  corrige_mov_id      uuid REFERENCES movimiento(id),
  actor_uid           uuid REFERENCES usuario(id),
  creado_en           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_movimiento_cuenta ON movimiento (cuenta_id, fecha_valor, creado_en);
CREATE INDEX ix_movimiento_tipo ON movimiento (cuenta_id, tipo, fecha_valor);
CREATE INDEX ix_movimiento_fondos ON movimiento (cuenta_id, estado_fondos, disponible_desde);
CREATE INDEX ix_movimiento_externa ON movimiento (referencia_externa) WHERE referencia_externa IS NOT NULL;
CREATE INDEX ix_movimiento_sin_conciliar ON movimiento (fecha_valor) WHERE NOT conciliado;
-- El mismo evento repetido no vuelve a asentar: una entrada por cuenta, tipo y origen.
CREATE UNIQUE INDEX uq_movimiento_idempotente ON movimiento (cuenta_id, tipo,
  coalesce(pago_id, reembolso_id, factura_id, comision_id, liquidacion_id, payout_id, suborden_id, viaje_id))
  WHERE coalesce(pago_id, reembolso_id, factura_id, comision_id, liquidacion_id, payout_id, suborden_id, viaje_id) IS NOT NULL;
COMMENT ON TABLE movimiento IS '[caja] Movimientos de saldo, de solo inserción (UC-CAJ-02..08, 10, 12, UC-TRA-33).';

-- La conciliación marca movimientos como conciliados; es la única edición
-- permitida y no toca montos.
CREATE FUNCTION validar_cambio_movimiento() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los movimientos no se borran' USING ERRCODE = '55000';
  END IF;
  IF (NEW.conciliado, NEW.conciliacion_id) IS DISTINCT FROM (OLD.conciliado, OLD.conciliacion_id)
     AND (to_jsonb(NEW) - 'conciliado' - 'conciliacion_id') = (to_jsonb(OLD) - 'conciliado' - 'conciliacion_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Solo se puede marcar la conciliación de un movimiento' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER validar_cambio_movimiento BEFORE UPDATE OR DELETE ON movimiento
  FOR EACH ROW EXECUTE FUNCTION validar_cambio_movimiento();

CREATE FUNCTION asentar_movimiento() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE acc cuenta; bal saldo_cuenta;
BEGIN
  SELECT * INTO acc FROM cuenta WHERE id = NEW.cuenta_id;
  IF acc.estado <> 'activa' OR acc.moneda <> NEW.moneda THEN
    RAISE EXCEPTION 'La cuenta debe estar activa y en la misma moneda' USING ERRCODE = '23514';
  END IF;
  INSERT INTO saldo_cuenta (cuenta_id) VALUES (NEW.cuenta_id) ON CONFLICT DO NOTHING;
  -- El FOR UPDATE ordena los movimientos simultáneos de una misma cuenta.
  SELECT * INTO bal FROM saldo_cuenta WHERE cuenta_id = NEW.cuenta_id FOR UPDATE;
  NEW.saldo_despues := bal.total + NEW.monto;
  UPDATE saldo_cuenta SET
    disponible = disponible + CASE WHEN NEW.estado_fondos = 'disponible' THEN NEW.monto ELSE 0 END,
    pendiente   = pendiente   + CASE WHEN NEW.estado_fondos = 'pendiente'  THEN NEW.monto ELSE 0 END,
    retenido      = retenido      + CASE WHEN NEW.estado_fondos = 'retenido'   THEN NEW.monto ELSE 0 END,
    ultimo_movimiento_id = NEW.id,
    actualizado_en = now()
  WHERE cuenta_id = NEW.cuenta_id;
  RETURN NEW;
END $$;
CREATE TRIGGER asentar_movimiento BEFORE INSERT ON movimiento FOR EACH ROW EXECUTE FUNCTION asentar_movimiento();

CREATE TABLE conciliacion_linea (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conciliacion_id     uuid NOT NULL REFERENCES conciliacion(id) ON DELETE CASCADE,
  movimiento_id       uuid REFERENCES movimiento(id),
  referencia_externa  text,
  fecha_externa       date,
  monto_externo       numeric(14,2),
  monto_interno       numeric(14,2),
  diferencia          numeric(14,2) NOT NULL DEFAULT 0,
  -- sobrante_externo: está en la pasarela y no en BANEY; faltante_externo: al revés.
  resultado           text NOT NULL CHECK (resultado IN ('cuadrado','sobrante_externo','faltante_externo',
                                                         'monto_distinto','duplicado')),
  resuelto            boolean NOT NULL DEFAULT false,
  nota                text
);
CREATE INDEX ix_conciliacion_linea_abierto ON conciliacion_linea (conciliacion_id) WHERE NOT resuelto;
COMMENT ON TABLE conciliacion_linea IS '[caja] Línea a línea de la conciliación; las no cuadradas son pagos no conciliados (UC-CAJ-10).';

-- >>> sql/17_insurance.sql
-- =====================================================================
--  Seguro de carga · dueño: transport-service (Adrian)
--  UC-SEG-01/02
-- =====================================================================

CREATE TABLE poliza_seguro_carga (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_transporte_id  uuid NOT NULL UNIQUE REFERENCES solicitud_transporte(id),
  asegurado_uid            uuid NOT NULL REFERENCES usuario(id),
  plan_cobertura           text NOT NULL CHECK (plan_cobertura IN ('basica','ampliada')),
  valor_declarado          numeric(14,2) NOT NULL CHECK (valor_declarado > 0),
  prima                    numeric(14,2) NOT NULL CHECK (prima >= 0),
  deducible                numeric(14,2) NOT NULL DEFAULT 0 CHECK (deducible >= 0),
  moneda                   codigo_moneda NOT NULL DEFAULT 'DOP',
  aseguradora              text NOT NULL,
  numero_poliza            text UNIQUE,
  pago_id                  uuid REFERENCES pago(id),
  estado                   text NOT NULL DEFAULT 'cotizada' CHECK (estado IN ('cotizada','contratada','cancelada','vencida')),
  contratada_en            timestamptz,
  creado_en                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_poliza_seguro_carga_contratada CHECK (estado <> 'contratada' OR (pago_id IS NOT NULL AND contratada_en IS NOT NULL))
);
COMMENT ON TABLE poliza_seguro_carga IS '[seguros] Seguro de carga contratado para un viaje (UC-SEG-01).';

CREATE TABLE reclamo_seguro (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poliza_id               uuid NOT NULL REFERENCES poliza_seguro_carga(id),
  reclamante_uid          uuid NOT NULL REFERENCES usuario(id),
  incidente_id            uuid REFERENCES incidente(id),
  tipo                    text NOT NULL CHECK (tipo IN ('dano','perdida')),
  descripcion             text NOT NULL,
  monto_reclamado         numeric(14,2) NOT NULL CHECK (monto_reclamado > 0),
  monto_aprobado          numeric(14,2) CHECK (monto_aprobado >= 0),
  estado                  text NOT NULL DEFAULT 'abierto'
                          CHECK (estado IN ('abierto','en_revision','aprobado','rechazado','pagado')),
  referencia_aseguradora  text,
  motivo_resolucion       text,
  resuelta_por_uid        uuid REFERENCES usuario(id),
  resuelta_en             timestamptz,
  creado_en               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_reclamo_seguro_monto CHECK (monto_aprobado IS NULL OR monto_aprobado <= monto_reclamado)
);
CREATE INDEX ix_reclamo_seguro_poliza ON reclamo_seguro (poliza_id);
COMMENT ON TABLE reclamo_seguro IS '[seguros] Reclamo por daño o pérdida de la carga (UC-SEG-02).';

CREATE TABLE reclamo_seguro_archivo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reclamo_id      uuid NOT NULL REFERENCES reclamo_seguro(id) ON DELETE CASCADE,
  tipo_contenido  text NOT NULL CHECK (tipo_contenido IN ('application/pdf','image/jpeg','image/png')),
  url             text NOT NULL UNIQUE,
  subido_por_uid  uuid NOT NULL REFERENCES usuario(id),
  creado_en       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE reclamo_seguro_archivo IS '[seguros] Fotos y documentos del reclamo.';

-- >>> sql/18_school.sql
-- =====================================================================
--  Escuela · dueño: school-service (Adrian)
--  UC-ESC-01..22, UC-ADM-13
-- =====================================================================

CREATE TABLE curso (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  titulo          text NOT NULL,
  resumen         text,
  descripcion     text,
  portada_url     text,
  nivel           text NOT NULL DEFAULT 'basico' CHECK (nivel IN ('basico','intermedio','avanzado')),
  publico         text NOT NULL DEFAULT 'todos' CHECK (publico IN ('todos','productores','transportistas','vendedores')),
  idioma          text NOT NULL DEFAULT 'es' CHECK (idioma IN ('es','en','ht')),
  estado          text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','publicado','despublicado')),
  instructor_uid  uuid REFERENCES usuario(id),
  creado_por_uid  uuid NOT NULL REFERENCES usuario(id),
  publicado_en    timestamptz,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_curso_publicado CHECK (estado <> 'publicado' OR publicado_en IS NOT NULL)
);
CREATE INDEX ix_curso_catalogo ON curso (publico, nivel) WHERE estado = 'publicado';
COMMENT ON TABLE curso IS '[escuela] Cursos (UC-ESC-01, 02, 17, 21).';

CREATE TABLE curso_modulo (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id  uuid NOT NULL REFERENCES curso(id) ON DELETE CASCADE,
  titulo    text NOT NULL,
  orden     smallint NOT NULL,
  UNIQUE (curso_id, orden)
);
COMMENT ON TABLE curso_modulo IS '[escuela] Módulos del curso (UC-ESC-18).';

CREATE TABLE leccion (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_id         uuid NOT NULL REFERENCES curso_modulo(id) ON DELETE CASCADE,
  titulo            text NOT NULL,
  orden             smallint NOT NULL,
  tipo_contenido    text NOT NULL CHECK (tipo_contenido IN ('video','texto','pdf','audio')),
  contenido_url     text,
  cuerpo            text,
  duracion_minutos  smallint CHECK (duracion_minutos > 0),
  material_url      text,
  UNIQUE (modulo_id, orden),
  CONSTRAINT ck_leccion_contenido CHECK (contenido_url IS NOT NULL OR cuerpo IS NOT NULL)
);
COMMENT ON TABLE leccion IS '[escuela] Lecciones y material descargable (UC-ESC-05, 06, 19).';

CREATE TABLE inscripcion (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id             uuid NOT NULL REFERENCES curso(id),
  usuario_uid          uuid NOT NULL REFERENCES usuario(id),
  estado               text NOT NULL DEFAULT 'inscrito' CHECK (estado IN ('inscrito','en_curso','completado','abandonado')),
  progreso_porcentaje  numeric(5,2) NOT NULL DEFAULT 0 CHECK (progreso_porcentaje BETWEEN 0 AND 100),
  -- Para "continuar desde el último punto" (UC-ESC-08).
  ultima_leccion_id    uuid REFERENCES leccion(id),
  inscrito_en          timestamptz NOT NULL DEFAULT now(),
  iniciado_en          timestamptz,
  completado_en        timestamptz,
  UNIQUE (curso_id, usuario_uid),
  CONSTRAINT ck_inscripcion_completado CHECK ((estado = 'completado') = (completado_en IS NOT NULL))
);
CREATE INDEX ix_inscripcion_usuario ON inscripcion (usuario_uid);
COMMENT ON TABLE inscripcion IS '[escuela] Inscripción y progreso (UC-ESC-03, 04, 08, 12, 13).';

CREATE TABLE leccion_progreso (
  inscripcion_id  uuid NOT NULL REFERENCES inscripcion(id) ON DELETE CASCADE,
  leccion_id      uuid NOT NULL REFERENCES leccion(id) ON DELETE CASCADE,
  completado_en   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (inscripcion_id, leccion_id)
);
COMMENT ON TABLE leccion_progreso IS '[escuela] Lecciones completadas (UC-ESC-07).';

CREATE TABLE evaluacion (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id         uuid NOT NULL REFERENCES curso(id) ON DELETE CASCADE,
  modulo_id        uuid REFERENCES curso_modulo(id) ON DELETE CASCADE,
  titulo           text NOT NULL,
  nota_aprobacion  numeric(5,2) NOT NULL CHECK (nota_aprobacion BETWEEN 0 AND 100),
  intentos_max     smallint CHECK (intentos_max > 0),
  activa           boolean NOT NULL DEFAULT true,
  creado_en        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE evaluacion IS '[escuela] Evaluaciones del curso o del módulo (UC-ESC-20).';

CREATE TABLE pregunta_evaluacion (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluacion_id       uuid NOT NULL REFERENCES evaluacion(id) ON DELETE CASCADE,
  orden               smallint NOT NULL,
  enunciado           text NOT NULL,
  tipo                text NOT NULL CHECK (tipo IN ('opcion_unica','opcion_multiple','verdadero_falso')),
  opciones            jsonb NOT NULL,
  respuesta_correcta  jsonb NOT NULL,
  puntos              numeric(5,2) NOT NULL DEFAULT 1 CHECK (puntos > 0),
  UNIQUE (evaluacion_id, orden)
);
COMMENT ON TABLE pregunta_evaluacion IS '[escuela] Preguntas con su respuesta correcta.';

CREATE TABLE intento_evaluacion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluacion_id   uuid NOT NULL REFERENCES evaluacion(id),
  inscripcion_id  uuid NOT NULL REFERENCES inscripcion(id),
  respuestas      jsonb NOT NULL DEFAULT '{}'::jsonb,
  puntuacion      numeric(5,2) CHECK (puntuacion BETWEEN 0 AND 100),
  aprobado        boolean,
  iniciado_en     timestamptz NOT NULL DEFAULT now(),
  enviado_en      timestamptz,
  CONSTRAINT ck_intento_evaluacion_calificado CHECK ((enviado_en IS NULL) = (puntuacion IS NULL))
);
CREATE INDEX ix_intento_evaluacion_inscripcion ON intento_evaluacion (inscripcion_id, evaluacion_id);
COMMENT ON TABLE intento_evaluacion IS '[escuela] Intentos de evaluación y su nota (UC-ESC-09..11).';

CREATE TABLE certificado (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inscripcion_id      uuid NOT NULL UNIQUE REFERENCES inscripcion(id),
  numero_certificado  text NOT NULL UNIQUE,
  fecha_emision       timestamptz NOT NULL DEFAULT now(),
  expira_en           timestamptz,
  pdf_url             text
);
COMMENT ON TABLE certificado IS '[escuela] Certificado del curso completado (UC-ESC-14/15).';

-- Conversación con el asistente (N8n): se guarda para continuarla y para
-- medir qué preguntan las personas.
CREATE TABLE mensaje_asistente (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_uid  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  curso_id     uuid REFERENCES curso(id),
  leccion_id   uuid REFERENCES leccion(id),
  rol          text NOT NULL CHECK (rol IN ('usuario','asistente')),
  contenido    text NOT NULL,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_mensaje_asistente_usuario ON mensaje_asistente (usuario_uid, creado_en);
COMMENT ON TABLE mensaje_asistente IS '[escuela] Mensajes con el asistente del curso (UC-ESC-16).';

-- >>> sql/19_reviews_analytics.sql
-- =====================================================================
--  Reseñas · dueños: martketplace (productos y vendedores) y transport-service
--  UC-MKT-24/25, UC-TRA-15/35/77/189/190
--  Una sola tabla para calificar productos, vendedores, transportistas y
--  clientes: el rating de una persona no depende de dónde la calificaron.
-- =====================================================================

CREATE TABLE resena (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                text NOT NULL CHECK (tipo IN ('producto','vendedor','transportista','cliente')),
  producto_id         uuid REFERENCES producto(id),
  calificado_uid      uuid REFERENCES usuario(id),
  autor_uid           uuid NOT NULL REFERENCES usuario(id),
  -- Copia: el nombre de la reseña no cambia al editar el perfil.
  autor_nombre        text NOT NULL,
  -- Solo califica quien compró o viajó: la reseña apunta al pedido o al viaje.
  suborden_id         uuid REFERENCES suborden(id),
  viaje_id            uuid REFERENCES viaje(id),
  puntuacion          smallint NOT NULL CHECK (puntuacion BETWEEN 1 AND 5),
  titulo              text,
  comentario          text,
  moderacion          text NOT NULL DEFAULT 'pendiente' CHECK (moderacion IN ('pendiente','aprobada','rechazada')),
  respuesta_vendedor  text,
  respondida_en       timestamptz,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_resena_sujeto CHECK (
    (tipo = 'producto' AND producto_id IS NOT NULL AND calificado_uid IS NULL) OR
    (tipo <> 'producto' AND calificado_uid IS NOT NULL AND producto_id IS NULL)),
  CONSTRAINT ck_resena_origen CHECK (num_nonnulls(suborden_id, viaje_id) = 1),
  CONSTRAINT ck_resena_mismo CHECK (calificado_uid IS DISTINCT FROM autor_uid),
  CONSTRAINT ck_resena_respuesta_vendedor CHECK ((respuesta_vendedor IS NULL) = (respondida_en IS NULL))
);
-- Una reseña por autor, por pedido o viaje, y por lo que se califica.
CREATE UNIQUE INDEX uq_resena_unica ON resena (autor_uid, tipo, coalesce(producto_id, calificado_uid),
  coalesce(suborden_id, viaje_id));
CREATE INDEX ix_resena_producto ON resena (producto_id, moderacion, creado_en DESC) WHERE producto_id IS NOT NULL;
CREATE INDEX ix_resena_usuario ON resena (calificado_uid, tipo, creado_en DESC) WHERE calificado_uid IS NOT NULL;
COMMENT ON TABLE resena IS '[resenas] Calificaciones de productos, vendedores, transportistas y clientes.';

-- =====================================================================
--  Analítica y reportes · dueño: analytics-service (Adrian)
--  UC-ANL-01..13, UC-ADM-14, UC-CAJ-13..15, UC-EMP-05
--  Los KPI se calculan de las tablas de negocio; aquí solo se guardan las
--  series diarias ya agregadas y los archivos exportados.
-- =====================================================================

CREATE TABLE metrica (
  codigo         text PRIMARY KEY,
  nombre         text NOT NULL,
  unidad_medida  text NOT NULL CHECK (unidad_medida IN ('cantidad','monto','porcentaje','minutos')),
  descripcion    text NOT NULL
);
COMMENT ON TABLE metrica IS '[analitica] Catálogo de KPI: usuarios activos, GMV, conversión... (UC-ANL-01..12).';

CREATE TABLE metrica_valor_diario (
  metrica_codigo  text NOT NULL REFERENCES metrica(codigo),
  fecha           date NOT NULL,
  -- Corte del valor: {"provincia":"Santiago"}; vacío para el total.
  dimensiones     jsonb NOT NULL DEFAULT '{}'::jsonb,
  valor           numeric(18,4) NOT NULL,
  calculado_en    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (metrica_codigo, fecha, dimensiones)
);
COMMENT ON TABLE metrica_valor_diario IS '[analitica] Valor diario de cada KPI por dimensión.';

CREATE TABLE reporte (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo              text NOT NULL CHECK (modulo IN ('caja','analitica','empresa','fiscal','administracion')),
  tipo                text NOT NULL CHECK (tipo IN ('estado_cuenta','movimientos_csv','mensual','impuestos','comisiones',
                                                    'reporte_606','reporte_607','kpi','viajes_empresa','auditoria')),
  formato             text NOT NULL CHECK (formato IN ('pdf','csv','xlsx')),
  solicitado_por_uid  uuid NOT NULL REFERENCES usuario(id),
  cuenta_id           uuid REFERENCES cuenta(id),
  empresa_id          uuid REFERENCES empresa(id),
  periodo_desde       date NOT NULL,
  periodo_hasta       date NOT NULL,
  filtros             jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Se genera aparte: un vendedor con 50.000 movimientos no puede esperar a que termine la petición.
  estado              text NOT NULL DEFAULT 'encolado' CHECK (estado IN ('encolado','generando','listo','fallido','expirado')),
  archivo_url         text,
  bytes               bigint CHECK (bytes >= 0),
  error               text,
  -- El enlace firmado al archivo caduca.
  expira_en           timestamptz,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  generado_en         timestamptz,
  CONSTRAINT ck_reporte_reporte_periodo CHECK (periodo_desde <= periodo_hasta),
  CONSTRAINT ck_reporte_reporte_listo CHECK (estado <> 'listo' OR archivo_url IS NOT NULL)
);
CREATE INDEX ix_reporte_solicitante ON reporte (solicitado_por_uid, creado_en DESC);
CREATE INDEX ix_reporte_cola ON reporte (creado_en) WHERE estado = 'encolado';
COMMENT ON TABLE reporte IS '[analitica] Reportes y exportaciones CSV/PDF de caja, KPI y empresa (UC-ANL-13, UC-CAJ-13..15, UC-EMP-05).';

-- >>> sql/99_final.sql
-- =====================================================================
--  Cierre del baseline: vistas, triggers comunes, índices de FK y datos
--  de referencia que no dependen de ningún ambiente.
-- =====================================================================

-- Disponibilidad para el catálogo (UC-MKT-06, UC-MAP-08). `disponible` ya
-- descuenta lo reservado; el total físico es la suma de los dos.
CREATE VIEW v_disponibilidad AS
SELECT s.variante_id, v.producto_id, p.vendedor_id,
       s.disponible, s.reservado, s.disponible + s.reservado AS total_fisico,
       CASE
         WHEN s.permite_sobreventa THEN 'disponible'
         WHEN s.disponible <= 0 THEN 'agotado'
         WHEN s.disponible <= s.umbral_alerta THEN 'pocas_unidades'
         ELSE 'disponible'
       END AS estado_disponibilidad
FROM existencia s
JOIN variante v ON v.id = s.variante_id
JOIN producto p ON p.id = v.producto_id;
COMMENT ON VIEW v_disponibilidad IS '[inventario] Disponibilidad por variante: disponible, pocas_unidades o agotado.';

-- Ventas por vendedor y día de pago (UC-MKT-42, UC-CAJ-02, UC-ANL-08).
CREATE VIEW v_ventas_vendedor AS
SELECT so.vendedor_id, (o.pagado_en AT TIME ZONE 'America/Santo_Domingo')::date AS fecha,
       count(DISTINCT so.id) AS subordenes, sum(so.subtotal) AS subtotal, sum(so.descuento) AS descuento,
       sum(so.itbis) AS itbis, sum(so.transporte) AS transporte, sum(so.total) AS total
FROM suborden so
JOIN pedido o ON o.id = so.pedido_id
WHERE o.pagado_en IS NOT NULL AND so.estado NOT IN ('rechazada','cancelada')
GROUP BY so.vendedor_id, (o.pagado_en AT TIME ZONE 'America/Santo_Domingo')::date;
COMMENT ON VIEW v_ventas_vendedor IS '[pedidos] Ventas pagadas de cada vendedor por día, en hora de República Dominicana.';

-- Debe estar siempre vacía: si el saldo guardado no es la suma de los
-- movimientos, algo escribió el saldo por fuera del trigger.
CREATE VIEW v_descuadre_saldos AS
SELECT b.cuenta_id, b.total AS saldo_materializado, coalesce(sum(e.monto), 0) AS saldo_real,
       b.total - coalesce(sum(e.monto), 0) AS diferencia
FROM saldo_cuenta b
LEFT JOIN movimiento e ON e.cuenta_id = b.cuenta_id
GROUP BY b.cuenta_id, b.total
HAVING abs(b.total - coalesce(sum(e.monto), 0)) > 0.005;
COMMENT ON VIEW v_descuadre_saldos IS '[caja] Cuentas cuyo saldo no cuadra con sus movimientos.';

-- Los cargos van con signo negativo; aquí se muestran en positivo por columna.
CREATE VIEW v_resumen_mensual AS
SELECT e.cuenta_id, date_trunc('month', e.fecha_valor)::date AS periodo,
       sum(e.monto) FILTER (WHERE e.tipo IN ('venta','flete')) AS ingresos,
       -sum(e.monto) FILTER (WHERE e.tipo = 'comision') AS comisiones,
       sum(e.monto) FILTER (WHERE e.tipo = 'itbis') AS itbis,
       -sum(e.monto) FILTER (WHERE e.tipo = 'retencion') AS retenciones,
       -sum(e.monto) FILTER (WHERE e.tipo = 'payout') AS payouts,
       -sum(e.monto) FILTER (WHERE e.tipo IN ('reembolso','devolucion')) AS reembolsos,
       sum(e.monto) AS neto,
       count(*) AS movimientos
FROM movimiento e
GROUP BY e.cuenta_id, date_trunc('month', e.fecha_valor);
COMMENT ON VIEW v_resumen_mensual IS '[caja] Resumen mensual: ingresos, comisiones, ITBIS, retenciones, payout y reembolsos (UC-CAJ-02..04, 15).';

-- Formato 607 de la DGII: facturas de venta emitidas en el mes. Lo pide el contador.
CREATE VIEW v_reporte_607 AS
SELECT i.emisor_contribuyente_id,
       to_char(i.fecha_emision AT TIME ZONE 'America/Santo_Domingo', 'YYYYMM') AS periodo,
       i.receptor_rnc, i.ncf, i.tipo_ecf,
       (i.fecha_emision AT TIME ZONE 'America/Santo_Domingo')::date AS fecha_comprobante,
       i.monto_exento, i.base_imponible, i.itbis, i.total
FROM factura i
WHERE i.tipo_documento = 'factura' AND i.estado IN ('emitida','enviada_dgii','aceptada_dgii') AND i.ncf IS NOT NULL;
COMMENT ON VIEW v_reporte_607 IS '[fiscal] Base del reporte 607 de ventas.';

-- actualizado_en al día en todas las tablas que lo tienen.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.table_name FROM information_schema.columns c
           JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
           WHERE c.table_schema = 'baney' AND c.column_name = 'actualizado_en' AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('CREATE TRIGGER marcar_actualizado_en BEFORE UPDATE ON baney.%I FOR EACH ROW EXECUTE FUNCTION baney.marcar_actualizado_en()',
                   r.table_name);
  END LOOP;
END $$;

-- Toda FK necesita un índice que empiece por sus columnas: sin él, borrar o
-- actualizar la fila referenciada recorre la tabla entera. El nombre sale de
-- la tabla y las columnas para que sea el mismo en todos los ambientes.
DO $$
DECLARE r record; cols text; idx text;
BEGIN
  FOR r IN
    SELECT c.conrelid, c.conkey, t.relname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f' AND n.nspname = 'baney'
    ORDER BY t.relname, c.conname
  LOOP
    -- Un índice parcial solo sirve si su condición es "primera columna IS NOT
    -- NULL" (la búsqueda de la FK siempre es por un valor no nulo); uno como
    -- "WHERE status = 'activa'" no cubre las demás filas.
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = r.conrelid
        AND (i.indkey::smallint[])[0:array_length(r.conkey, 1) - 1] = r.conkey
        AND (i.indpred IS NULL OR pg_get_expr(i.indpred, i.indrelid) =
             format('(%I IS NOT NULL)', (SELECT attname FROM pg_attribute WHERE attrelid = r.conrelid AND attnum = r.conkey[1])))
    ) THEN
      SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord),
             string_agg(a.attname, '_' ORDER BY k.ord)
        INTO cols, idx
      FROM unnest(r.conkey) WITH ORDINALITY k(num, ord)
      JOIN pg_attribute a ON a.attrelid = r.conrelid AND a.attnum = k.num;
      idx := left('ix_' || r.relname || '_' || idx, 63);
      EXECUTE format('CREATE INDEX %I ON baney.%I (%s)', idx, r.relname, cols);
    END IF;
  END LOOP;
END $$;

-- Datos de referencia: no hay usuarios, contraseñas ni credenciales.
-- La tasa también se copia en cada línea de factura: una factura de 2027 se
-- reimprime con la tasa de 2027 aunque después cambie.
INSERT INTO tasa_impuesto (codigo, nombre, tasa, vigente_desde) VALUES
  ('ITBIS_18', 'ITBIS tasa general', 0.18, '2026-01-01'),
  ('EXENTO', 'Exento de ITBIS (agropecuario)', 0, '2026-01-01'),
  ('TASA_CERO', 'Tasa cero (exportación)', 0, '2026-01-01');

INSERT INTO metrica (codigo, nombre, unidad_medida, descripcion) VALUES
  ('usuarios_activos', 'Usuarios activos', 'cantidad', 'Personas con al menos un inicio de sesión en el día'),
  ('gmv', 'GMV', 'monto', 'Valor bruto de pedidos y viajes pagados'),
  ('pedidos', 'Pedidos', 'cantidad', 'Pedidos pagados'),
  ('viajes', 'Viajes', 'cantidad', 'Viajes entregados'),
  ('conversion', 'Conversión', 'porcentaje', 'Carritos que terminan en pedido pagado'),
  ('ingresos', 'Ingresos', 'monto', 'Comisiones y cargos cobrados por BANEY'),
  ('comisiones', 'Comisiones', 'monto', 'Comisiones calculadas'),
  ('vendedores_activos', 'Vendedores activos', 'cantidad', 'Vendedores con al menos una venta'),
  ('transportistas_activos', 'Transportistas activos', 'cantidad', 'Transportistas con al menos un viaje'),
  ('cancelaciones', 'Cancelaciones', 'cantidad', 'Pedidos y viajes cancelados'),
  ('reembolsos', 'Reembolsos', 'monto', 'Monto reembolsado'),
  ('tiempo_entrega', 'Tiempo de entrega', 'minutos', 'Minutos promedio entre recogida y entrega');

INSERT INTO version_esquema (version, descripcion) VALUES ('001', 'Baseline BANEY: esquema único');

COMMIT;
