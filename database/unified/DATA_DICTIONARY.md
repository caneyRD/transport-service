# Diccionario físico BANEY

Generado desde PostgreSQL ejecutado: **161 tablas, 294 FK, 6 vistas**.

Los esquemas `baney_*` proceden de la rama de infraestructura, excepto ampliaciones identificadas en COVERAGE.md. `transport` parte del SQL recibido. Los demás esquemas son diseño nuevo basado en el PDF.

Las referencias genéricas de eventos/auditoría son intencionalmente lógicas: sobreviven al agregado. No se presentan como FK. Los campos `ref_*` calculados materializan las relaciones polimórficas comerciales.


## analytics.dashboard_metrics

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `dashboard_id` | `uuid` | No | `` |

| `metric_code` | `text` | No | `` |


### Restricciones



- `dashboard_metrics_dashboard_id_fkey`: `FOREIGN KEY (dashboard_id) REFERENCES analytics.dashboards(id)`

- `dashboard_metrics_dashboard_id_not_null`: `NOT NULL dashboard_id`

- `dashboard_metrics_metric_code_fkey`: `FOREIGN KEY (metric_code) REFERENCES analytics.metric_definitions(code)`

- `dashboard_metrics_metric_code_not_null`: `NOT NULL metric_code`

- `dashboard_metrics_pkey`: `PRIMARY KEY (dashboard_id, metric_code)`


### Índices



- `CREATE UNIQUE INDEX dashboard_metrics_pkey ON analytics.dashboard_metrics USING btree (dashboard_id, metric_code)`

- `CREATE INDEX ix_fk_20769 ON analytics.dashboard_metrics USING btree (metric_code)`


## analytics.dashboards

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `owner_id` | `text` | No | `` |

| `name` | `text` | No | `` |

| `layout` | `jsonb` | No | `` |


### Restricciones



- `dashboards_id_not_null`: `NOT NULL id`

- `dashboards_layout_not_null`: `NOT NULL layout`

- `dashboards_name_not_null`: `NOT NULL name`

- `dashboards_owner_id_fkey`: `FOREIGN KEY (owner_id) REFERENCES identity.users(id)`

- `dashboards_owner_id_not_null`: `NOT NULL owner_id`

- `dashboards_pkey`: `PRIMARY KEY (id)`


### Índices



- `CREATE UNIQUE INDEX dashboards_pkey ON analytics.dashboards USING btree (id)`

- `CREATE INDEX ix_fk_20750 ON analytics.dashboards USING btree (owner_id)`


## analytics.export_jobs

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `report_id` | `uuid` | No | `` |

| `requested_by` | `text` | No | `` |

| `format` | `text` | No | `` |

| `status` | `text` | No | `'QUEUED'::text` |

| `file_url` | `text` | Sí | `` |

| `expires_at` | `timestamp with time zone` | Sí | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `export_jobs_created_at_not_null`: `NOT NULL created_at`

- `export_jobs_format_check`: `CHECK ((format = ANY (ARRAY['CSV'::text, 'XLSX'::text, 'PDF'::text])))`

- `export_jobs_format_not_null`: `NOT NULL format`

- `export_jobs_id_not_null`: `NOT NULL id`

- `export_jobs_pkey`: `PRIMARY KEY (id)`

- `export_jobs_report_id_fkey`: `FOREIGN KEY (report_id) REFERENCES analytics.reports(id)`

- `export_jobs_report_id_not_null`: `NOT NULL report_id`

- `export_jobs_requested_by_fkey`: `FOREIGN KEY (requested_by) REFERENCES identity.users(id)`

- `export_jobs_requested_by_not_null`: `NOT NULL requested_by`

- `export_jobs_status_check`: `CHECK ((status = ANY (ARRAY['QUEUED'::text, 'RUNNING'::text, 'COMPLETED'::text, 'FAILED'::text, 'EXPIRED'::text])))`

- `export_jobs_status_not_null`: `NOT NULL status`


### Índices



- `CREATE UNIQUE INDEX export_jobs_pkey ON analytics.export_jobs USING btree (id)`

- `CREATE INDEX ix_fk_20811 ON analytics.export_jobs USING btree (report_id)`

- `CREATE INDEX ix_fk_20816 ON analytics.export_jobs USING btree (requested_by)`


## analytics.metric_definitions

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `code` | `text` | No | `` |

| `name` | `text` | No | `` |

| `unit` | `text` | No | `` |

| `description` | `text` | No | `` |


### Restricciones



- `metric_definitions_code_not_null`: `NOT NULL code`

- `metric_definitions_description_not_null`: `NOT NULL description`

- `metric_definitions_name_not_null`: `NOT NULL name`

- `metric_definitions_pkey`: `PRIMARY KEY (code)`

- `metric_definitions_unit_not_null`: `NOT NULL unit`


### Índices



- `CREATE UNIQUE INDEX metric_definitions_pkey ON analytics.metric_definitions USING btree (code)`


## analytics.metric_events

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `metric_code` | `text` | No | `` |

| `value` | `numeric` | No | `` |

| `dimensions` | `jsonb` | No | `'{}'::jsonb` |

| `source_event_id` | `text` | Sí | `` |

| `occurred_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `metric_events_dimensions_not_null`: `NOT NULL dimensions`

- `metric_events_id_not_null`: `NOT NULL id`

- `metric_events_metric_code_fkey`: `FOREIGN KEY (metric_code) REFERENCES analytics.metric_definitions(code)`

- `metric_events_metric_code_not_null`: `NOT NULL metric_code`

- `metric_events_occurred_at_not_null`: `NOT NULL occurred_at`

- `metric_events_pkey`: `PRIMARY KEY (id)`

- `metric_events_source_event_id_key`: `UNIQUE (source_event_id)`

- `metric_events_value_not_null`: `NOT NULL value`


### Índices



- `CREATE INDEX ix_fk_20733 ON analytics.metric_events USING btree (metric_code)`

- `CREATE UNIQUE INDEX metric_events_pkey ON analytics.metric_events USING btree (id)`

- `CREATE UNIQUE INDEX metric_events_source_event_id_key ON analytics.metric_events USING btree (source_event_id)`


## analytics.reports

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `owner_id` | `text` | No | `` |

| `name` | `text` | No | `` |

| `definition` | `jsonb` | No | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `reports_created_at_not_null`: `NOT NULL created_at`

- `reports_definition_not_null`: `NOT NULL definition`

- `reports_id_not_null`: `NOT NULL id`

- `reports_name_not_null`: `NOT NULL name`

- `reports_owner_id_fkey`: `FOREIGN KEY (owner_id) REFERENCES identity.users(id)`

- `reports_owner_id_not_null`: `NOT NULL owner_id`

- `reports_pkey`: `PRIMARY KEY (id)`


### Índices



- `CREATE INDEX ix_fk_20788 ON analytics.reports USING btree (owner_id)`

- `CREATE UNIQUE INDEX reports_pkey ON analytics.reports USING btree (id)`


## baney_billing.billing_accounts

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `text` | No | `(gen_random_uuid())::text` |

| `user_id` | `text` | No | `` |

| `legal_name` | `text` | No | `` |

| `tax_identifier` | `text` | Sí | `` |

| `billing_address` | `text` | No | `` |

| `currency` | `character(3)` | No | `` |


### Restricciones



- `billing_accounts_billing_address_not_null`: `NOT NULL billing_address`

- `billing_accounts_currency_check`: `CHECK ((currency ~ '^[A-Z]{3}$'::text))`

- `billing_accounts_currency_not_null`: `NOT NULL currency`

- `billing_accounts_id_not_null`: `NOT NULL id`

- `billing_accounts_legal_name_not_null`: `NOT NULL legal_name`

- `billing_accounts_pkey`: `PRIMARY KEY (id)`

- `billing_accounts_user_id_currency_key`: `UNIQUE (user_id, currency)`

- `billing_accounts_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `billing_accounts_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE UNIQUE INDEX billing_accounts_pkey ON baney_billing.billing_accounts USING btree (id)`

- `CREATE UNIQUE INDEX billing_accounts_user_id_currency_key ON baney_billing.billing_accounts USING btree (user_id, currency)`


## baney_billing.cierre_contable

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `periodo_anio` | `integer` | No | `` |

| `periodo_mes` | `smallint` | No | `` |

| `total_facturado` | `numeric(16,2)` | No | `0` |

| `total_itbis` | `numeric(16,2)` | No | `0` |

| `total_comisiones` | `numeric(16,2)` | No | `0` |

| `total_liquidado` | `numeric(16,2)` | No | `0` |

| `total_reembolsos` | `numeric(16,2)` | No | `0` |

| `diferencia_caja` | `numeric(16,2)` | No | `0` |

| `estado` | `text` | No | `'abierto'::text` |

| `cerrado_por_uid` | `text` | Sí | `` |

| `cerrado_en` | `timestamp with time zone` | Sí | `` |

| `notas` | `text` | Sí | `` |


### Restricciones



- `cierre_contable_diferencia_caja_not_null`: `NOT NULL diferencia_caja`

- `cierre_contable_estado_check`: `CHECK ((estado = ANY (ARRAY['abierto'::text, 'en_revision'::text, 'cerrado'::text, 'reabierto'::text])))`

- `cierre_contable_estado_not_null`: `NOT NULL estado`

- `cierre_contable_id_check`: `CHECK ((id >= 0))`

- `cierre_contable_id_not_null`: `NOT NULL id`

- `cierre_contable_periodo_anio_check`: `CHECK ((periodo_anio >= 0))`

- `cierre_contable_periodo_anio_not_null`: `NOT NULL periodo_anio`

- `cierre_contable_periodo_mes_check`: `CHECK ((periodo_mes >= 0))`

- `cierre_contable_periodo_mes_not_null`: `NOT NULL periodo_mes`

- `cierre_contable_pkey`: `PRIMARY KEY (id)`

- `cierre_contable_total_comisiones_not_null`: `NOT NULL total_comisiones`

- `cierre_contable_total_facturado_not_null`: `NOT NULL total_facturado`

- `cierre_contable_total_itbis_not_null`: `NOT NULL total_itbis`

- `cierre_contable_total_liquidado_not_null`: `NOT NULL total_liquidado`

- `cierre_contable_total_reembolsos_not_null`: `NOT NULL total_reembolsos`

- `cierre_contable_uid_not_null`: `NOT NULL uid`

- `ck_cierre_mes`: `CHECK (((periodo_mes >= 1) AND (periodo_mes <= 12)))`

- `fk_unified_052`: `FOREIGN KEY (cerrado_por_uid) REFERENCES identity.users(id) DEFERRABLE`

- `uq_cierre_periodo`: `UNIQUE (periodo_anio, periodo_mes)`

- `uq_cierre_uid`: `UNIQUE (uid)`


### Índices



- `CREATE UNIQUE INDEX cierre_contable_pkey ON baney_billing.cierre_contable USING btree (id)`

- `CREATE INDEX ix_fk_21163 ON baney_billing.cierre_contable USING btree (cerrado_por_uid)`

- `CREATE UNIQUE INDEX uq_cierre_periodo ON baney_billing.cierre_contable USING btree (periodo_anio, periodo_mes)`

- `CREATE UNIQUE INDEX uq_cierre_uid ON baney_billing.cierre_contable USING btree (uid)`


## baney_billing.comision

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `referencia_tipo` | `text` | No | `` |

| `referencia_uid` | `text` | No | `` |

| `obligado_tipo` | `text` | No | `` |

| `obligado_uid` | `text` | No | `` |

| `regla_id` | `bigint` | No | `` |

| `base_calculo` | `numeric(14,2)` | No | `` |

| `porcentaje_aplicado` | `numeric(5,4)` | No | `` |

| `monto` | `numeric(14,2)` | No | `` |

| `itbis_comision` | `numeric(14,2)` | No | `0` |

| `total` | `numeric(14,2)` | No | `` |

| `factura_id` | `bigint` | Sí | `` |

| `liquidacion_id` | `bigint` | Sí | `` |

| `estado` | `text` | No | `'calculada'::text` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `ref_suborden` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'suborden'::text) THEN referencia_uid     ELSE NULL::text END` |

| `ref_viaje` | `uuid` | Sí | ` CASE     WHEN (referencia_tipo = 'viaje'::text) THEN (referencia_uid)::uuid     ELSE NULL::uuid END` |


### Restricciones



- `ck_typed_reference`: `CHECK (((referencia_tipo <> ALL (ARRAY['suborden'::text, 'viaje'::text])) OR (referencia_uid IS NOT NULL)))`

- `comision_base_calculo_not_null`: `NOT NULL base_calculo`

- `comision_creado_en_not_null`: `NOT NULL creado_en`

- `comision_estado_check`: `CHECK ((estado = ANY (ARRAY['calculada'::text, 'facturada'::text, 'liquidada'::text, 'anulada'::text])))`

- `comision_estado_not_null`: `NOT NULL estado`

- `comision_factura_id_check`: `CHECK ((factura_id >= 0))`

- `comision_id_check`: `CHECK ((id >= 0))`

- `comision_id_not_null`: `NOT NULL id`

- `comision_itbis_comision_not_null`: `NOT NULL itbis_comision`

- `comision_liquidacion_id_check`: `CHECK ((liquidacion_id >= 0))`

- `comision_monto_not_null`: `NOT NULL monto`

- `comision_obligado_tipo_check`: `CHECK ((obligado_tipo = ANY (ARRAY['vendedor'::text, 'transportista'::text])))`

- `comision_obligado_tipo_not_null`: `NOT NULL obligado_tipo`

- `comision_obligado_uid_not_null`: `NOT NULL obligado_uid`

- `comision_pkey`: `PRIMARY KEY (id)`

- `comision_porcentaje_aplicado_not_null`: `NOT NULL porcentaje_aplicado`

- `comision_ref_suborden_fkey`: `FOREIGN KEY (ref_suborden) REFERENCES baney_order.suborden(uid)`

- `comision_ref_viaje_fkey`: `FOREIGN KEY (ref_viaje) REFERENCES transport.trips(id)`

- `comision_referencia_tipo_check`: `CHECK ((referencia_tipo = ANY (ARRAY['suborden'::text, 'viaje'::text])))`

- `comision_referencia_tipo_not_null`: `NOT NULL referencia_tipo`

- `comision_referencia_uid_not_null`: `NOT NULL referencia_uid`

- `comision_regla_id_check`: `CHECK ((regla_id >= 0))`

- `comision_regla_id_not_null`: `NOT NULL regla_id`

- `comision_total_not_null`: `NOT NULL total`

- `comision_uid_not_null`: `NOT NULL uid`

- `fk_comision_factura`: `FOREIGN KEY (factura_id) REFERENCES baney_billing.factura(id) ON DELETE SET NULL`

- `fk_comision_regla`: `FOREIGN KEY (regla_id) REFERENCES baney_billing.regla_comision(id) ON DELETE RESTRICT`

- `fk_unified_049`: `FOREIGN KEY (obligado_uid) REFERENCES identity.users(id) DEFERRABLE`

- `fk_unified_066`: `FOREIGN KEY (liquidacion_id) REFERENCES baney_billing.liquidacion(id) DEFERRABLE`

- `uq_comision_referencia`: `UNIQUE (referencia_tipo, referencia_uid)`

- `uq_comision_uid`: `UNIQUE (uid)`


### Índices



- `CREATE UNIQUE INDEX comision_pkey ON baney_billing.comision USING btree (id)`

- `CREATE INDEX ix_comision_liquidacion ON baney_billing.comision USING btree (liquidacion_id)`

- `CREATE INDEX ix_comision_obligado ON baney_billing.comision USING btree (obligado_uid, estado, creado_en)`

- `CREATE INDEX ix_fk_17922 ON baney_billing.comision USING btree (regla_id)`

- `CREATE INDEX ix_fk_17927 ON baney_billing.comision USING btree (factura_id)`

- `CREATE INDEX ix_fk_21453 ON baney_billing.comision USING btree (ref_suborden)`

- `CREATE INDEX ix_fk_21469 ON baney_billing.comision USING btree (ref_viaje)`

- `CREATE UNIQUE INDEX uq_comision_referencia ON baney_billing.comision USING btree (referencia_tipo, referencia_uid)`

- `CREATE UNIQUE INDEX uq_comision_uid ON baney_billing.comision USING btree (uid)`


## baney_billing.dgii_envio

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `factura_id` | `bigint` | No | `` |

| `intento` | `integer` | No | `1` |

| `endpoint` | `character varying(200)` | No | `` |

| `peticion` | `jsonb` | Sí | `` |

| `respuesta` | `jsonb` | Sí | `` |

| `codigo_http` | `integer` | Sí | `` |

| `resultado` | `text` | No | `'pendiente'::text` |

| `mensaje_error` | `character varying(1000)` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `dgii_envio_codigo_http_check`: `CHECK ((codigo_http >= 0))`

- `dgii_envio_creado_en_not_null`: `NOT NULL creado_en`

- `dgii_envio_endpoint_not_null`: `NOT NULL endpoint`

- `dgii_envio_factura_id_check`: `CHECK ((factura_id >= 0))`

- `dgii_envio_factura_id_not_null`: `NOT NULL factura_id`

- `dgii_envio_id_check`: `CHECK ((id >= 0))`

- `dgii_envio_id_not_null`: `NOT NULL id`

- `dgii_envio_intento_check`: `CHECK ((intento >= 0))`

- `dgii_envio_intento_not_null`: `NOT NULL intento`

- `dgii_envio_pkey`: `PRIMARY KEY (id)`

- `dgii_envio_resultado_check`: `CHECK ((resultado = ANY (ARRAY['aceptado'::text, 'rechazado'::text, 'error_red'::text, 'pendiente'::text])))`

- `dgii_envio_resultado_not_null`: `NOT NULL resultado`

- `fk_envio_factura`: `FOREIGN KEY (factura_id) REFERENCES baney_billing.factura(id) ON DELETE CASCADE`

- `uq_envio_intento`: `UNIQUE (factura_id, intento)`


### Índices



- `CREATE UNIQUE INDEX dgii_envio_pkey ON baney_billing.dgii_envio USING btree (id)`

- `CREATE INDEX ix_envio_resultado ON baney_billing.dgii_envio USING btree (resultado, creado_en)`

- `CREATE UNIQUE INDEX uq_envio_intento ON baney_billing.dgii_envio USING btree (factura_id, intento)`


## baney_billing.factura

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `numero_interno` | `character varying(24)` | No | `` |

| `tipo_documento` | `text` | No | `'factura'::text` |

| `factura_origen_id` | `bigint` | Sí | `` |

| `emisor_tipo` | `text` | No | `` |

| `emisor_uid` | `text` | Sí | `` |

| `emisor_rnc` | `character varying(11)` | No | `` |

| `emisor_nombre` | `character varying(200)` | No | `` |

| `receptor_uid` | `text` | Sí | `` |

| `receptor_rnc` | `character varying(11)` | Sí | `` |

| `receptor_nombre` | `character varying(200)` | No | `` |

| `receptor_direccion` | `character varying(300)` | Sí | `` |

| `receptor_email` | `character varying(190)` | Sí | `` |

| `ncf` | `character varying(19)` | Sí | `` |

| `ncf_secuencia_id` | `bigint` | Sí | `` |

| `ncf_vencimiento` | `date` | Sí | `` |

| `tipo_ecf` | `character varying(3)` | Sí | `` |

| `moneda` | `character(3)` | No | `'DOP'::bpchar` |

| `tasa_cambio` | `numeric(12,6)` | No | `1.000000` |

| `subtotal` | `numeric(14,2)` | No | `0` |

| `descuento` | `numeric(14,2)` | No | `0` |

| `monto_exento` | `numeric(14,2)` | No | `0` |

| `base_imponible` | `numeric(14,2)` | No | `0` |

| `itbis` | `numeric(14,2)` | No | `0` |

| `propina_legal` | `numeric(14,2)` | No | `0` |

| `total` | `numeric(14,2)` | No | `0` |

| `referencia_tipo` | `text` | No | `` |

| `referencia_uid` | `text` | Sí | `` |

| `estado` | `text` | No | `'borrador'::text` |

| `dgii_track_id` | `character varying(80)` | Sí | `` |

| `dgii_codigo_seguridad` | `character varying(20)` | Sí | `` |

| `dgii_respuesta` | `jsonb` | Sí | `` |

| `dgii_enviada_en` | `timestamp with time zone` | Sí | `` |

| `motivo_anulacion` | `character varying(500)` | Sí | `` |

| `anulada_en` | `timestamp with time zone` | Sí | `` |

| `xml_url` | `character varying(500)` | Sí | `` |

| `pdf_url` | `character varying(500)` | Sí | `` |

| `fecha_emision` | `timestamp with time zone` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `actualizado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `ref_pedido` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'pedido'::text) THEN referencia_uid     ELSE NULL::text END` |

| `ref_suborden` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'suborden'::text) THEN referencia_uid     ELSE NULL::text END` |

| `ref_viaje` | `uuid` | Sí | ` CASE     WHEN (referencia_tipo = 'viaje'::text) THEN (referencia_uid)::uuid     ELSE NULL::uuid END` |

| `ref_comision` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'comision'::text) THEN referencia_uid     ELSE NULL::text END` |

| `ref_liquidacion` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'liquidacion'::text) THEN referencia_uid     ELSE NULL::text END` |


### Restricciones



- `ck_factura_nota`: `CHECK (((tipo_documento = 'factura'::text) OR (factura_origen_id IS NOT NULL)))`

- `ck_factura_total`: `CHECK ((total >= (0)::numeric))`

- `ck_typed_reference`: `CHECK (((referencia_tipo <> ALL (ARRAY['pedido'::text, 'suborden'::text, 'viaje'::text, 'comision'::text, 'liquidacion'::text])) OR (referencia_uid IS NOT NULL)))`

- `factura_actualizado_en_not_null`: `NOT NULL actualizado_en`

- `factura_base_imponible_not_null`: `NOT NULL base_imponible`

- `factura_creado_en_not_null`: `NOT NULL creado_en`

- `factura_descuento_not_null`: `NOT NULL descuento`

- `factura_emisor_nombre_not_null`: `NOT NULL emisor_nombre`

- `factura_emisor_rnc_not_null`: `NOT NULL emisor_rnc`

- `factura_emisor_tipo_check`: `CHECK ((emisor_tipo = ANY (ARRAY['plataforma'::text, 'vendedor'::text, 'transportista'::text])))`

- `factura_emisor_tipo_not_null`: `NOT NULL emisor_tipo`

- `factura_estado_check`: `CHECK ((estado = ANY (ARRAY['borrador'::text, 'emitida'::text, 'enviada_dgii'::text, 'aceptada_dgii'::text, 'rechazada_dgii'::text, 'anulada'::text])))`

- `factura_estado_not_null`: `NOT NULL estado`

- `factura_factura_origen_id_check`: `CHECK ((factura_origen_id >= 0))`

- `factura_id_check`: `CHECK ((id >= 0))`

- `factura_id_not_null`: `NOT NULL id`

- `factura_itbis_not_null`: `NOT NULL itbis`

- `factura_moneda_not_null`: `NOT NULL moneda`

- `factura_monto_exento_not_null`: `NOT NULL monto_exento`

- `factura_ncf_secuencia_id_check`: `CHECK ((ncf_secuencia_id >= 0))`

- `factura_numero_interno_not_null`: `NOT NULL numero_interno`

- `factura_pkey`: `PRIMARY KEY (id)`

- `factura_propina_legal_not_null`: `NOT NULL propina_legal`

- `factura_receptor_nombre_not_null`: `NOT NULL receptor_nombre`

- `factura_ref_comision_fkey`: `FOREIGN KEY (ref_comision) REFERENCES baney_billing.comision(uid)`

- `factura_ref_liquidacion_fkey`: `FOREIGN KEY (ref_liquidacion) REFERENCES baney_billing.liquidacion(uid)`

- `factura_ref_pedido_fkey`: `FOREIGN KEY (ref_pedido) REFERENCES baney_order.pedido(uid)`

- `factura_ref_suborden_fkey`: `FOREIGN KEY (ref_suborden) REFERENCES baney_order.suborden(uid)`

- `factura_ref_viaje_fkey`: `FOREIGN KEY (ref_viaje) REFERENCES transport.trips(id)`

- `factura_referencia_tipo_check`: `CHECK ((referencia_tipo = ANY (ARRAY['pedido'::text, 'suborden'::text, 'viaje'::text, 'comision'::text, 'liquidacion'::text, 'manual'::text])))`

- `factura_referencia_tipo_not_null`: `NOT NULL referencia_tipo`

- `factura_subtotal_not_null`: `NOT NULL subtotal`

- `factura_tasa_cambio_not_null`: `NOT NULL tasa_cambio`

- `factura_tipo_documento_check`: `CHECK ((tipo_documento = ANY (ARRAY['factura'::text, 'nota_credito'::text, 'nota_debito'::text])))`

- `factura_tipo_documento_not_null`: `NOT NULL tipo_documento`

- `factura_total_not_null`: `NOT NULL total`

- `factura_uid_not_null`: `NOT NULL uid`

- `fk_factura_origen`: `FOREIGN KEY (factura_origen_id) REFERENCES baney_billing.factura(id) ON DELETE RESTRICT`

- `fk_factura_secuencia`: `FOREIGN KEY (ncf_secuencia_id) REFERENCES baney_billing.ncf_secuencia(id) ON DELETE RESTRICT`

- `fk_unified_046`: `FOREIGN KEY (emisor_uid) REFERENCES identity.users(id) DEFERRABLE`

- `fk_unified_047`: `FOREIGN KEY (receptor_uid) REFERENCES identity.users(id) DEFERRABLE`

- `uq_factura_ncf`: `UNIQUE (emisor_rnc, ncf)`

- `uq_factura_numero`: `UNIQUE (numero_interno)`

- `uq_factura_referencia`: `UNIQUE (referencia_tipo, referencia_uid, tipo_documento)`

- `uq_factura_uid`: `UNIQUE (uid)`


### Índices



- `CREATE UNIQUE INDEX factura_pkey ON baney_billing.factura USING btree (id)`

- `CREATE INDEX ix_factura_emisor ON baney_billing.factura USING btree (emisor_uid, fecha_emision)`

- `CREATE INDEX ix_factura_estado ON baney_billing.factura USING btree (estado, creado_en)`

- `CREATE INDEX ix_factura_periodo ON baney_billing.factura USING btree (fecha_emision)`

- `CREATE INDEX ix_factura_receptor ON baney_billing.factura USING btree (receptor_uid, fecha_emision)`

- `CREATE INDEX ix_fk_17804 ON baney_billing.factura USING btree (factura_origen_id)`

- `CREATE INDEX ix_fk_17809 ON baney_billing.factura USING btree (ncf_secuencia_id)`

- `CREATE INDEX ix_fk_21352 ON baney_billing.factura USING btree (ref_pedido)`

- `CREATE INDEX ix_fk_21372 ON baney_billing.factura USING btree (ref_suborden)`

- `CREATE INDEX ix_fk_21392 ON baney_billing.factura USING btree (ref_viaje)`

- `CREATE INDEX ix_fk_21412 ON baney_billing.factura USING btree (ref_comision)`

- `CREATE INDEX ix_fk_21432 ON baney_billing.factura USING btree (ref_liquidacion)`

- `CREATE UNIQUE INDEX uq_factura_ncf ON baney_billing.factura USING btree (emisor_rnc, ncf)`

- `CREATE UNIQUE INDEX uq_factura_numero ON baney_billing.factura USING btree (numero_interno)`

- `CREATE UNIQUE INDEX uq_factura_referencia ON baney_billing.factura USING btree (referencia_tipo, referencia_uid, tipo_documento)`

- `CREATE UNIQUE INDEX uq_factura_uid ON baney_billing.factura USING btree (uid)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('actualizado_en')`


## baney_billing.factura_linea

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `factura_id` | `bigint` | No | `` |

| `linea` | `integer` | No | `` |

| `codigo` | `character varying(64)` | Sí | `` |

| `descripcion` | `character varying(300)` | No | `` |

| `unidad_medida` | `character varying(20)` | No | `'unidad'::character varying` |

| `cantidad` | `numeric(14,3)` | No | `` |

| `precio_unitario` | `numeric(14,4)` | No | `` |

| `descuento` | `numeric(14,2)` | No | `0` |

| `regimen_itbis` | `text` | No | `` |

| `tasa_itbis` | `numeric(5,4)` | No | `0.0000` |

| `monto_itbis` | `numeric(14,2)` | No | `0` |

| `total_linea` | `numeric(14,2)` | No | `` |


### Restricciones



- `ck_linea_cantidad`: `CHECK ((cantidad > (0)::numeric))`

- `factura_linea_cantidad_not_null`: `NOT NULL cantidad`

- `factura_linea_descripcion_not_null`: `NOT NULL descripcion`

- `factura_linea_descuento_not_null`: `NOT NULL descuento`

- `factura_linea_factura_id_check`: `CHECK ((factura_id >= 0))`

- `factura_linea_factura_id_not_null`: `NOT NULL factura_id`

- `factura_linea_id_check`: `CHECK ((id >= 0))`

- `factura_linea_id_not_null`: `NOT NULL id`

- `factura_linea_linea_check`: `CHECK ((linea >= 0))`

- `factura_linea_linea_not_null`: `NOT NULL linea`

- `factura_linea_monto_itbis_not_null`: `NOT NULL monto_itbis`

- `factura_linea_pkey`: `PRIMARY KEY (id)`

- `factura_linea_precio_unitario_not_null`: `NOT NULL precio_unitario`

- `factura_linea_regimen_itbis_check`: `CHECK ((regimen_itbis = ANY (ARRAY['exento'::text, 'gravado'::text, 'tasa_cero'::text])))`

- `factura_linea_regimen_itbis_not_null`: `NOT NULL regimen_itbis`

- `factura_linea_tasa_itbis_not_null`: `NOT NULL tasa_itbis`

- `factura_linea_total_linea_not_null`: `NOT NULL total_linea`

- `factura_linea_unidad_medida_not_null`: `NOT NULL unidad_medida`

- `fk_linea_factura`: `FOREIGN KEY (factura_id) REFERENCES baney_billing.factura(id) ON DELETE CASCADE`

- `uq_linea`: `UNIQUE (factura_id, linea)`


### Índices



- `CREATE UNIQUE INDEX factura_linea_pkey ON baney_billing.factura_linea USING btree (id)`

- `CREATE UNIQUE INDEX uq_linea ON baney_billing.factura_linea USING btree (factura_id, linea)`


## baney_billing.inbox_procesado

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `mensaje_uid` | `text` | No | `` |

| `tipo_evento` | `character varying(80)` | No | `` |

| `procesado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `inbox_procesado_id_check`: `CHECK ((id >= 0))`

- `inbox_procesado_id_not_null`: `NOT NULL id`

- `inbox_procesado_mensaje_uid_not_null`: `NOT NULL mensaje_uid`

- `inbox_procesado_pkey`: `PRIMARY KEY (id)`

- `inbox_procesado_procesado_en_not_null`: `NOT NULL procesado_en`

- `inbox_procesado_tipo_evento_not_null`: `NOT NULL tipo_evento`

- `uq_inbox_mensaje`: `UNIQUE (mensaje_uid)`


### Índices



- `CREATE UNIQUE INDEX inbox_procesado_pkey ON baney_billing.inbox_procesado USING btree (id)`

- `CREATE UNIQUE INDEX uq_inbox_mensaje ON baney_billing.inbox_procesado USING btree (mensaje_uid)`


## baney_billing.liquidacion

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `numero` | `character varying(24)` | No | `` |

| `beneficiario_tipo` | `text` | No | `` |

| `beneficiario_uid` | `text` | No | `` |

| `beneficiario_rnc` | `character varying(11)` | Sí | `` |

| `periodo_desde` | `date` | No | `` |

| `periodo_hasta` | `date` | No | `` |

| `moneda` | `character(3)` | No | `'DOP'::bpchar` |

| `bruto` | `numeric(14,2)` | No | `0` |

| `comisiones` | `numeric(14,2)` | No | `0` |

| `retenciones` | `numeric(14,2)` | No | `0` |

| `ajustes` | `numeric(14,2)` | No | `0` |

| `neto` | `numeric(14,2)` | No | `0` |

| `estado` | `text` | No | `'abierta'::text` |

| `payout_uid` | `text` | Sí | `` |

| `cerrada_en` | `timestamp with time zone` | Sí | `` |

| `pagada_en` | `timestamp with time zone` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `ck_liquidacion_periodo`: `CHECK ((periodo_hasta >= periodo_desde))`

- `fk_unified_050`: `FOREIGN KEY (beneficiario_uid) REFERENCES identity.users(id) DEFERRABLE`

- `fk_unified_051`: `FOREIGN KEY (payout_uid) REFERENCES baney_caja.payout(uid) DEFERRABLE`

- `liquidacion_ajustes_not_null`: `NOT NULL ajustes`

- `liquidacion_beneficiario_tipo_check`: `CHECK ((beneficiario_tipo = ANY (ARRAY['vendedor'::text, 'transportista'::text])))`

- `liquidacion_beneficiario_tipo_not_null`: `NOT NULL beneficiario_tipo`

- `liquidacion_beneficiario_uid_not_null`: `NOT NULL beneficiario_uid`

- `liquidacion_bruto_not_null`: `NOT NULL bruto`

- `liquidacion_comisiones_not_null`: `NOT NULL comisiones`

- `liquidacion_creado_en_not_null`: `NOT NULL creado_en`

- `liquidacion_estado_check`: `CHECK ((estado = ANY (ARRAY['abierta'::text, 'cerrada'::text, 'pagada'::text, 'anulada'::text])))`

- `liquidacion_estado_not_null`: `NOT NULL estado`

- `liquidacion_id_check`: `CHECK ((id >= 0))`

- `liquidacion_id_not_null`: `NOT NULL id`

- `liquidacion_moneda_not_null`: `NOT NULL moneda`

- `liquidacion_neto_not_null`: `NOT NULL neto`

- `liquidacion_numero_not_null`: `NOT NULL numero`

- `liquidacion_periodo_desde_not_null`: `NOT NULL periodo_desde`

- `liquidacion_periodo_hasta_not_null`: `NOT NULL periodo_hasta`

- `liquidacion_pkey`: `PRIMARY KEY (id)`

- `liquidacion_retenciones_not_null`: `NOT NULL retenciones`

- `liquidacion_uid_not_null`: `NOT NULL uid`

- `uq_liquidacion_numero`: `UNIQUE (numero)`

- `uq_liquidacion_periodo`: `UNIQUE (beneficiario_tipo, beneficiario_uid, periodo_desde, periodo_hasta)`

- `uq_liquidacion_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_fk_21153 ON baney_billing.liquidacion USING btree (beneficiario_uid)`

- `CREATE INDEX ix_fk_21158 ON baney_billing.liquidacion USING btree (payout_uid)`

- `CREATE INDEX ix_liquidacion_estado ON baney_billing.liquidacion USING btree (estado, periodo_hasta)`

- `CREATE UNIQUE INDEX liquidacion_pkey ON baney_billing.liquidacion USING btree (id)`

- `CREATE UNIQUE INDEX uq_liquidacion_numero ON baney_billing.liquidacion USING btree (numero)`

- `CREATE UNIQUE INDEX uq_liquidacion_periodo ON baney_billing.liquidacion USING btree (beneficiario_tipo, beneficiario_uid, periodo_desde, periodo_hasta)`

- `CREATE UNIQUE INDEX uq_liquidacion_uid ON baney_billing.liquidacion USING btree (uid)`


## baney_billing.liquidacion_linea

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `liquidacion_id` | `bigint` | No | `` |

| `concepto` | `text` | No | `` |

| `referencia_tipo` | `text` | No | `` |

| `referencia_uid` | `text` | Sí | `` |

| `descripcion` | `character varying(300)` | No | `` |

| `monto` | `numeric(14,2)` | No | `` |

| `fecha_operacion` | `date` | No | `` |

| `ref_suborden` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'suborden'::text) THEN referencia_uid     ELSE NULL::text END` |

| `ref_viaje` | `uuid` | Sí | ` CASE     WHEN (referencia_tipo = 'viaje'::text) THEN (referencia_uid)::uuid     ELSE NULL::uuid END` |

| `ref_comision` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'comision'::text) THEN referencia_uid     ELSE NULL::text END` |

| `ref_devolucion` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'devolucion'::text) THEN referencia_uid     ELSE NULL::text END` |


### Restricciones



- `ck_typed_reference`: `CHECK (((referencia_tipo <> ALL (ARRAY['suborden'::text, 'viaje'::text, 'comision'::text, 'devolucion'::text])) OR (referencia_uid IS NOT NULL)))`

- `fk_liq_linea`: `FOREIGN KEY (liquidacion_id) REFERENCES baney_billing.liquidacion(id) ON DELETE CASCADE`

- `liquidacion_linea_concepto_check`: `CHECK ((concepto = ANY (ARRAY['venta'::text, 'flete'::text, 'comision'::text, 'retencion_itbis'::text, 'retencion_isr'::text, 'reembolso'::text, 'penalidad'::text, 'ajuste'::text, 'propina'::text])))`

- `liquidacion_linea_concepto_not_null`: `NOT NULL concepto`

- `liquidacion_linea_descripcion_not_null`: `NOT NULL descripcion`

- `liquidacion_linea_fecha_operacion_not_null`: `NOT NULL fecha_operacion`

- `liquidacion_linea_id_check`: `CHECK ((id >= 0))`

- `liquidacion_linea_id_not_null`: `NOT NULL id`

- `liquidacion_linea_liquidacion_id_check`: `CHECK ((liquidacion_id >= 0))`

- `liquidacion_linea_liquidacion_id_not_null`: `NOT NULL liquidacion_id`

- `liquidacion_linea_monto_not_null`: `NOT NULL monto`

- `liquidacion_linea_pkey`: `PRIMARY KEY (id)`

- `liquidacion_linea_ref_comision_fkey`: `FOREIGN KEY (ref_comision) REFERENCES baney_billing.comision(uid)`

- `liquidacion_linea_ref_devolucion_fkey`: `FOREIGN KEY (ref_devolucion) REFERENCES baney_order.devolucion(uid)`

- `liquidacion_linea_ref_suborden_fkey`: `FOREIGN KEY (ref_suborden) REFERENCES baney_order.suborden(uid)`

- `liquidacion_linea_ref_viaje_fkey`: `FOREIGN KEY (ref_viaje) REFERENCES transport.trips(id)`

- `liquidacion_linea_referencia_tipo_check`: `CHECK ((referencia_tipo = ANY (ARRAY['suborden'::text, 'viaje'::text, 'comision'::text, 'devolucion'::text, 'manual'::text])))`

- `liquidacion_linea_referencia_tipo_not_null`: `NOT NULL referencia_tipo`


### Índices



- `CREATE INDEX ix_fk_21486 ON baney_billing.liquidacion_linea USING btree (ref_suborden)`

- `CREATE INDEX ix_fk_21500 ON baney_billing.liquidacion_linea USING btree (ref_viaje)`

- `CREATE INDEX ix_fk_21514 ON baney_billing.liquidacion_linea USING btree (ref_comision)`

- `CREATE INDEX ix_fk_21528 ON baney_billing.liquidacion_linea USING btree (ref_devolucion)`

- `CREATE INDEX ix_liq_linea ON baney_billing.liquidacion_linea USING btree (liquidacion_id, concepto)`

- `CREATE INDEX ix_liq_linea_ref ON baney_billing.liquidacion_linea USING btree (referencia_tipo, referencia_uid)`

- `CREATE UNIQUE INDEX liquidacion_linea_pkey ON baney_billing.liquidacion_linea USING btree (id)`


## baney_billing.ncf_secuencia

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `emisor_rnc` | `character varying(11)` | No | `` |

| `tipo_ecf` | `text` | No | `` |

| `serie` | `character(1)` | No | `'B'::bpchar` |

| `desde` | `bigint` | No | `` |

| `hasta` | `bigint` | No | `` |

| `actual` | `bigint` | No | `` |

| `fecha_autorizacion` | `date` | No | `` |

| `fecha_vencimiento` | `date` | No | `` |

| `activa` | `smallint` | No | `1` |

| `umbral_alerta` | `bigint` | No | `100` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `ck_ncf_actual`: `CHECK (((actual >= (desde - 1)) AND (actual <= hasta)))`

- `ck_ncf_rango`: `CHECK ((hasta >= desde))`

- `ncf_secuencia_activa_check`: `CHECK ((activa = ANY (ARRAY[0, 1])))`

- `ncf_secuencia_activa_not_null`: `NOT NULL activa`

- `ncf_secuencia_actual_check`: `CHECK ((actual >= 0))`

- `ncf_secuencia_actual_not_null`: `NOT NULL actual`

- `ncf_secuencia_creado_en_not_null`: `NOT NULL creado_en`

- `ncf_secuencia_desde_check`: `CHECK ((desde >= 0))`

- `ncf_secuencia_desde_not_null`: `NOT NULL desde`

- `ncf_secuencia_emisor_rnc_not_null`: `NOT NULL emisor_rnc`

- `ncf_secuencia_fecha_autorizacion_not_null`: `NOT NULL fecha_autorizacion`

- `ncf_secuencia_fecha_vencimiento_not_null`: `NOT NULL fecha_vencimiento`

- `ncf_secuencia_hasta_check`: `CHECK ((hasta >= 0))`

- `ncf_secuencia_hasta_not_null`: `NOT NULL hasta`

- `ncf_secuencia_id_check`: `CHECK ((id >= 0))`

- `ncf_secuencia_id_not_null`: `NOT NULL id`

- `ncf_secuencia_pkey`: `PRIMARY KEY (id)`

- `ncf_secuencia_serie_not_null`: `NOT NULL serie`

- `ncf_secuencia_tipo_ecf_check`: `CHECK ((tipo_ecf = ANY (ARRAY['B01'::text, 'B02'::text, 'B04'::text, 'B11'::text, 'B14'::text, 'B15'::text, 'B16'::text, 'B17'::text, 'E31'::text, 'E32'::text, 'E34'::text, 'E41'::text, 'E43'::text, 'E44'::text, 'E45'::text, 'E46'::text, 'E47'::text])))`

- `ncf_secuencia_tipo_ecf_not_null`: `NOT NULL tipo_ecf`

- `ncf_secuencia_umbral_alerta_check`: `CHECK ((umbral_alerta >= 0))`

- `ncf_secuencia_umbral_alerta_not_null`: `NOT NULL umbral_alerta`

- `uq_ncf_rango`: `UNIQUE (emisor_rnc, tipo_ecf, desde)`


### Índices



- `CREATE INDEX ix_ncf_disponible ON baney_billing.ncf_secuencia USING btree (emisor_rnc, tipo_ecf, activa, fecha_vencimiento)`

- `CREATE UNIQUE INDEX ncf_secuencia_pkey ON baney_billing.ncf_secuencia USING btree (id)`

- `CREATE UNIQUE INDEX uq_ncf_rango ON baney_billing.ncf_secuencia USING btree (emisor_rnc, tipo_ecf, desde)`


## baney_billing.outbox

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `agregado_tipo` | `character varying(60)` | No | `` |

| `agregado_uid` | `text` | No | `` |

| `tipo_evento` | `character varying(80)` | No | `` |

| `carga` | `jsonb` | No | `` |

| `estado` | `text` | No | `'pendiente'::text` |

| `intentos` | `integer` | No | `0` |

| `ultimo_error` | `character varying(500)` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `publicado_en` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `outbox_agregado_tipo_not_null`: `NOT NULL agregado_tipo`

- `outbox_agregado_uid_not_null`: `NOT NULL agregado_uid`

- `outbox_carga_not_null`: `NOT NULL carga`

- `outbox_creado_en_not_null`: `NOT NULL creado_en`

- `outbox_estado_check`: `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'publicado'::text, 'fallido'::text])))`

- `outbox_estado_not_null`: `NOT NULL estado`

- `outbox_id_check`: `CHECK ((id >= 0))`

- `outbox_id_not_null`: `NOT NULL id`

- `outbox_intentos_check`: `CHECK ((intentos >= 0))`

- `outbox_intentos_not_null`: `NOT NULL intentos`

- `outbox_pkey`: `PRIMARY KEY (id)`

- `outbox_tipo_evento_not_null`: `NOT NULL tipo_evento`

- `outbox_uid_not_null`: `NOT NULL uid`

- `uq_outbox_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_outbox_pendiente ON baney_billing.outbox USING btree (estado, creado_en)`

- `CREATE UNIQUE INDEX outbox_pkey ON baney_billing.outbox USING btree (id)`

- `CREATE UNIQUE INDEX uq_outbox_uid ON baney_billing.outbox USING btree (uid)`


## baney_billing.regla_comision

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `nombre` | `character varying(120)` | No | `` |

| `ambito` | `text` | No | `` |

| `ambito_ref` | `character varying(64)` | Sí | `` |

| `aplica_a` | `text` | No | `` |

| `tipo` | `text` | No | `` |

| `porcentaje` | `numeric(5,4)` | No | `0.0000` |

| `monto_fijo` | `numeric(14,2)` | No | `0` |

| `minimo` | `numeric(14,2)` | Sí | `` |

| `maximo` | `numeric(14,2)` | Sí | `` |

| `prioridad` | `smallint` | No | `100` |

| `vigente_desde` | `timestamp with time zone` | No | `` |

| `vigente_hasta` | `timestamp with time zone` | Sí | `` |

| `creado_por_uid` | `text` | No | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `ck_regla_pct`: `CHECK (((porcentaje >= (0)::numeric) AND (porcentaje <= (1)::numeric)))`

- `fk_unified_048`: `FOREIGN KEY (creado_por_uid) REFERENCES identity.users(id) DEFERRABLE`

- `regla_comision_ambito_check`: `CHECK ((ambito = ANY (ARRAY['global'::text, 'categoria'::text, 'vendedor'::text, 'tipo_vehiculo'::text, 'transportista'::text])))`

- `regla_comision_ambito_not_null`: `NOT NULL ambito`

- `regla_comision_aplica_a_check`: `CHECK ((aplica_a = ANY (ARRAY['mercado'::text, 'transporte'::text])))`

- `regla_comision_aplica_a_not_null`: `NOT NULL aplica_a`

- `regla_comision_creado_en_not_null`: `NOT NULL creado_en`

- `regla_comision_creado_por_uid_not_null`: `NOT NULL creado_por_uid`

- `regla_comision_id_check`: `CHECK ((id >= 0))`

- `regla_comision_id_not_null`: `NOT NULL id`

- `regla_comision_monto_fijo_not_null`: `NOT NULL monto_fijo`

- `regla_comision_nombre_not_null`: `NOT NULL nombre`

- `regla_comision_pkey`: `PRIMARY KEY (id)`

- `regla_comision_porcentaje_not_null`: `NOT NULL porcentaje`

- `regla_comision_prioridad_not_null`: `NOT NULL prioridad`

- `regla_comision_tipo_check`: `CHECK ((tipo = ANY (ARRAY['porcentaje'::text, 'fijo'::text, 'mixto'::text])))`

- `regla_comision_tipo_not_null`: `NOT NULL tipo`

- `regla_comision_uid_not_null`: `NOT NULL uid`

- `regla_comision_vigente_desde_not_null`: `NOT NULL vigente_desde`

- `uq_regla_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_fk_21143 ON baney_billing.regla_comision USING btree (creado_por_uid)`

- `CREATE INDEX ix_regla_resolucion ON baney_billing.regla_comision USING btree (aplica_a, ambito, ambito_ref, vigente_desde, vigente_hasta, prioridad)`

- `CREATE UNIQUE INDEX regla_comision_pkey ON baney_billing.regla_comision USING btree (id)`

- `CREATE UNIQUE INDEX uq_regla_uid ON baney_billing.regla_comision USING btree (uid)`


## baney_billing.retencion

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `liquidacion_id` | `bigint` | No | `` |

| `tipo` | `text` | No | `` |

| `base` | `numeric(14,2)` | No | `` |

| `tasa` | `numeric(5,4)` | No | `` |

| `monto` | `numeric(14,2)` | No | `` |

| `norma` | `character varying(120)` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `fk_retencion_liq`: `FOREIGN KEY (liquidacion_id) REFERENCES baney_billing.liquidacion(id) ON DELETE CASCADE`

- `retencion_base_not_null`: `NOT NULL base`

- `retencion_creado_en_not_null`: `NOT NULL creado_en`

- `retencion_id_check`: `CHECK ((id >= 0))`

- `retencion_id_not_null`: `NOT NULL id`

- `retencion_liquidacion_id_check`: `CHECK ((liquidacion_id >= 0))`

- `retencion_liquidacion_id_not_null`: `NOT NULL liquidacion_id`

- `retencion_monto_not_null`: `NOT NULL monto`

- `retencion_pkey`: `PRIMARY KEY (id)`

- `retencion_tasa_not_null`: `NOT NULL tasa`

- `retencion_tipo_check`: `CHECK ((tipo = ANY (ARRAY['itbis_retenido'::text, 'isr'::text, 'otro'::text])))`

- `retencion_tipo_not_null`: `NOT NULL tipo`


### Índices



- `CREATE INDEX ix_retencion_liq ON baney_billing.retencion USING btree (liquidacion_id)`

- `CREATE UNIQUE INDEX retencion_pkey ON baney_billing.retencion USING btree (id)`


## baney_billing.tasa_impuesto

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `codigo` | `character varying(20)` | No | `` |

| `nombre` | `character varying(80)` | No | `` |

| `tasa` | `numeric(5,4)` | No | `` |

| `vigente_desde` | `date` | No | `` |

| `vigente_hasta` | `date` | Sí | `` |


### Restricciones



- `ck_tasa_rango`: `CHECK (((tasa >= (0)::numeric) AND (tasa <= (1)::numeric)))`

- `tasa_impuesto_codigo_not_null`: `NOT NULL codigo`

- `tasa_impuesto_id_check`: `CHECK ((id >= 0))`

- `tasa_impuesto_id_not_null`: `NOT NULL id`

- `tasa_impuesto_nombre_not_null`: `NOT NULL nombre`

- `tasa_impuesto_pkey`: `PRIMARY KEY (id)`

- `tasa_impuesto_tasa_not_null`: `NOT NULL tasa`

- `tasa_impuesto_vigente_desde_not_null`: `NOT NULL vigente_desde`

- `uq_tasa_codigo_vigencia`: `UNIQUE (codigo, vigente_desde)`


### Índices



- `CREATE UNIQUE INDEX tasa_impuesto_pkey ON baney_billing.tasa_impuesto USING btree (id)`

- `CREATE UNIQUE INDEX uq_tasa_codigo_vigencia ON baney_billing.tasa_impuesto USING btree (codigo, vigente_desde)`


## baney_caja.auditoria

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `actor_uid` | `text` | No | `` |

| `actor_rol` | `character varying(40)` | No | `` |

| `accion` | `text` | No | `` |

| `entidad_tipo` | `character varying(40)` | No | `` |

| `entidad_uid` | `text` | Sí | `` |

| `cuenta_id` | `bigint` | Sí | `` |

| `antes` | `jsonb` | Sí | `` |

| `despues` | `jsonb` | Sí | `` |

| `ip` | `bytea` | Sí | `` |

| `user_agent` | `character varying(300)` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `auditoria_accion_check`: `CHECK ((accion = ANY (ARRAY['consulta'::text, 'creacion'::text, 'modificacion'::text, 'anulacion'::text, 'aprobacion'::text, 'rechazo'::text, 'exportacion'::text])))`

- `auditoria_accion_not_null`: `NOT NULL accion`

- `auditoria_actor_rol_not_null`: `NOT NULL actor_rol`

- `auditoria_actor_uid_not_null`: `NOT NULL actor_uid`

- `auditoria_creado_en_not_null`: `NOT NULL creado_en`

- `auditoria_cuenta_id_check`: `CHECK ((cuenta_id >= 0))`

- `auditoria_entidad_tipo_not_null`: `NOT NULL entidad_tipo`

- `auditoria_id_check`: `CHECK ((id >= 0))`

- `auditoria_id_not_null`: `NOT NULL id`

- `auditoria_pkey`: `PRIMARY KEY (id)`

- `auditoria_uid_not_null`: `NOT NULL uid`

- `fk_unified_060`: `FOREIGN KEY (actor_uid) REFERENCES identity.users(id) DEFERRABLE`

- `fk_unified_069`: `FOREIGN KEY (cuenta_id) REFERENCES baney_caja.cuenta(id) DEFERRABLE`

- `uq_auditoria_uid`: `UNIQUE (uid)`


### Índices



- `CREATE UNIQUE INDEX auditoria_pkey ON baney_caja.auditoria USING btree (id)`

- `CREATE INDEX ix_auditoria_actor ON baney_caja.auditoria USING btree (actor_uid, creado_en)`

- `CREATE INDEX ix_auditoria_cuenta ON baney_caja.auditoria USING btree (cuenta_id, creado_en)`

- `CREATE INDEX ix_auditoria_entidad ON baney_caja.auditoria USING btree (entidad_tipo, entidad_uid, creado_en)`

- `CREATE UNIQUE INDEX uq_auditoria_uid ON baney_caja.auditoria USING btree (uid)`


### Triggers



- `immutable_cash_audit: EXECUTE FUNCTION reject_mutation()`


## baney_caja.cash_registers

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `account_id` | `bigint` | No | `` |

| `name` | `text` | No | `` |

| `location` | `text` | No | `` |

| `active` | `boolean` | No | `true` |


### Restricciones



- `cash_registers_account_id_fkey`: `FOREIGN KEY (account_id) REFERENCES baney_caja.cuenta(id)`

- `cash_registers_account_id_not_null`: `NOT NULL account_id`

- `cash_registers_active_not_null`: `NOT NULL active`

- `cash_registers_id_not_null`: `NOT NULL id`

- `cash_registers_location_not_null`: `NOT NULL location`

- `cash_registers_name_not_null`: `NOT NULL name`

- `cash_registers_pkey`: `PRIMARY KEY (id)`


### Índices



- `CREATE UNIQUE INDEX cash_registers_pkey ON baney_caja.cash_registers USING btree (id)`

- `CREATE INDEX ix_fk_19884 ON baney_caja.cash_registers USING btree (account_id)`


## baney_caja.cash_sessions

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `register_id` | `uuid` | No | `` |

| `opened_by` | `text` | No | `` |

| `closed_by` | `text` | Sí | `` |

| `opened_at` | `timestamp with time zone` | No | `now()` |

| `closed_at` | `timestamp with time zone` | Sí | `` |

| `opening_amount` | `numeric(14,2)` | No | `` |

| `closing_amount` | `numeric(14,2)` | Sí | `` |


### Restricciones



- `cash_sessions_check`: `CHECK (((closed_at IS NULL) OR (closed_at >= opened_at)))`

- `cash_sessions_closed_by_fkey`: `FOREIGN KEY (closed_by) REFERENCES identity.users(id)`

- `cash_sessions_closing_amount_check`: `CHECK ((closing_amount >= (0)::numeric))`

- `cash_sessions_id_not_null`: `NOT NULL id`

- `cash_sessions_opened_at_not_null`: `NOT NULL opened_at`

- `cash_sessions_opened_by_fkey`: `FOREIGN KEY (opened_by) REFERENCES identity.users(id)`

- `cash_sessions_opened_by_not_null`: `NOT NULL opened_by`

- `cash_sessions_opening_amount_check`: `CHECK ((opening_amount >= (0)::numeric))`

- `cash_sessions_opening_amount_not_null`: `NOT NULL opening_amount`

- `cash_sessions_pkey`: `PRIMARY KEY (id)`

- `cash_sessions_register_id_fkey`: `FOREIGN KEY (register_id) REFERENCES baney_caja.cash_registers(id)`

- `cash_sessions_register_id_not_null`: `NOT NULL register_id`


### Índices



- `CREATE UNIQUE INDEX cash_sessions_pkey ON baney_caja.cash_sessions USING btree (id)`

- `CREATE INDEX ix_fk_19906 ON baney_caja.cash_sessions USING btree (register_id)`

- `CREATE INDEX ix_fk_19911 ON baney_caja.cash_sessions USING btree (opened_by)`

- `CREATE INDEX ix_fk_19916 ON baney_caja.cash_sessions USING btree (closed_by)`

- `CREATE UNIQUE INDEX uq_open_cash_session ON baney_caja.cash_sessions USING btree (register_id) WHERE (closed_at IS NULL)`


## baney_caja.conciliacion

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `origen` | `text` | No | `` |

| `periodo_desde` | `date` | No | `` |

| `periodo_hasta` | `date` | No | `` |

| `archivo_url` | `character varying(500)` | Sí | `` |

| `total_externo` | `numeric(16,2)` | No | `0` |

| `total_interno` | `numeric(16,2)` | No | `0` |

| `diferencia` | `numeric(16,2)` | No | `0` |

| `lineas_cuadradas` | `bigint` | No | `0` |

| `lineas_sobrantes` | `bigint` | No | `0` |

| `lineas_faltantes` | `bigint` | No | `0` |

| `estado` | `text` | No | `'en_proceso'::text` |

| `ejecutado_por_uid` | `text` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `cerrada_en` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `ck_conciliacion_periodo`: `CHECK ((periodo_hasta >= periodo_desde))`

- `conciliacion_creado_en_not_null`: `NOT NULL creado_en`

- `conciliacion_diferencia_not_null`: `NOT NULL diferencia`

- `conciliacion_estado_check`: `CHECK ((estado = ANY (ARRAY['en_proceso'::text, 'cuadrada'::text, 'con_diferencias'::text, 'cerrada'::text])))`

- `conciliacion_estado_not_null`: `NOT NULL estado`

- `conciliacion_id_check`: `CHECK ((id >= 0))`

- `conciliacion_id_not_null`: `NOT NULL id`

- `conciliacion_lineas_cuadradas_check`: `CHECK ((lineas_cuadradas >= 0))`

- `conciliacion_lineas_cuadradas_not_null`: `NOT NULL lineas_cuadradas`

- `conciliacion_lineas_faltantes_check`: `CHECK ((lineas_faltantes >= 0))`

- `conciliacion_lineas_faltantes_not_null`: `NOT NULL lineas_faltantes`

- `conciliacion_lineas_sobrantes_check`: `CHECK ((lineas_sobrantes >= 0))`

- `conciliacion_lineas_sobrantes_not_null`: `NOT NULL lineas_sobrantes`

- `conciliacion_origen_check`: `CHECK ((origen = ANY (ARRAY['azul'::text, 'cardnet'::text, 'banco'::text, 'manual'::text])))`

- `conciliacion_origen_not_null`: `NOT NULL origen`

- `conciliacion_periodo_desde_not_null`: `NOT NULL periodo_desde`

- `conciliacion_periodo_hasta_not_null`: `NOT NULL periodo_hasta`

- `conciliacion_pkey`: `PRIMARY KEY (id)`

- `conciliacion_total_externo_not_null`: `NOT NULL total_externo`

- `conciliacion_total_interno_not_null`: `NOT NULL total_interno`

- `conciliacion_uid_not_null`: `NOT NULL uid`

- `fk_unified_056`: `FOREIGN KEY (ejecutado_por_uid) REFERENCES identity.users(id) DEFERRABLE`

- `uq_conciliacion_uid`: `UNIQUE (uid)`


### Índices



- `CREATE UNIQUE INDEX conciliacion_pkey ON baney_caja.conciliacion USING btree (id)`

- `CREATE INDEX ix_conciliacion_periodo ON baney_caja.conciliacion USING btree (origen, periodo_desde, periodo_hasta)`

- `CREATE INDEX ix_fk_21183 ON baney_caja.conciliacion USING btree (ejecutado_por_uid)`

- `CREATE UNIQUE INDEX uq_conciliacion_uid ON baney_caja.conciliacion USING btree (uid)`


## baney_caja.conciliacion_linea

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `conciliacion_id` | `bigint` | No | `` |

| `movimiento_id` | `bigint` | Sí | `` |

| `referencia_externa` | `character varying(100)` | Sí | `` |

| `fecha_externa` | `date` | Sí | `` |

| `monto_externo` | `numeric(14,2)` | Sí | `` |

| `monto_interno` | `numeric(14,2)` | Sí | `` |

| `diferencia` | `numeric(14,2)` | No | `0` |

| `resultado` | `text` | No | `` |

| `resuelto` | `smallint` | No | `0` |

| `nota` | `character varying(500)` | Sí | `` |


### Restricciones



- `conciliacion_linea_conciliacion_id_check`: `CHECK ((conciliacion_id >= 0))`

- `conciliacion_linea_conciliacion_id_not_null`: `NOT NULL conciliacion_id`

- `conciliacion_linea_diferencia_not_null`: `NOT NULL diferencia`

- `conciliacion_linea_id_check`: `CHECK ((id >= 0))`

- `conciliacion_linea_id_not_null`: `NOT NULL id`

- `conciliacion_linea_movimiento_id_check`: `CHECK ((movimiento_id >= 0))`

- `conciliacion_linea_pkey`: `PRIMARY KEY (id)`

- `conciliacion_linea_resuelto_check`: `CHECK ((resuelto = ANY (ARRAY[0, 1])))`

- `conciliacion_linea_resuelto_not_null`: `NOT NULL resuelto`

- `conciliacion_linea_resultado_check`: `CHECK ((resultado = ANY (ARRAY['cuadrado'::text, 'sobrante_externo'::text, 'faltante_externo'::text, 'monto_distinto'::text, 'duplicado'::text])))`

- `conciliacion_linea_resultado_not_null`: `NOT NULL resultado`

- `fk_conc_linea_conc`: `FOREIGN KEY (conciliacion_id) REFERENCES baney_caja.conciliacion(id) ON DELETE CASCADE`

- `fk_conc_linea_mov`: `FOREIGN KEY (movimiento_id) REFERENCES baney_caja.movimiento(id) ON DELETE RESTRICT`


### Índices



- `CREATE UNIQUE INDEX conciliacion_linea_pkey ON baney_caja.conciliacion_linea USING btree (id)`

- `CREATE INDEX ix_conc_linea ON baney_caja.conciliacion_linea USING btree (conciliacion_id, resultado)`

- `CREATE INDEX ix_conc_linea_mov ON baney_caja.conciliacion_linea USING btree (movimiento_id)`


## baney_caja.cuenta

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `titular_tipo` | `text` | No | `` |

| `titular_uid` | `text` | Sí | `` |

| `titular_nombre` | `character varying(200)` | No | `` |

| `titular_rnc` | `character varying(11)` | Sí | `` |

| `moneda` | `character(3)` | No | `'DOP'::bpchar` |

| `estado` | `text` | No | `'activa'::text` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `ck_account_holder`: `CHECK (((titular_tipo = 'plataforma'::text) = (titular_uid IS NULL)))`

- `cuenta_creado_en_not_null`: `NOT NULL creado_en`

- `cuenta_estado_check`: `CHECK ((estado = ANY (ARRAY['activa'::text, 'suspendida'::text, 'cerrada'::text])))`

- `cuenta_estado_not_null`: `NOT NULL estado`

- `cuenta_id_check`: `CHECK ((id >= 0))`

- `cuenta_id_not_null`: `NOT NULL id`

- `cuenta_moneda_not_null`: `NOT NULL moneda`

- `cuenta_pkey`: `PRIMARY KEY (id)`

- `cuenta_titular_nombre_not_null`: `NOT NULL titular_nombre`

- `cuenta_titular_tipo_check`: `CHECK ((titular_tipo = ANY (ARRAY['vendedor'::text, 'transportista'::text, 'plataforma'::text])))`

- `cuenta_titular_tipo_not_null`: `NOT NULL titular_tipo`

- `cuenta_uid_not_null`: `NOT NULL uid`

- `fk_unified_053`: `FOREIGN KEY (titular_uid) REFERENCES identity.users(id) DEFERRABLE`

- `uq_cuenta_titular`: `UNIQUE NULLS NOT DISTINCT (titular_tipo, titular_uid, moneda)`

- `uq_cuenta_uid`: `UNIQUE (uid)`


### Índices



- `CREATE UNIQUE INDEX cuenta_pkey ON baney_caja.cuenta USING btree (id)`

- `CREATE INDEX ix_cuenta_estado ON baney_caja.cuenta USING btree (estado)`

- `CREATE INDEX ix_fk_21168 ON baney_caja.cuenta USING btree (titular_uid)`

- `CREATE UNIQUE INDEX uq_cuenta_titular ON baney_caja.cuenta USING btree (titular_tipo, titular_uid, moneda) NULLS NOT DISTINCT`

- `CREATE UNIQUE INDEX uq_cuenta_uid ON baney_caja.cuenta USING btree (uid)`


## baney_caja.cuenta_bancaria

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `cuenta_id` | `bigint` | No | `` |

| `banco` | `character varying(100)` | No | `` |

| `tipo` | `text` | No | `` |

| `numero_cifrado` | `bytea` | No | `` |

| `ultimos4` | `character(4)` | No | `` |

| `titular_nombre` | `character varying(200)` | No | `` |

| `titular_documento` | `character varying(20)` | No | `` |

| `moneda` | `character(3)` | No | `'DOP'::bpchar` |

| `verificada` | `smallint` | No | `0` |

| `verificada_en` | `timestamp with time zone` | Sí | `` |

| `es_principal` | `smallint` | No | `0` |

| `activa` | `smallint` | No | `1` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `cuenta_bancaria_activa_check`: `CHECK ((activa = ANY (ARRAY[0, 1])))`

- `cuenta_bancaria_activa_not_null`: `NOT NULL activa`

- `cuenta_bancaria_banco_not_null`: `NOT NULL banco`

- `cuenta_bancaria_creado_en_not_null`: `NOT NULL creado_en`

- `cuenta_bancaria_cuenta_id_check`: `CHECK ((cuenta_id >= 0))`

- `cuenta_bancaria_cuenta_id_not_null`: `NOT NULL cuenta_id`

- `cuenta_bancaria_es_principal_check`: `CHECK ((es_principal = ANY (ARRAY[0, 1])))`

- `cuenta_bancaria_es_principal_not_null`: `NOT NULL es_principal`

- `cuenta_bancaria_id_check`: `CHECK ((id >= 0))`

- `cuenta_bancaria_id_not_null`: `NOT NULL id`

- `cuenta_bancaria_moneda_not_null`: `NOT NULL moneda`

- `cuenta_bancaria_numero_cifrado_not_null`: `NOT NULL numero_cifrado`

- `cuenta_bancaria_pkey`: `PRIMARY KEY (id)`

- `cuenta_bancaria_tipo_check`: `CHECK ((tipo = ANY (ARRAY['ahorro'::text, 'corriente'::text])))`

- `cuenta_bancaria_tipo_not_null`: `NOT NULL tipo`

- `cuenta_bancaria_titular_documento_not_null`: `NOT NULL titular_documento`

- `cuenta_bancaria_titular_nombre_not_null`: `NOT NULL titular_nombre`

- `cuenta_bancaria_uid_not_null`: `NOT NULL uid`

- `cuenta_bancaria_ultimos4_not_null`: `NOT NULL ultimos4`

- `cuenta_bancaria_verificada_check`: `CHECK ((verificada = ANY (ARRAY[0, 1])))`

- `cuenta_bancaria_verificada_not_null`: `NOT NULL verificada`

- `fk_banco_cuenta`: `FOREIGN KEY (cuenta_id) REFERENCES baney_caja.cuenta(id) ON DELETE CASCADE`

- `uq_banco_uid`: `UNIQUE (uid)`

- `uq_bank_account_owner`: `UNIQUE (id, cuenta_id)`


### Índices



- `CREATE UNIQUE INDEX cuenta_bancaria_pkey ON baney_caja.cuenta_bancaria USING btree (id)`

- `CREATE INDEX ix_banco_cuenta ON baney_caja.cuenta_bancaria USING btree (cuenta_id, activa)`

- `CREATE UNIQUE INDEX uq_banco_uid ON baney_caja.cuenta_bancaria USING btree (uid)`

- `CREATE UNIQUE INDEX uq_bank_account_owner ON baney_caja.cuenta_bancaria USING btree (id, cuenta_id)`


## baney_caja.inbox_procesado

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `mensaje_uid` | `text` | No | `` |

| `tipo_evento` | `character varying(80)` | No | `` |

| `procesado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `inbox_procesado_id_check`: `CHECK ((id >= 0))`

- `inbox_procesado_id_not_null`: `NOT NULL id`

- `inbox_procesado_mensaje_uid_not_null`: `NOT NULL mensaje_uid`

- `inbox_procesado_pkey`: `PRIMARY KEY (id)`

- `inbox_procesado_procesado_en_not_null`: `NOT NULL procesado_en`

- `inbox_procesado_tipo_evento_not_null`: `NOT NULL tipo_evento`

- `uq_inbox_mensaje`: `UNIQUE (mensaje_uid)`


### Índices



- `CREATE UNIQUE INDEX inbox_procesado_pkey ON baney_caja.inbox_procesado USING btree (id)`

- `CREATE UNIQUE INDEX uq_inbox_mensaje ON baney_caja.inbox_procesado USING btree (mensaje_uid)`


## baney_caja.movimiento

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `cuenta_id` | `bigint` | No | `` |

| `tipo` | `text` | No | `` |

| `monto` | `numeric(14,2)` | No | `` |

| `saldo_despues` | `numeric(16,2)` | No | `` |

| `moneda` | `character(3)` | No | `'DOP'::bpchar` |

| `estado_fondos` | `text` | No | `'pendiente'::text` |

| `disponible_desde` | `date` | Sí | `` |

| `fecha_valor` | `date` | No | `` |

| `referencia_tipo` | `text` | No | `` |

| `referencia_uid` | `text` | Sí | `` |

| `factura_uid` | `text` | Sí | `` |

| `descripcion` | `character varying(300)` | No | `` |

| `conciliado` | `smallint` | No | `0` |

| `conciliacion_id` | `bigint` | Sí | `` |

| `referencia_externa` | `character varying(100)` | Sí | `` |

| `corrige_mov_id` | `bigint` | Sí | `` |

| `actor_uid` | `text` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `cash_session_id` | `uuid` | Sí | `` |

| `ref_pedido` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'pedido'::text) THEN referencia_uid     ELSE NULL::text END` |

| `ref_suborden` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'suborden'::text) THEN referencia_uid     ELSE NULL::text END` |

| `ref_viaje` | `uuid` | Sí | ` CASE     WHEN (referencia_tipo = 'viaje'::text) THEN (referencia_uid)::uuid     ELSE NULL::uuid END` |

| `ref_factura` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'factura'::text) THEN referencia_uid     ELSE NULL::text END` |

| `ref_comision` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'comision'::text) THEN referencia_uid     ELSE NULL::text END` |

| `ref_liquidacion` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'liquidacion'::text) THEN referencia_uid     ELSE NULL::text END` |

| `ref_payout` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'payout'::text) THEN referencia_uid     ELSE NULL::text END` |

| `ref_devolucion` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'devolucion'::text) THEN referencia_uid     ELSE NULL::text END` |

| `ref_reembolso` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'reembolso'::text) THEN referencia_uid     ELSE NULL::text END` |

| `ref_conciliacion` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'conciliacion'::text) THEN referencia_uid     ELSE NULL::text END` |


### Restricciones



- `ck_mov_monto`: `CHECK ((monto <> (0)::numeric))`

- `ck_typed_reference`: `CHECK (((referencia_tipo <> ALL (ARRAY['pedido'::text, 'suborden'::text, 'viaje'::text, 'factura'::text, 'comision'::text, 'liquidacion'::text, 'payout'::text, 'devolucion'::text, 'reembolso'::text, 'conciliacion'::text])) OR (referencia_uid IS NOT NULL)))`

- `fk_mov_corrige`: `FOREIGN KEY (corrige_mov_id) REFERENCES baney_caja.movimiento(id) ON DELETE RESTRICT`

- `fk_mov_cuenta`: `FOREIGN KEY (cuenta_id) REFERENCES baney_caja.cuenta(id) ON DELETE RESTRICT`

- `fk_unified_054`: `FOREIGN KEY (factura_uid) REFERENCES baney_billing.factura(uid) DEFERRABLE`

- `fk_unified_055`: `FOREIGN KEY (actor_uid) REFERENCES identity.users(id) DEFERRABLE`

- `fk_unified_067`: `FOREIGN KEY (conciliacion_id) REFERENCES baney_caja.conciliacion(id) DEFERRABLE`

- `movimiento_cash_session_id_fkey`: `FOREIGN KEY (cash_session_id) REFERENCES baney_caja.cash_sessions(id)`

- `movimiento_conciliacion_id_check`: `CHECK ((conciliacion_id >= 0))`

- `movimiento_conciliado_check`: `CHECK ((conciliado = ANY (ARRAY[0, 1])))`

- `movimiento_conciliado_not_null`: `NOT NULL conciliado`

- `movimiento_corrige_mov_id_check`: `CHECK ((corrige_mov_id >= 0))`

- `movimiento_creado_en_not_null`: `NOT NULL creado_en`

- `movimiento_cuenta_id_check`: `CHECK ((cuenta_id >= 0))`

- `movimiento_cuenta_id_not_null`: `NOT NULL cuenta_id`

- `movimiento_descripcion_not_null`: `NOT NULL descripcion`

- `movimiento_estado_fondos_check`: `CHECK ((estado_fondos = ANY (ARRAY['pendiente'::text, 'disponible'::text, 'retenido'::text])))`

- `movimiento_estado_fondos_not_null`: `NOT NULL estado_fondos`

- `movimiento_fecha_valor_not_null`: `NOT NULL fecha_valor`

- `movimiento_id_check`: `CHECK ((id >= 0))`

- `movimiento_id_not_null`: `NOT NULL id`

- `movimiento_moneda_not_null`: `NOT NULL moneda`

- `movimiento_monto_not_null`: `NOT NULL monto`

- `movimiento_pkey`: `PRIMARY KEY (id)`

- `movimiento_ref_comision_fkey`: `FOREIGN KEY (ref_comision) REFERENCES baney_billing.comision(uid)`

- `movimiento_ref_conciliacion_fkey`: `FOREIGN KEY (ref_conciliacion) REFERENCES baney_caja.conciliacion(uid)`

- `movimiento_ref_devolucion_fkey`: `FOREIGN KEY (ref_devolucion) REFERENCES baney_order.devolucion(uid)`

- `movimiento_ref_factura_fkey`: `FOREIGN KEY (ref_factura) REFERENCES baney_billing.factura(uid)`

- `movimiento_ref_liquidacion_fkey`: `FOREIGN KEY (ref_liquidacion) REFERENCES baney_billing.liquidacion(uid)`

- `movimiento_ref_payout_fkey`: `FOREIGN KEY (ref_payout) REFERENCES baney_caja.payout(uid)`

- `movimiento_ref_pedido_fkey`: `FOREIGN KEY (ref_pedido) REFERENCES baney_order.pedido(uid)`

- `movimiento_ref_reembolso_fkey`: `FOREIGN KEY (ref_reembolso) REFERENCES payments.refunds(id)`

- `movimiento_ref_suborden_fkey`: `FOREIGN KEY (ref_suborden) REFERENCES baney_order.suborden(uid)`

- `movimiento_ref_viaje_fkey`: `FOREIGN KEY (ref_viaje) REFERENCES transport.trips(id)`

- `movimiento_referencia_tipo_check`: `CHECK ((referencia_tipo = ANY (ARRAY['pedido'::text, 'suborden'::text, 'viaje'::text, 'factura'::text, 'comision'::text, 'liquidacion'::text, 'payout'::text, 'devolucion'::text, 'reembolso'::text, 'conciliacion'::text, 'manual'::text])))`

- `movimiento_referencia_tipo_not_null`: `NOT NULL referencia_tipo`

- `movimiento_saldo_despues_not_null`: `NOT NULL saldo_despues`

- `movimiento_tipo_check`: `CHECK ((tipo = ANY (ARRAY['venta'::text, 'flete'::text, 'comision'::text, 'itbis'::text, 'retencion'::text, 'payout'::text, 'reembolso'::text, 'devolucion'::text, 'penalidad'::text, 'ajuste'::text, 'contra_asiento'::text, 'cargo_pasarela'::text])))`

- `movimiento_tipo_not_null`: `NOT NULL tipo`

- `movimiento_uid_not_null`: `NOT NULL uid`

- `uq_movimiento_idempotente`: `UNIQUE (cuenta_id, referencia_tipo, referencia_uid, tipo)`

- `uq_movimiento_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_fk_18209 ON baney_caja.movimiento USING btree (corrige_mov_id)`

- `CREATE INDEX ix_fk_19922 ON baney_caja.movimiento USING btree (cash_session_id)`

- `CREATE INDEX ix_fk_21173 ON baney_caja.movimiento USING btree (factura_uid)`

- `CREATE INDEX ix_fk_21178 ON baney_caja.movimiento USING btree (actor_uid)`

- `CREATE INDEX ix_fk_21238 ON baney_caja.movimiento USING btree (conciliacion_id)`

- `CREATE INDEX ix_fk_21543 ON baney_caja.movimiento USING btree (ref_pedido)`

- `CREATE INDEX ix_fk_21562 ON baney_caja.movimiento USING btree (ref_suborden)`

- `CREATE INDEX ix_fk_21581 ON baney_caja.movimiento USING btree (ref_viaje)`

- `CREATE INDEX ix_fk_21600 ON baney_caja.movimiento USING btree (ref_factura)`

- `CREATE INDEX ix_fk_21619 ON baney_caja.movimiento USING btree (ref_comision)`

- `CREATE INDEX ix_fk_21638 ON baney_caja.movimiento USING btree (ref_liquidacion)`

- `CREATE INDEX ix_fk_21657 ON baney_caja.movimiento USING btree (ref_payout)`

- `CREATE INDEX ix_fk_21676 ON baney_caja.movimiento USING btree (ref_devolucion)`

- `CREATE INDEX ix_fk_21695 ON baney_caja.movimiento USING btree (ref_reembolso)`

- `CREATE INDEX ix_fk_21714 ON baney_caja.movimiento USING btree (ref_conciliacion)`

- `CREATE INDEX ix_mov_cuenta_fecha ON baney_caja.movimiento USING btree (cuenta_id, fecha_valor, id)`

- `CREATE INDEX ix_mov_cuenta_tipo ON baney_caja.movimiento USING btree (cuenta_id, tipo, fecha_valor)`

- `CREATE INDEX ix_mov_disponible ON baney_caja.movimiento USING btree (cuenta_id, estado_fondos, disponible_desde)`

- `CREATE INDEX ix_mov_externa ON baney_caja.movimiento USING btree (referencia_externa)`

- `CREATE INDEX ix_mov_sin_conciliar ON baney_caja.movimiento USING btree (conciliado, fecha_valor)`

- `CREATE UNIQUE INDEX movimiento_pkey ON baney_caja.movimiento USING btree (id)`

- `CREATE UNIQUE INDEX uq_movimiento_idempotente ON baney_caja.movimiento USING btree (cuenta_id, referencia_tipo, referencia_uid, tipo)`

- `CREATE UNIQUE INDEX uq_movimiento_uid ON baney_caja.movimiento USING btree (uid)`


### Triggers



- `immutable_movements: EXECUTE FUNCTION reject_mutation()`

- `post_movement: EXECUTE FUNCTION baney_caja.post_movement()`

- `update_balance: EXECUTE FUNCTION baney_caja.update_balance()`


## baney_caja.outbox

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `agregado_tipo` | `character varying(60)` | No | `` |

| `agregado_uid` | `text` | No | `` |

| `tipo_evento` | `character varying(80)` | No | `` |

| `carga` | `jsonb` | No | `` |

| `estado` | `text` | No | `'pendiente'::text` |

| `intentos` | `integer` | No | `0` |

| `ultimo_error` | `character varying(500)` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `publicado_en` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `outbox_agregado_tipo_not_null`: `NOT NULL agregado_tipo`

- `outbox_agregado_uid_not_null`: `NOT NULL agregado_uid`

- `outbox_carga_not_null`: `NOT NULL carga`

- `outbox_creado_en_not_null`: `NOT NULL creado_en`

- `outbox_estado_check`: `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'publicado'::text, 'fallido'::text])))`

- `outbox_estado_not_null`: `NOT NULL estado`

- `outbox_id_check`: `CHECK ((id >= 0))`

- `outbox_id_not_null`: `NOT NULL id`

- `outbox_intentos_check`: `CHECK ((intentos >= 0))`

- `outbox_intentos_not_null`: `NOT NULL intentos`

- `outbox_pkey`: `PRIMARY KEY (id)`

- `outbox_tipo_evento_not_null`: `NOT NULL tipo_evento`

- `outbox_uid_not_null`: `NOT NULL uid`

- `uq_outbox_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_outbox_pendiente ON baney_caja.outbox USING btree (estado, creado_en)`

- `CREATE UNIQUE INDEX outbox_pkey ON baney_caja.outbox USING btree (id)`

- `CREATE UNIQUE INDEX uq_outbox_uid ON baney_caja.outbox USING btree (uid)`


## baney_caja.payout

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `numero` | `character varying(24)` | No | `` |

| `cuenta_id` | `bigint` | No | `` |

| `cuenta_bancaria_id` | `bigint` | No | `` |

| `liquidacion_uid` | `text` | Sí | `` |

| `origen` | `text` | No | `'solicitud_manual'::text` |

| `monto` | `numeric(14,2)` | No | `` |

| `comision_retiro` | `numeric(14,2)` | No | `0` |

| `monto_neto` | `numeric(14,2)` | No | `` |

| `moneda` | `character(3)` | No | `'DOP'::bpchar` |

| `estado` | `text` | No | `'solicitado'::text` |

| `motivo_rechazo` | `character varying(500)` | Sí | `` |

| `aprobado_por_uid` | `text` | Sí | `` |

| `referencia_bancaria` | `character varying(100)` | Sí | `` |

| `idempotency_key` | `character(36)` | No | `` |

| `solicitado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `aprobado_en` | `timestamp with time zone` | Sí | `` |

| `pagado_en` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `ck_payout_monto`: `CHECK (((monto > (0)::numeric) AND (monto_neto > (0)::numeric)))`

- `ck_payout_net`: `CHECK (((comision_retiro >= (0)::numeric) AND (monto_neto = (monto - comision_retiro))))`

- `fk_payout_banco`: `FOREIGN KEY (cuenta_bancaria_id) REFERENCES baney_caja.cuenta_bancaria(id) ON DELETE RESTRICT`

- `fk_payout_bank_owner`: `FOREIGN KEY (cuenta_bancaria_id, cuenta_id) REFERENCES baney_caja.cuenta_bancaria(id, cuenta_id)`

- `fk_payout_cuenta`: `FOREIGN KEY (cuenta_id) REFERENCES baney_caja.cuenta(id) ON DELETE RESTRICT`

- `fk_unified_057`: `FOREIGN KEY (liquidacion_uid) REFERENCES baney_billing.liquidacion(uid) DEFERRABLE`

- `fk_unified_058`: `FOREIGN KEY (aprobado_por_uid) REFERENCES identity.users(id) DEFERRABLE`

- `payout_comision_retiro_not_null`: `NOT NULL comision_retiro`

- `payout_cuenta_bancaria_id_check`: `CHECK ((cuenta_bancaria_id >= 0))`

- `payout_cuenta_bancaria_id_not_null`: `NOT NULL cuenta_bancaria_id`

- `payout_cuenta_id_check`: `CHECK ((cuenta_id >= 0))`

- `payout_cuenta_id_not_null`: `NOT NULL cuenta_id`

- `payout_estado_check`: `CHECK ((estado = ANY (ARRAY['solicitado'::text, 'aprobado'::text, 'rechazado'::text, 'en_proceso'::text, 'pagado'::text, 'fallido'::text, 'revertido'::text])))`

- `payout_estado_not_null`: `NOT NULL estado`

- `payout_id_check`: `CHECK ((id >= 0))`

- `payout_id_not_null`: `NOT NULL id`

- `payout_idempotency_key_not_null`: `NOT NULL idempotency_key`

- `payout_moneda_not_null`: `NOT NULL moneda`

- `payout_monto_neto_not_null`: `NOT NULL monto_neto`

- `payout_monto_not_null`: `NOT NULL monto`

- `payout_numero_not_null`: `NOT NULL numero`

- `payout_origen_check`: `CHECK ((origen = ANY (ARRAY['solicitud_manual'::text, 'programado'::text, 'liquidacion'::text])))`

- `payout_origen_not_null`: `NOT NULL origen`

- `payout_pkey`: `PRIMARY KEY (id)`

- `payout_solicitado_en_not_null`: `NOT NULL solicitado_en`

- `payout_uid_not_null`: `NOT NULL uid`

- `uq_payout_idem`: `UNIQUE (idempotency_key)`

- `uq_payout_numero`: `UNIQUE (numero)`

- `uq_payout_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_fk_18396 ON baney_caja.payout USING btree (cuenta_bancaria_id)`

- `CREATE INDEX ix_fk_21188 ON baney_caja.payout USING btree (liquidacion_uid)`

- `CREATE INDEX ix_fk_21193 ON baney_caja.payout USING btree (aprobado_por_uid)`

- `CREATE INDEX ix_fk_21776 ON baney_caja.payout USING btree (cuenta_bancaria_id, cuenta_id)`

- `CREATE INDEX ix_payout_cuenta ON baney_caja.payout USING btree (cuenta_id, estado, solicitado_en)`

- `CREATE INDEX ix_payout_estado ON baney_caja.payout USING btree (estado, solicitado_en)`

- `CREATE UNIQUE INDEX payout_pkey ON baney_caja.payout USING btree (id)`

- `CREATE UNIQUE INDEX uq_payout_idem ON baney_caja.payout USING btree (idempotency_key)`

- `CREATE UNIQUE INDEX uq_payout_numero ON baney_caja.payout USING btree (numero)`

- `CREATE UNIQUE INDEX uq_payout_uid ON baney_caja.payout USING btree (uid)`


## baney_caja.payout_programacion

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `cuenta_id` | `bigint` | No | `` |

| `frecuencia` | `text` | No | `'manual'::text` |

| `dia_semana` | `smallint` | Sí | `` |

| `dia_mes` | `smallint` | Sí | `` |

| `monto_minimo` | `numeric(14,2)` | No | `0` |

| `activa` | `smallint` | No | `1` |

| `proxima_corrida` | `date` | Sí | `` |


### Restricciones



- `fk_prog_cuenta`: `FOREIGN KEY (cuenta_id) REFERENCES baney_caja.cuenta(id) ON DELETE CASCADE`

- `payout_programacion_activa_check`: `CHECK ((activa = ANY (ARRAY[0, 1])))`

- `payout_programacion_activa_not_null`: `NOT NULL activa`

- `payout_programacion_cuenta_id_check`: `CHECK ((cuenta_id >= 0))`

- `payout_programacion_cuenta_id_not_null`: `NOT NULL cuenta_id`

- `payout_programacion_dia_mes_check`: `CHECK ((dia_mes >= 0))`

- `payout_programacion_dia_semana_check`: `CHECK ((dia_semana >= 0))`

- `payout_programacion_frecuencia_check`: `CHECK ((frecuencia = ANY (ARRAY['diaria'::text, 'semanal'::text, 'quincenal'::text, 'mensual'::text, 'manual'::text])))`

- `payout_programacion_frecuencia_not_null`: `NOT NULL frecuencia`

- `payout_programacion_id_check`: `CHECK ((id >= 0))`

- `payout_programacion_id_not_null`: `NOT NULL id`

- `payout_programacion_monto_minimo_not_null`: `NOT NULL monto_minimo`

- `payout_programacion_pkey`: `PRIMARY KEY (id)`

- `uq_prog_cuenta`: `UNIQUE (cuenta_id)`


### Índices



- `CREATE INDEX ix_prog_corrida ON baney_caja.payout_programacion USING btree (activa, proxima_corrida)`

- `CREATE UNIQUE INDEX payout_programacion_pkey ON baney_caja.payout_programacion USING btree (id)`

- `CREATE UNIQUE INDEX uq_prog_cuenta ON baney_caja.payout_programacion USING btree (cuenta_id)`


## baney_caja.reporte

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `cuenta_id` | `bigint` | Sí | `` |

| `tipo` | `text` | No | `` |

| `formato` | `text` | No | `` |

| `periodo_desde` | `date` | No | `` |

| `periodo_hasta` | `date` | No | `` |

| `filtros` | `jsonb` | Sí | `` |

| `estado` | `text` | No | `'encolado'::text` |

| `archivo_url` | `character varying(500)` | Sí | `` |

| `bytes` | `bigint` | Sí | `` |

| `expira_en` | `timestamp with time zone` | Sí | `` |

| `solicitado_por_uid` | `text` | No | `` |

| `error` | `character varying(500)` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `generado_en` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `fk_reporte_cuenta`: `FOREIGN KEY (cuenta_id) REFERENCES baney_caja.cuenta(id) ON DELETE CASCADE`

- `fk_unified_059`: `FOREIGN KEY (solicitado_por_uid) REFERENCES identity.users(id) DEFERRABLE`

- `reporte_bytes_check`: `CHECK ((bytes >= 0))`

- `reporte_creado_en_not_null`: `NOT NULL creado_en`

- `reporte_cuenta_id_check`: `CHECK ((cuenta_id >= 0))`

- `reporte_estado_check`: `CHECK ((estado = ANY (ARRAY['encolado'::text, 'generando'::text, 'listo'::text, 'fallido'::text, 'expirado'::text])))`

- `reporte_estado_not_null`: `NOT NULL estado`

- `reporte_formato_check`: `CHECK ((formato = ANY (ARRAY['pdf'::text, 'csv'::text, 'xlsx'::text])))`

- `reporte_formato_not_null`: `NOT NULL formato`

- `reporte_id_check`: `CHECK ((id >= 0))`

- `reporte_id_not_null`: `NOT NULL id`

- `reporte_periodo_desde_not_null`: `NOT NULL periodo_desde`

- `reporte_periodo_hasta_not_null`: `NOT NULL periodo_hasta`

- `reporte_pkey`: `PRIMARY KEY (id)`

- `reporte_solicitado_por_uid_not_null`: `NOT NULL solicitado_por_uid`

- `reporte_tipo_check`: `CHECK ((tipo = ANY (ARRAY['estado_cuenta'::text, 'movimientos_csv'::text, 'mensual'::text, 'impuestos'::text, 'comisiones'::text])))`

- `reporte_tipo_not_null`: `NOT NULL tipo`

- `reporte_uid_not_null`: `NOT NULL uid`

- `uq_reporte_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_fk_21198 ON baney_caja.reporte USING btree (solicitado_por_uid)`

- `CREATE INDEX ix_reporte_cola ON baney_caja.reporte USING btree (estado, creado_en)`

- `CREATE INDEX ix_reporte_cuenta ON baney_caja.reporte USING btree (cuenta_id, tipo, creado_en)`

- `CREATE UNIQUE INDEX reporte_pkey ON baney_caja.reporte USING btree (id)`

- `CREATE UNIQUE INDEX uq_reporte_uid ON baney_caja.reporte USING btree (uid)`


## baney_caja.saldo_cuenta

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `cuenta_id` | `bigint` | No | `` |

| `disponible` | `numeric(16,2)` | No | `0` |

| `pendiente` | `numeric(16,2)` | No | `0` |

| `retenido` | `numeric(16,2)` | No | `0` |

| `total` | `numeric(16,2)` | Sí | `((disponible + pendiente) + retenido)` |

| `ultimo_movimiento_id` | `bigint` | Sí | `` |

| `verificado_en` | `timestamp with time zone` | Sí | `` |

| `actualizado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `fk_saldo_cuenta`: `FOREIGN KEY (cuenta_id) REFERENCES baney_caja.cuenta(id) ON DELETE CASCADE`

- `fk_unified_068`: `FOREIGN KEY (ultimo_movimiento_id) REFERENCES baney_caja.movimiento(id) DEFERRABLE`

- `saldo_cuenta_actualizado_en_not_null`: `NOT NULL actualizado_en`

- `saldo_cuenta_cuenta_id_check`: `CHECK ((cuenta_id >= 0))`

- `saldo_cuenta_cuenta_id_not_null`: `NOT NULL cuenta_id`

- `saldo_cuenta_disponible_not_null`: `NOT NULL disponible`

- `saldo_cuenta_pendiente_not_null`: `NOT NULL pendiente`

- `saldo_cuenta_pkey`: `PRIMARY KEY (cuenta_id)`

- `saldo_cuenta_retenido_not_null`: `NOT NULL retenido`

- `saldo_cuenta_ultimo_movimiento_id_check`: `CHECK ((ultimo_movimiento_id >= 0))`


### Índices



- `CREATE INDEX ix_fk_21243 ON baney_caja.saldo_cuenta USING btree (ultimo_movimiento_id)`

- `CREATE UNIQUE INDEX saldo_cuenta_pkey ON baney_caja.saldo_cuenta USING btree (cuenta_id)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('actualizado_en')`


## baney_cart.carrito

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `usuario_uid` | `text` | Sí | `` |

| `token_sesion` | `character(43)` | Sí | `` |

| `estado` | `text` | No | `'activo'::text` |

| `moneda` | `character(3)` | No | `'DOP'::bpchar` |

| `cupon_codigo` | `character varying(40)` | Sí | `` |

| `cupon_descuento` | `numeric(14,2)` | No | `0` |

| `direccion_uid` | `text` | Sí | `` |

| `pedido_uid` | `text` | Sí | `` |

| `fusionado_en_uid` | `text` | Sí | `` |

| `expira_en` | `timestamp with time zone` | No | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `actualizado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `carrito_actualizado_en_not_null`: `NOT NULL actualizado_en`

- `carrito_creado_en_not_null`: `NOT NULL creado_en`

- `carrito_cupon_descuento_not_null`: `NOT NULL cupon_descuento`

- `carrito_estado_check`: `CHECK ((estado = ANY (ARRAY['activo'::text, 'convertido'::text, 'abandonado'::text, 'fusionado'::text])))`

- `carrito_estado_not_null`: `NOT NULL estado`

- `carrito_expira_en_not_null`: `NOT NULL expira_en`

- `carrito_id_check`: `CHECK ((id >= 0))`

- `carrito_id_not_null`: `NOT NULL id`

- `carrito_moneda_not_null`: `NOT NULL moneda`

- `carrito_pkey`: `PRIMARY KEY (id)`

- `carrito_uid_not_null`: `NOT NULL uid`

- `fk_unified_016`: `FOREIGN KEY (usuario_uid) REFERENCES identity.users(id) DEFERRABLE`

- `fk_unified_017`: `FOREIGN KEY (direccion_uid) REFERENCES profiles.addresses(id) DEFERRABLE`

- `fk_unified_018`: `FOREIGN KEY (pedido_uid) REFERENCES baney_order.pedido(uid) DEFERRABLE`

- `fk_unified_019`: `FOREIGN KEY (fusionado_en_uid) REFERENCES baney_cart.carrito(uid) DEFERRABLE`

- `uq_carrito_uid`: `UNIQUE (uid)`


### Índices



- `CREATE UNIQUE INDEX carrito_pkey ON baney_cart.carrito USING btree (id)`

- `CREATE INDEX ix_carrito_limpieza ON baney_cart.carrito USING btree (estado, expira_en)`

- `CREATE INDEX ix_carrito_token ON baney_cart.carrito USING btree (token_sesion)`

- `CREATE INDEX ix_carrito_usuario ON baney_cart.carrito USING btree (usuario_uid, estado)`

- `CREATE INDEX ix_fk_20988 ON baney_cart.carrito USING btree (direccion_uid)`

- `CREATE INDEX ix_fk_20993 ON baney_cart.carrito USING btree (pedido_uid)`

- `CREATE INDEX ix_fk_20998 ON baney_cart.carrito USING btree (fusionado_en_uid)`

- `CREATE UNIQUE INDEX uq_carrito_uid ON baney_cart.carrito USING btree (uid)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('actualizado_en')`


## baney_cart.carrito_entrega

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `carrito_id` | `bigint` | No | `` |

| `vendedor_uid` | `text` | No | `` |

| `modalidad` | `text` | No | `'envio_baney'::text` |

| `direccion_uid` | `text` | Sí | `` |

| `punto_retiro_texto` | `character varying(300)` | Sí | `` |

| `cotizacion_uid` | `text` | Sí | `` |

| `costo_transporte` | `numeric(14,2)` | No | `0` |

| `eta_minutos` | `bigint` | Sí | `` |

| `ventana_desde` | `timestamp with time zone` | Sí | `` |

| `ventana_hasta` | `timestamp with time zone` | Sí | `` |

| `notas` | `character varying(500)` | Sí | `` |

| `actualizado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `carrito_entrega_actualizado_en_not_null`: `NOT NULL actualizado_en`

- `carrito_entrega_carrito_id_check`: `CHECK ((carrito_id >= 0))`

- `carrito_entrega_carrito_id_not_null`: `NOT NULL carrito_id`

- `carrito_entrega_costo_transporte_not_null`: `NOT NULL costo_transporte`

- `carrito_entrega_eta_minutos_check`: `CHECK ((eta_minutos >= 0))`

- `carrito_entrega_id_check`: `CHECK ((id >= 0))`

- `carrito_entrega_id_not_null`: `NOT NULL id`

- `carrito_entrega_modalidad_check`: `CHECK ((modalidad = ANY (ARRAY['envio_baney'::text, 'retiro_local'::text, 'acuerdo_vendedor'::text])))`

- `carrito_entrega_modalidad_not_null`: `NOT NULL modalidad`

- `carrito_entrega_pkey`: `PRIMARY KEY (id)`

- `carrito_entrega_vendedor_uid_not_null`: `NOT NULL vendedor_uid`

- `fk_entrega_carrito`: `FOREIGN KEY (carrito_id) REFERENCES baney_cart.carrito(id) ON DELETE CASCADE`

- `fk_unified_023`: `FOREIGN KEY (vendedor_uid) REFERENCES baney_catalog.vendedor(uid) DEFERRABLE`

- `fk_unified_024`: `FOREIGN KEY (direccion_uid) REFERENCES profiles.addresses(id) DEFERRABLE`

- `fk_unified_025`: `FOREIGN KEY (cotizacion_uid) REFERENCES baney_cart.cotizacion_transporte(uid) DEFERRABLE`

- `uq_entrega_carrito_vendedor`: `UNIQUE (carrito_id, vendedor_uid)`


### Índices



- `CREATE UNIQUE INDEX carrito_entrega_pkey ON baney_cart.carrito_entrega USING btree (id)`

- `CREATE INDEX ix_fk_21018 ON baney_cart.carrito_entrega USING btree (vendedor_uid)`

- `CREATE INDEX ix_fk_21023 ON baney_cart.carrito_entrega USING btree (direccion_uid)`

- `CREATE INDEX ix_fk_21028 ON baney_cart.carrito_entrega USING btree (cotizacion_uid)`

- `CREATE UNIQUE INDEX uq_entrega_carrito_vendedor ON baney_cart.carrito_entrega USING btree (carrito_id, vendedor_uid)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('actualizado_en')`


## baney_cart.carrito_item

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `carrito_id` | `bigint` | No | `` |

| `variante_uid` | `text` | No | `` |

| `producto_uid` | `text` | No | `` |

| `vendedor_uid` | `text` | No | `` |

| `cantidad` | `bigint` | No | `` |

| `sku_snapshot` | `character varying(64)` | No | `` |

| `nombre_snapshot` | `character varying(200)` | No | `` |

| `variante_snapshot` | `character varying(160)` | No | `` |

| `foto_snapshot` | `character varying(500)` | Sí | `` |

| `precio_snapshot` | `numeric(14,2)` | No | `` |

| `unidad_snapshot` | `character varying(20)` | No | `` |

| `regimen_itbis` | `text` | No | `'exento'::text` |

| `peso_kg_snapshot` | `numeric(10,3)` | Sí | `` |

| `descuento_unitario` | `numeric(14,2)` | No | `0` |

| `precio_actual` | `numeric(14,2)` | Sí | `` |

| `disponible_actual` | `integer` | Sí | `` |

| `agregado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `actualizado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `carrito_item_actualizado_en_not_null`: `NOT NULL actualizado_en`

- `carrito_item_agregado_en_not_null`: `NOT NULL agregado_en`

- `carrito_item_cantidad_check`: `CHECK ((cantidad >= 0))`

- `carrito_item_cantidad_not_null`: `NOT NULL cantidad`

- `carrito_item_carrito_id_check`: `CHECK ((carrito_id >= 0))`

- `carrito_item_carrito_id_not_null`: `NOT NULL carrito_id`

- `carrito_item_descuento_unitario_not_null`: `NOT NULL descuento_unitario`

- `carrito_item_id_check`: `CHECK ((id >= 0))`

- `carrito_item_id_not_null`: `NOT NULL id`

- `carrito_item_nombre_snapshot_not_null`: `NOT NULL nombre_snapshot`

- `carrito_item_pkey`: `PRIMARY KEY (id)`

- `carrito_item_precio_snapshot_not_null`: `NOT NULL precio_snapshot`

- `carrito_item_producto_uid_not_null`: `NOT NULL producto_uid`

- `carrito_item_regimen_itbis_check`: `CHECK ((regimen_itbis = ANY (ARRAY['exento'::text, 'gravado'::text, 'tasa_cero'::text])))`

- `carrito_item_regimen_itbis_not_null`: `NOT NULL regimen_itbis`

- `carrito_item_sku_snapshot_not_null`: `NOT NULL sku_snapshot`

- `carrito_item_unidad_snapshot_not_null`: `NOT NULL unidad_snapshot`

- `carrito_item_variante_snapshot_not_null`: `NOT NULL variante_snapshot`

- `carrito_item_variante_uid_not_null`: `NOT NULL variante_uid`

- `carrito_item_vendedor_uid_not_null`: `NOT NULL vendedor_uid`

- `ck_item_cantidad`: `CHECK ((cantidad > 0))`

- `fk_item_carrito`: `FOREIGN KEY (carrito_id) REFERENCES baney_cart.carrito(id) ON DELETE CASCADE`

- `fk_unified_020`: `FOREIGN KEY (variante_uid) REFERENCES baney_catalog.variante(uid) DEFERRABLE`

- `fk_unified_021`: `FOREIGN KEY (producto_uid) REFERENCES baney_catalog.producto(uid) DEFERRABLE`

- `fk_unified_022`: `FOREIGN KEY (vendedor_uid) REFERENCES baney_catalog.vendedor(uid) DEFERRABLE`

- `uq_item_carrito_variante`: `UNIQUE (carrito_id, variante_uid)`


### Índices



- `CREATE UNIQUE INDEX carrito_item_pkey ON baney_cart.carrito_item USING btree (id)`

- `CREATE INDEX ix_fk_21003 ON baney_cart.carrito_item USING btree (variante_uid)`

- `CREATE INDEX ix_fk_21008 ON baney_cart.carrito_item USING btree (producto_uid)`

- `CREATE INDEX ix_fk_21013 ON baney_cart.carrito_item USING btree (vendedor_uid)`

- `CREATE INDEX ix_item_vendedor ON baney_cart.carrito_item USING btree (carrito_id, vendedor_uid)`

- `CREATE UNIQUE INDEX uq_item_carrito_variante ON baney_cart.carrito_item USING btree (carrito_id, variante_uid)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('actualizado_en')`


## baney_cart.cotizacion_transporte

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `carrito_id` | `bigint` | No | `` |

| `vendedor_uid` | `text` | No | `` |

| `origen_texto` | `character varying(300)` | No | `` |

| `origen_lat` | `numeric(10,7)` | Sí | `` |

| `origen_lng` | `numeric(10,7)` | Sí | `` |

| `destino_texto` | `character varying(300)` | No | `` |

| `destino_lat` | `numeric(10,7)` | Sí | `` |

| `destino_lng` | `numeric(10,7)` | Sí | `` |

| `distancia_km` | `numeric(10,2)` | Sí | `` |

| `peso_total_kg` | `numeric(10,3)` | Sí | `` |

| `tipo_vehiculo` | `character varying(60)` | Sí | `` |

| `costo` | `numeric(14,2)` | No | `` |

| `desglose` | `jsonb` | Sí | `` |

| `vigente_hasta` | `timestamp with time zone` | No | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `cotizacion_transporte_carrito_id_check`: `CHECK ((carrito_id >= 0))`

- `cotizacion_transporte_carrito_id_not_null`: `NOT NULL carrito_id`

- `cotizacion_transporte_costo_not_null`: `NOT NULL costo`

- `cotizacion_transporte_creado_en_not_null`: `NOT NULL creado_en`

- `cotizacion_transporte_destino_texto_not_null`: `NOT NULL destino_texto`

- `cotizacion_transporte_id_check`: `CHECK ((id >= 0))`

- `cotizacion_transporte_id_not_null`: `NOT NULL id`

- `cotizacion_transporte_origen_texto_not_null`: `NOT NULL origen_texto`

- `cotizacion_transporte_pkey`: `PRIMARY KEY (id)`

- `cotizacion_transporte_uid_not_null`: `NOT NULL uid`

- `cotizacion_transporte_vendedor_uid_not_null`: `NOT NULL vendedor_uid`

- `cotizacion_transporte_vigente_hasta_not_null`: `NOT NULL vigente_hasta`

- `fk_cotizacion_carrito`: `FOREIGN KEY (carrito_id) REFERENCES baney_cart.carrito(id) ON DELETE CASCADE`

- `fk_unified_026`: `FOREIGN KEY (vendedor_uid) REFERENCES baney_catalog.vendedor(uid) DEFERRABLE`

- `uq_cotizacion_uid`: `UNIQUE (uid)`


### Índices



- `CREATE UNIQUE INDEX cotizacion_transporte_pkey ON baney_cart.cotizacion_transporte USING btree (id)`

- `CREATE INDEX ix_cotizacion_carrito ON baney_cart.cotizacion_transporte USING btree (carrito_id, vendedor_uid, vigente_hasta)`

- `CREATE INDEX ix_fk_21033 ON baney_cart.cotizacion_transporte USING btree (vendedor_uid)`

- `CREATE UNIQUE INDEX uq_cotizacion_uid ON baney_cart.cotizacion_transporte USING btree (uid)`


## baney_cart.intento_checkout

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `carrito_id` | `bigint` | No | `` |

| `idempotency_key` | `character(36)` | No | `` |

| `resultado` | `text` | No | `'iniciado'::text` |

| `detalle` | `jsonb` | Sí | `` |

| `pedido_uid` | `text` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `finalizado_en` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `fk_intento_carrito`: `FOREIGN KEY (carrito_id) REFERENCES baney_cart.carrito(id) ON DELETE CASCADE`

- `fk_unified_027`: `FOREIGN KEY (pedido_uid) REFERENCES baney_order.pedido(uid) DEFERRABLE`

- `intento_checkout_carrito_id_check`: `CHECK ((carrito_id >= 0))`

- `intento_checkout_carrito_id_not_null`: `NOT NULL carrito_id`

- `intento_checkout_creado_en_not_null`: `NOT NULL creado_en`

- `intento_checkout_id_check`: `CHECK ((id >= 0))`

- `intento_checkout_id_not_null`: `NOT NULL id`

- `intento_checkout_idempotency_key_not_null`: `NOT NULL idempotency_key`

- `intento_checkout_pkey`: `PRIMARY KEY (id)`

- `intento_checkout_resultado_check`: `CHECK ((resultado = ANY (ARRAY['iniciado'::text, 'ok'::text, 'fallo_stock'::text, 'fallo_precio'::text, 'fallo_cupon'::text, 'fallo_pago'::text, 'fallo_transporte'::text, 'expirado'::text])))`

- `intento_checkout_resultado_not_null`: `NOT NULL resultado`

- `intento_checkout_uid_not_null`: `NOT NULL uid`

- `uq_intento_idem`: `UNIQUE (idempotency_key)`

- `uq_intento_uid`: `UNIQUE (uid)`


### Índices



- `CREATE UNIQUE INDEX intento_checkout_pkey ON baney_cart.intento_checkout USING btree (id)`

- `CREATE INDEX ix_fk_21038 ON baney_cart.intento_checkout USING btree (pedido_uid)`

- `CREATE INDEX ix_intento_carrito ON baney_cart.intento_checkout USING btree (carrito_id, creado_en)`

- `CREATE UNIQUE INDEX uq_intento_idem ON baney_cart.intento_checkout USING btree (idempotency_key)`

- `CREATE UNIQUE INDEX uq_intento_uid ON baney_cart.intento_checkout USING btree (uid)`


## baney_cart.outbox

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `agregado_tipo` | `character varying(60)` | No | `` |

| `agregado_uid` | `text` | No | `` |

| `tipo_evento` | `character varying(80)` | No | `` |

| `carga` | `jsonb` | No | `` |

| `estado` | `text` | No | `'pendiente'::text` |

| `intentos` | `integer` | No | `0` |

| `ultimo_error` | `character varying(500)` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `publicado_en` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `outbox_agregado_tipo_not_null`: `NOT NULL agregado_tipo`

- `outbox_agregado_uid_not_null`: `NOT NULL agregado_uid`

- `outbox_carga_not_null`: `NOT NULL carga`

- `outbox_creado_en_not_null`: `NOT NULL creado_en`

- `outbox_estado_check`: `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'publicado'::text, 'fallido'::text])))`

- `outbox_estado_not_null`: `NOT NULL estado`

- `outbox_id_check`: `CHECK ((id >= 0))`

- `outbox_id_not_null`: `NOT NULL id`

- `outbox_intentos_check`: `CHECK ((intentos >= 0))`

- `outbox_intentos_not_null`: `NOT NULL intentos`

- `outbox_pkey`: `PRIMARY KEY (id)`

- `outbox_tipo_evento_not_null`: `NOT NULL tipo_evento`

- `outbox_uid_not_null`: `NOT NULL uid`

- `uq_outbox_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_outbox_pendiente ON baney_cart.outbox USING btree (estado, creado_en)`

- `CREATE UNIQUE INDEX outbox_pkey ON baney_cart.outbox USING btree (id)`

- `CREATE UNIQUE INDEX uq_outbox_uid ON baney_cart.outbox USING btree (uid)`


## baney_catalog.area

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `integer` | No | `` |

| `slug` | `character varying(60)` | No | `` |

| `nombre` | `character varying(80)` | No | `` |

| `icono_url` | `character varying(500)` | Sí | `` |

| `orden` | `smallint` | No | `0` |

| `activa` | `smallint` | No | `1` |


### Restricciones



- `area_activa_check`: `CHECK ((activa = ANY (ARRAY[0, 1])))`

- `area_activa_not_null`: `NOT NULL activa`

- `area_id_check`: `CHECK ((id >= 0))`

- `area_id_not_null`: `NOT NULL id`

- `area_nombre_not_null`: `NOT NULL nombre`

- `area_orden_not_null`: `NOT NULL orden`

- `area_pkey`: `PRIMARY KEY (id)`

- `area_slug_not_null`: `NOT NULL slug`

- `uq_area_slug`: `UNIQUE (slug)`


### Índices



- `CREATE UNIQUE INDEX area_pkey ON baney_catalog.area USING btree (id)`

- `CREATE UNIQUE INDEX uq_area_slug ON baney_catalog.area USING btree (slug)`


## baney_catalog.auctions

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `text` | No | `(gen_random_uuid())::text` |

| `product_id` | `bigint` | No | `` |

| `opening_amount` | `numeric(14,2)` | No | `` |

| `minimum_increment` | `numeric(14,2)` | No | `` |

| `currency` | `character(3)` | No | `` |

| `starts_at` | `timestamp with time zone` | No | `` |

| `ends_at` | `timestamp with time zone` | No | `` |

| `status` | `text` | No | `'DRAFT'::text` |

| `winner_bid_id` | `uuid` | Sí | `` |


### Restricciones



- `auctions_check`: `CHECK ((ends_at > starts_at))`

- `auctions_currency_check`: `CHECK ((currency ~ '^[A-Z]{3}$'::text))`

- `auctions_currency_not_null`: `NOT NULL currency`

- `auctions_ends_at_not_null`: `NOT NULL ends_at`

- `auctions_id_not_null`: `NOT NULL id`

- `auctions_minimum_increment_check`: `CHECK ((minimum_increment > (0)::numeric))`

- `auctions_minimum_increment_not_null`: `NOT NULL minimum_increment`

- `auctions_opening_amount_check`: `CHECK ((opening_amount >= (0)::numeric))`

- `auctions_opening_amount_not_null`: `NOT NULL opening_amount`

- `auctions_pkey`: `PRIMARY KEY (id)`

- `auctions_product_id_fkey`: `FOREIGN KEY (product_id) REFERENCES baney_catalog.producto(id)`

- `auctions_product_id_not_null`: `NOT NULL product_id`

- `auctions_starts_at_not_null`: `NOT NULL starts_at`

- `auctions_status_check`: `CHECK ((status = ANY (ARRAY['DRAFT'::text, 'OPEN'::text, 'CLOSED'::text, 'CANCELLED'::text])))`

- `auctions_status_not_null`: `NOT NULL status`

- `fk_auction_winner`: `FOREIGN KEY (id, winner_bid_id) REFERENCES baney_catalog.bids(auction_id, id) DEFERRABLE`


### Índices



- `CREATE UNIQUE INDEX auctions_pkey ON baney_catalog.auctions USING btree (id)`

- `CREATE INDEX ix_fk_19656 ON baney_catalog.auctions USING btree (product_id)`

- `CREATE INDEX ix_fk_19688 ON baney_catalog.auctions USING btree (id, winner_bid_id)`


## baney_catalog.bids

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `auction_id` | `text` | No | `` |

| `bidder_id` | `text` | No | `` |

| `amount` | `numeric(14,2)` | No | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `bids_amount_check`: `CHECK ((amount > (0)::numeric))`

- `bids_amount_not_null`: `NOT NULL amount`

- `bids_auction_id_fkey`: `FOREIGN KEY (auction_id) REFERENCES baney_catalog.auctions(id)`

- `bids_auction_id_id_key`: `UNIQUE (auction_id, id)`

- `bids_auction_id_not_null`: `NOT NULL auction_id`

- `bids_bidder_id_fkey`: `FOREIGN KEY (bidder_id) REFERENCES identity.users(id)`

- `bids_bidder_id_not_null`: `NOT NULL bidder_id`

- `bids_created_at_not_null`: `NOT NULL created_at`

- `bids_id_not_null`: `NOT NULL id`

- `bids_pkey`: `PRIMARY KEY (id)`


### Índices



- `CREATE UNIQUE INDEX bids_auction_id_id_key ON baney_catalog.bids USING btree (auction_id, id)`

- `CREATE UNIQUE INDEX bids_pkey ON baney_catalog.bids USING btree (id)`

- `CREATE INDEX ix_fk_19683 ON baney_catalog.bids USING btree (bidder_id)`


### Triggers



- `immutable_bid: EXECUTE FUNCTION reject_mutation()`

- `validate_bid: EXECUTE FUNCTION baney_catalog.guard_bid()`


## baney_catalog.categoria

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `padre_id` | `bigint` | Sí | `` |

| `slug` | `character varying(80)` | No | `` |

| `nombre` | `character varying(120)` | No | `` |

| `ruta` | `character varying(500)` | No | `` |

| `nivel` | `smallint` | No | `0` |

| `orden` | `smallint` | No | `0` |

| `activa` | `smallint` | No | `1` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `categoria_activa_check`: `CHECK ((activa = ANY (ARRAY[0, 1])))`

- `categoria_activa_not_null`: `NOT NULL activa`

- `categoria_creado_en_not_null`: `NOT NULL creado_en`

- `categoria_id_check`: `CHECK ((id >= 0))`

- `categoria_id_not_null`: `NOT NULL id`

- `categoria_nivel_check`: `CHECK ((nivel >= 0))`

- `categoria_nivel_not_null`: `NOT NULL nivel`

- `categoria_nombre_not_null`: `NOT NULL nombre`

- `categoria_orden_not_null`: `NOT NULL orden`

- `categoria_padre_id_check`: `CHECK ((padre_id >= 0))`

- `categoria_pkey`: `PRIMARY KEY (id)`

- `categoria_ruta_not_null`: `NOT NULL ruta`

- `categoria_slug_not_null`: `NOT NULL slug`

- `fk_categoria_padre`: `FOREIGN KEY (padre_id) REFERENCES baney_catalog.categoria(id) ON DELETE RESTRICT`

- `uq_categoria_slug`: `UNIQUE (slug)`


### Índices



- `CREATE UNIQUE INDEX categoria_pkey ON baney_catalog.categoria USING btree (id)`

- `CREATE INDEX ix_categoria_padre ON baney_catalog.categoria USING btree (padre_id)`

- `CREATE INDEX ix_categoria_ruta ON baney_catalog.categoria USING btree (ruta)`

- `CREATE UNIQUE INDEX uq_categoria_slug ON baney_catalog.categoria USING btree (slug)`


## baney_catalog.cupon

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `codigo` | `character varying(40)` | No | `` |

| `descripcion` | `character varying(200)` | Sí | `` |

| `emisor_tipo` | `text` | No | `'plataforma'::text` |

| `vendedor_id` | `bigint` | Sí | `` |

| `tipo` | `text` | No | `` |

| `valor` | `numeric(14,2)` | No | `0` |

| `compra_minima` | `numeric(14,2)` | No | `0` |

| `descuento_maximo` | `numeric(14,2)` | Sí | `` |

| `usos_max` | `bigint` | Sí | `` |

| `usos_actuales` | `bigint` | No | `0` |

| `usos_max_usuario` | `bigint` | No | `1` |

| `vigente_desde` | `timestamp with time zone` | No | `` |

| `vigente_hasta` | `timestamp with time zone` | Sí | `` |

| `activo` | `smallint` | No | `1` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `ck_coupon_limits`: `CHECK (((usos_max IS NULL) OR (usos_actuales <= usos_max)))`

- `ck_coupon_value`: `CHECK (((valor >= (0)::numeric) AND ((tipo <> 'porcentaje'::text) OR (valor <= (100)::numeric))))`

- `cupon_activo_check`: `CHECK ((activo = ANY (ARRAY[0, 1])))`

- `cupon_activo_not_null`: `NOT NULL activo`

- `cupon_codigo_not_null`: `NOT NULL codigo`

- `cupon_compra_minima_not_null`: `NOT NULL compra_minima`

- `cupon_creado_en_not_null`: `NOT NULL creado_en`

- `cupon_emisor_tipo_check`: `CHECK ((emisor_tipo = ANY (ARRAY['plataforma'::text, 'vendedor'::text])))`

- `cupon_emisor_tipo_not_null`: `NOT NULL emisor_tipo`

- `cupon_id_check`: `CHECK ((id >= 0))`

- `cupon_id_not_null`: `NOT NULL id`

- `cupon_pkey`: `PRIMARY KEY (id)`

- `cupon_tipo_check`: `CHECK ((tipo = ANY (ARRAY['porcentaje'::text, 'monto_fijo'::text, 'envio_gratis'::text])))`

- `cupon_tipo_not_null`: `NOT NULL tipo`

- `cupon_uid_not_null`: `NOT NULL uid`

- `cupon_usos_actuales_check`: `CHECK ((usos_actuales >= 0))`

- `cupon_usos_actuales_not_null`: `NOT NULL usos_actuales`

- `cupon_usos_max_check`: `CHECK ((usos_max >= 0))`

- `cupon_usos_max_usuario_check`: `CHECK ((usos_max_usuario >= 0))`

- `cupon_usos_max_usuario_not_null`: `NOT NULL usos_max_usuario`

- `cupon_valor_not_null`: `NOT NULL valor`

- `cupon_vendedor_id_check`: `CHECK ((vendedor_id >= 0))`

- `cupon_vigente_desde_not_null`: `NOT NULL vigente_desde`

- `fk_cupon_vendedor`: `FOREIGN KEY (vendedor_id) REFERENCES baney_catalog.vendedor(id) ON DELETE CASCADE`

- `uq_cupon_codigo`: `UNIQUE (codigo)`

- `uq_cupon_uid`: `UNIQUE (uid)`


### Índices



- `CREATE UNIQUE INDEX cupon_pkey ON baney_catalog.cupon USING btree (id)`

- `CREATE INDEX ix_cupon_vigencia ON baney_catalog.cupon USING btree (activo, vigente_desde, vigente_hasta)`

- `CREATE INDEX ix_fk_16747 ON baney_catalog.cupon USING btree (vendedor_id)`

- `CREATE UNIQUE INDEX uq_cupon_codigo ON baney_catalog.cupon USING btree (codigo)`

- `CREATE UNIQUE INDEX uq_cupon_uid ON baney_catalog.cupon USING btree (uid)`


## baney_catalog.cupon_uso

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `cupon_id` | `bigint` | No | `` |

| `usuario_uid` | `text` | No | `` |

| `pedido_uid` | `text` | No | `` |

| `monto_descontado` | `numeric(14,2)` | No | `` |

| `usado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `cupon_uso_cupon_id_check`: `CHECK ((cupon_id >= 0))`

- `cupon_uso_cupon_id_not_null`: `NOT NULL cupon_id`

- `cupon_uso_id_check`: `CHECK ((id >= 0))`

- `cupon_uso_id_not_null`: `NOT NULL id`

- `cupon_uso_monto_descontado_not_null`: `NOT NULL monto_descontado`

- `cupon_uso_pedido_uid_not_null`: `NOT NULL pedido_uid`

- `cupon_uso_pkey`: `PRIMARY KEY (id)`

- `cupon_uso_usado_en_not_null`: `NOT NULL usado_en`

- `cupon_uso_usuario_uid_not_null`: `NOT NULL usuario_uid`

- `fk_cupon_uso_cupon`: `FOREIGN KEY (cupon_id) REFERENCES baney_catalog.cupon(id) ON DELETE CASCADE`

- `fk_unified_003`: `FOREIGN KEY (usuario_uid) REFERENCES identity.users(id) DEFERRABLE`

- `fk_unified_004`: `FOREIGN KEY (pedido_uid) REFERENCES baney_order.pedido(uid) DEFERRABLE`

- `uq_cupon_uso_pedido`: `UNIQUE (cupon_id, pedido_uid)`


### Índices



- `CREATE UNIQUE INDEX cupon_uso_pkey ON baney_catalog.cupon_uso USING btree (id)`

- `CREATE INDEX ix_cupon_uso_usuario ON baney_catalog.cupon_uso USING btree (cupon_id, usuario_uid)`

- `CREATE INDEX ix_fk_20918 ON baney_catalog.cupon_uso USING btree (usuario_uid)`

- `CREATE INDEX ix_fk_20923 ON baney_catalog.cupon_uso USING btree (pedido_uid)`

- `CREATE UNIQUE INDEX uq_cupon_uso_pedido ON baney_catalog.cupon_uso USING btree (cupon_id, pedido_uid)`


## baney_catalog.descuento

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `vendedor_id` | `bigint` | No | `` |

| `nombre` | `character varying(160)` | No | `` |

| `tipo` | `text` | No | `` |

| `valor` | `numeric(14,2)` | No | `` |

| `alcance` | `text` | No | `` |

| `vigente_desde` | `timestamp with time zone` | No | `` |

| `vigente_hasta` | `timestamp with time zone` | Sí | `` |

| `activo` | `smallint` | No | `1` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `ck_descuento_fechas`: `CHECK (((vigente_hasta IS NULL) OR (vigente_hasta > vigente_desde)))`

- `ck_descuento_valor`: `CHECK ((valor > (0)::numeric))`

- `ck_discount_percent`: `CHECK (((tipo <> 'porcentaje'::text) OR (valor <= (100)::numeric)))`

- `descuento_activo_check`: `CHECK ((activo = ANY (ARRAY[0, 1])))`

- `descuento_activo_not_null`: `NOT NULL activo`

- `descuento_alcance_check`: `CHECK ((alcance = ANY (ARRAY['vendedor'::text, 'categoria'::text, 'producto'::text, 'variante'::text])))`

- `descuento_alcance_not_null`: `NOT NULL alcance`

- `descuento_creado_en_not_null`: `NOT NULL creado_en`

- `descuento_id_check`: `CHECK ((id >= 0))`

- `descuento_id_not_null`: `NOT NULL id`

- `descuento_nombre_not_null`: `NOT NULL nombre`

- `descuento_pkey`: `PRIMARY KEY (id)`

- `descuento_tipo_check`: `CHECK ((tipo = ANY (ARRAY['porcentaje'::text, 'monto_fijo'::text])))`

- `descuento_tipo_not_null`: `NOT NULL tipo`

- `descuento_uid_not_null`: `NOT NULL uid`

- `descuento_valor_not_null`: `NOT NULL valor`

- `descuento_vendedor_id_check`: `CHECK ((vendedor_id >= 0))`

- `descuento_vendedor_id_not_null`: `NOT NULL vendedor_id`

- `descuento_vigente_desde_not_null`: `NOT NULL vigente_desde`

- `fk_descuento_vendedor`: `FOREIGN KEY (vendedor_id) REFERENCES baney_catalog.vendedor(id) ON DELETE CASCADE`

- `uq_descuento_uid`: `UNIQUE (uid)`


### Índices



- `CREATE UNIQUE INDEX descuento_pkey ON baney_catalog.descuento USING btree (id)`

- `CREATE INDEX ix_descuento_vigencia ON baney_catalog.descuento USING btree (vendedor_id, activo, vigente_desde, vigente_hasta)`

- `CREATE UNIQUE INDEX uq_descuento_uid ON baney_catalog.descuento USING btree (uid)`


## baney_catalog.descuento_objetivo

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `descuento_id` | `bigint` | No | `` |

| `categoria_id` | `bigint` | Sí | `` |

| `producto_id` | `bigint` | Sí | `` |

| `variante_id` | `bigint` | Sí | `` |


### Restricciones



- `ck_dobj_uno`: `CHECK ((((((categoria_id IS NOT NULL))::integer + ((producto_id IS NOT NULL))::integer) + ((variante_id IS NOT NULL))::integer) = 1))`

- `descuento_objetivo_categoria_id_check`: `CHECK ((categoria_id >= 0))`

- `descuento_objetivo_descuento_id_check`: `CHECK ((descuento_id >= 0))`

- `descuento_objetivo_descuento_id_not_null`: `NOT NULL descuento_id`

- `descuento_objetivo_id_check`: `CHECK ((id >= 0))`

- `descuento_objetivo_id_not_null`: `NOT NULL id`

- `descuento_objetivo_pkey`: `PRIMARY KEY (id)`

- `descuento_objetivo_producto_id_check`: `CHECK ((producto_id >= 0))`

- `descuento_objetivo_variante_id_check`: `CHECK ((variante_id >= 0))`

- `fk_dobj_categoria`: `FOREIGN KEY (categoria_id) REFERENCES baney_catalog.categoria(id) ON DELETE CASCADE`

- `fk_dobj_descuento`: `FOREIGN KEY (descuento_id) REFERENCES baney_catalog.descuento(id) ON DELETE CASCADE`

- `fk_dobj_producto`: `FOREIGN KEY (producto_id) REFERENCES baney_catalog.producto(id) ON DELETE CASCADE`

- `fk_dobj_variante`: `FOREIGN KEY (variante_id) REFERENCES baney_catalog.variante(id) ON DELETE CASCADE`


### Índices



- `CREATE UNIQUE INDEX descuento_objetivo_pkey ON baney_catalog.descuento_objetivo USING btree (id)`

- `CREATE INDEX ix_dobj_descuento ON baney_catalog.descuento_objetivo USING btree (descuento_id)`

- `CREATE INDEX ix_dobj_producto ON baney_catalog.descuento_objetivo USING btree (producto_id)`

- `CREATE INDEX ix_dobj_variante ON baney_catalog.descuento_objetivo USING btree (variante_id)`

- `CREATE INDEX ix_fk_16690 ON baney_catalog.descuento_objetivo USING btree (categoria_id)`


## baney_catalog.moderacion_log

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `entidad_tipo` | `text` | No | `` |

| `entidad_id` | `bigint` | No | `` |

| `accion` | `text` | No | `` |

| `estado_anterior` | `character varying(40)` | Sí | `` |

| `estado_nuevo` | `character varying(40)` | No | `` |

| `admin_uid` | `text` | No | `` |

| `motivo` | `character varying(500)` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `fk_unified_007`: `FOREIGN KEY (admin_uid) REFERENCES identity.users(id) DEFERRABLE`

- `moderacion_log_accion_check`: `CHECK ((accion = ANY (ARRAY['aprobar'::text, 'rechazar'::text, 'suspender'::text, 'reactivar'::text, 'ocultar'::text])))`

- `moderacion_log_accion_not_null`: `NOT NULL accion`

- `moderacion_log_admin_uid_not_null`: `NOT NULL admin_uid`

- `moderacion_log_creado_en_not_null`: `NOT NULL creado_en`

- `moderacion_log_entidad_id_check`: `CHECK ((entidad_id >= 0))`

- `moderacion_log_entidad_id_not_null`: `NOT NULL entidad_id`

- `moderacion_log_entidad_tipo_check`: `CHECK ((entidad_tipo = ANY (ARRAY['producto'::text, 'vendedor'::text, 'resena'::text])))`

- `moderacion_log_entidad_tipo_not_null`: `NOT NULL entidad_tipo`

- `moderacion_log_estado_nuevo_not_null`: `NOT NULL estado_nuevo`

- `moderacion_log_id_check`: `CHECK ((id >= 0))`

- `moderacion_log_id_not_null`: `NOT NULL id`

- `moderacion_log_pkey`: `PRIMARY KEY (id)`


### Índices



- `CREATE INDEX ix_moderacion_admin ON baney_catalog.moderacion_log USING btree (admin_uid, creado_en)`

- `CREATE INDEX ix_moderacion_entidad ON baney_catalog.moderacion_log USING btree (entidad_tipo, entidad_id, creado_en)`

- `CREATE UNIQUE INDEX moderacion_log_pkey ON baney_catalog.moderacion_log USING btree (id)`


## baney_catalog.outbox

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `agregado_tipo` | `character varying(60)` | No | `` |

| `agregado_uid` | `text` | No | `` |

| `tipo_evento` | `character varying(80)` | No | `` |

| `carga` | `jsonb` | No | `` |

| `estado` | `text` | No | `'pendiente'::text` |

| `intentos` | `integer` | No | `0` |

| `ultimo_error` | `character varying(500)` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `publicado_en` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `outbox_agregado_tipo_not_null`: `NOT NULL agregado_tipo`

- `outbox_agregado_uid_not_null`: `NOT NULL agregado_uid`

- `outbox_carga_not_null`: `NOT NULL carga`

- `outbox_creado_en_not_null`: `NOT NULL creado_en`

- `outbox_estado_check`: `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'publicado'::text, 'fallido'::text])))`

- `outbox_estado_not_null`: `NOT NULL estado`

- `outbox_id_check`: `CHECK ((id >= 0))`

- `outbox_id_not_null`: `NOT NULL id`

- `outbox_intentos_check`: `CHECK ((intentos >= 0))`

- `outbox_intentos_not_null`: `NOT NULL intentos`

- `outbox_pkey`: `PRIMARY KEY (id)`

- `outbox_tipo_evento_not_null`: `NOT NULL tipo_evento`

- `outbox_uid_not_null`: `NOT NULL uid`

- `uq_outbox_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_outbox_pendiente ON baney_catalog.outbox USING btree (estado, creado_en)`

- `CREATE UNIQUE INDEX outbox_pkey ON baney_catalog.outbox USING btree (id)`

- `CREATE UNIQUE INDEX uq_outbox_uid ON baney_catalog.outbox USING btree (uid)`


## baney_catalog.producto

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `vendedor_id` | `bigint` | No | `` |

| `categoria_id` | `bigint` | No | `` |

| `area_id` | `integer` | Sí | `` |

| `nombre` | `character varying(200)` | No | `` |

| `slug` | `character varying(220)` | No | `` |

| `descripcion` | `text` | Sí | `` |

| `unidad_medida` | `text` | No | `'unidad'::text` |

| `regimen_itbis` | `text` | No | `'exento'::text` |

| `estado` | `text` | No | `'borrador'::text` |

| `moderacion` | `text` | No | `'pendiente'::text` |

| `motivo_moderacion` | `character varying(500)` | Sí | `` |

| `es_temporada` | `smallint` | No | `0` |

| `temporada_desde` | `date` | Sí | `` |

| `temporada_hasta` | `date` | Sí | `` |

| `origen_provincia` | `character varying(80)` | Sí | `` |

| `rating_promedio` | `numeric(3,2)` | No | `0.00` |

| `total_resenas` | `bigint` | No | `0` |

| `total_vendido` | `bigint` | No | `0` |

| `publicado_en` | `timestamp with time zone` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `actualizado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `archivado_en` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `fk_producto_area`: `FOREIGN KEY (area_id) REFERENCES baney_catalog.area(id) ON DELETE SET NULL`

- `fk_producto_categoria`: `FOREIGN KEY (categoria_id) REFERENCES baney_catalog.categoria(id) ON DELETE RESTRICT`

- `fk_producto_vendedor`: `FOREIGN KEY (vendedor_id) REFERENCES baney_catalog.vendedor(id) ON DELETE RESTRICT`

- `producto_actualizado_en_not_null`: `NOT NULL actualizado_en`

- `producto_area_id_check`: `CHECK ((area_id >= 0))`

- `producto_categoria_id_check`: `CHECK ((categoria_id >= 0))`

- `producto_categoria_id_not_null`: `NOT NULL categoria_id`

- `producto_creado_en_not_null`: `NOT NULL creado_en`

- `producto_es_temporada_check`: `CHECK ((es_temporada = ANY (ARRAY[0, 1])))`

- `producto_es_temporada_not_null`: `NOT NULL es_temporada`

- `producto_estado_check`: `CHECK ((estado = ANY (ARRAY['borrador'::text, 'publicado'::text, 'agotado'::text, 'suspendido'::text, 'archivado'::text])))`

- `producto_estado_not_null`: `NOT NULL estado`

- `producto_id_check`: `CHECK ((id >= 0))`

- `producto_id_not_null`: `NOT NULL id`

- `producto_moderacion_check`: `CHECK ((moderacion = ANY (ARRAY['no_requerida'::text, 'pendiente'::text, 'aprobada'::text, 'rechazada'::text])))`

- `producto_moderacion_not_null`: `NOT NULL moderacion`

- `producto_nombre_not_null`: `NOT NULL nombre`

- `producto_pkey`: `PRIMARY KEY (id)`

- `producto_rating_promedio_not_null`: `NOT NULL rating_promedio`

- `producto_regimen_itbis_check`: `CHECK ((regimen_itbis = ANY (ARRAY['exento'::text, 'gravado'::text, 'tasa_cero'::text])))`

- `producto_regimen_itbis_not_null`: `NOT NULL regimen_itbis`

- `producto_slug_not_null`: `NOT NULL slug`

- `producto_total_resenas_check`: `CHECK ((total_resenas >= 0))`

- `producto_total_resenas_not_null`: `NOT NULL total_resenas`

- `producto_total_vendido_check`: `CHECK ((total_vendido >= 0))`

- `producto_total_vendido_not_null`: `NOT NULL total_vendido`

- `producto_uid_not_null`: `NOT NULL uid`

- `producto_unidad_medida_check`: `CHECK ((unidad_medida = ANY (ARRAY['unidad'::text, 'libra'::text, 'quintal'::text, 'caja'::text, 'saco'::text, 'racimo'::text, 'docena'::text, 'litro'::text, 'galon'::text, 'kilogramo'::text])))`

- `producto_unidad_medida_not_null`: `NOT NULL unidad_medida`

- `producto_vendedor_id_check`: `CHECK ((vendedor_id >= 0))`

- `producto_vendedor_id_not_null`: `NOT NULL vendedor_id`

- `uq_producto_slug`: `UNIQUE (slug)`

- `uq_producto_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ft_producto ON baney_catalog.producto USING gin (to_tsvector('spanish'::regconfig, (((COALESCE(nombre, ''::character varying))::text || ' '::text) || COALESCE(descripcion, ''::text))))`

- `CREATE INDEX ix_producto_area ON baney_catalog.producto USING btree (area_id, estado)`

- `CREATE INDEX ix_producto_categoria ON baney_catalog.producto USING btree (categoria_id, estado)`

- `CREATE INDEX ix_producto_listado ON baney_catalog.producto USING btree (estado, moderacion, publicado_en)`

- `CREATE INDEX ix_producto_temporada ON baney_catalog.producto USING btree (es_temporada, estado)`

- `CREATE INDEX ix_producto_vendedor ON baney_catalog.producto USING btree (vendedor_id, estado)`

- `CREATE UNIQUE INDEX producto_pkey ON baney_catalog.producto USING btree (id)`

- `CREATE UNIQUE INDEX uq_producto_slug ON baney_catalog.producto USING btree (slug)`

- `CREATE UNIQUE INDEX uq_producto_uid ON baney_catalog.producto USING btree (uid)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('actualizado_en')`


## baney_catalog.producto_foto

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `producto_id` | `bigint` | No | `` |

| `url` | `character varying(500)` | No | `` |

| `url_thumb` | `character varying(500)` | Sí | `` |

| `texto_alt` | `character varying(200)` | Sí | `` |

| `orden` | `smallint` | No | `0` |

| `es_principal` | `smallint` | No | `0` |

| `bytes` | `bigint` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `fk_foto_producto`: `FOREIGN KEY (producto_id) REFERENCES baney_catalog.producto(id) ON DELETE CASCADE`

- `producto_foto_bytes_check`: `CHECK ((bytes >= 0))`

- `producto_foto_creado_en_not_null`: `NOT NULL creado_en`

- `producto_foto_es_principal_check`: `CHECK ((es_principal = ANY (ARRAY[0, 1])))`

- `producto_foto_es_principal_not_null`: `NOT NULL es_principal`

- `producto_foto_id_check`: `CHECK ((id >= 0))`

- `producto_foto_id_not_null`: `NOT NULL id`

- `producto_foto_orden_not_null`: `NOT NULL orden`

- `producto_foto_pkey`: `PRIMARY KEY (id)`

- `producto_foto_producto_id_check`: `CHECK ((producto_id >= 0))`

- `producto_foto_producto_id_not_null`: `NOT NULL producto_id`

- `producto_foto_url_not_null`: `NOT NULL url`


### Índices



- `CREATE INDEX ix_foto_producto ON baney_catalog.producto_foto USING btree (producto_id, orden)`

- `CREATE UNIQUE INDEX producto_foto_pkey ON baney_catalog.producto_foto USING btree (id)`


## baney_catalog.resena

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `tipo` | `text` | No | `` |

| `producto_id` | `bigint` | Sí | `` |

| `vendedor_id` | `bigint` | Sí | `` |

| `autor_uid` | `text` | No | `` |

| `autor_nombre` | `character varying(120)` | No | `` |

| `pedido_uid` | `text` | No | `` |

| `puntuacion` | `smallint` | No | `` |

| `titulo` | `character varying(160)` | Sí | `` |

| `comentario` | `text` | Sí | `` |

| `moderacion` | `text` | No | `'pendiente'::text` |

| `respuesta_vendedor` | `text` | Sí | `` |

| `respondida_en` | `timestamp with time zone` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `ck_resena_destino`: `CHECK ((((tipo = 'producto'::text) AND (producto_id IS NOT NULL) AND (vendedor_id IS NULL)) OR ((tipo = 'vendedor'::text) AND (vendedor_id IS NOT NULL) AND (producto_id IS NULL))))`

- `ck_resena_puntuacion`: `CHECK (((puntuacion >= 1) AND (puntuacion <= 5)))`

- `fk_resena_producto`: `FOREIGN KEY (producto_id) REFERENCES baney_catalog.producto(id) ON DELETE CASCADE`

- `fk_resena_vendedor`: `FOREIGN KEY (vendedor_id) REFERENCES baney_catalog.vendedor(id) ON DELETE CASCADE`

- `fk_unified_005`: `FOREIGN KEY (autor_uid) REFERENCES identity.users(id) DEFERRABLE`

- `fk_unified_006`: `FOREIGN KEY (pedido_uid) REFERENCES baney_order.pedido(uid) DEFERRABLE`

- `resena_autor_nombre_not_null`: `NOT NULL autor_nombre`

- `resena_autor_uid_not_null`: `NOT NULL autor_uid`

- `resena_creado_en_not_null`: `NOT NULL creado_en`

- `resena_id_check`: `CHECK ((id >= 0))`

- `resena_id_not_null`: `NOT NULL id`

- `resena_moderacion_check`: `CHECK ((moderacion = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'rechazada'::text])))`

- `resena_moderacion_not_null`: `NOT NULL moderacion`

- `resena_pedido_uid_not_null`: `NOT NULL pedido_uid`

- `resena_pkey`: `PRIMARY KEY (id)`

- `resena_producto_id_check`: `CHECK ((producto_id >= 0))`

- `resena_puntuacion_check`: `CHECK ((puntuacion >= 0))`

- `resena_puntuacion_not_null`: `NOT NULL puntuacion`

- `resena_tipo_check`: `CHECK ((tipo = ANY (ARRAY['producto'::text, 'vendedor'::text])))`

- `resena_tipo_not_null`: `NOT NULL tipo`

- `resena_uid_not_null`: `NOT NULL uid`

- `resena_vendedor_id_check`: `CHECK ((vendedor_id >= 0))`

- `uq_resena_uid`: `UNIQUE (uid)`

- `uq_resena_una_por_compra`: `UNIQUE NULLS NOT DISTINCT (tipo, pedido_uid, producto_id, vendedor_id)`


### Índices



- `CREATE INDEX ix_fk_20928 ON baney_catalog.resena USING btree (autor_uid)`

- `CREATE INDEX ix_fk_20933 ON baney_catalog.resena USING btree (pedido_uid)`

- `CREATE INDEX ix_resena_producto ON baney_catalog.resena USING btree (producto_id, moderacion, creado_en)`

- `CREATE INDEX ix_resena_vendedor ON baney_catalog.resena USING btree (vendedor_id, moderacion, creado_en)`

- `CREATE UNIQUE INDEX resena_pkey ON baney_catalog.resena USING btree (id)`

- `CREATE UNIQUE INDEX uq_resena_uid ON baney_catalog.resena USING btree (uid)`

- `CREATE UNIQUE INDEX uq_resena_una_por_compra ON baney_catalog.resena USING btree (tipo, pedido_uid, producto_id, vendedor_id) NULLS NOT DISTINCT`


## baney_catalog.urgent_requests

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `text` | No | `(gen_random_uuid())::text` |

| `requester_id` | `text` | No | `` |

| `category_id` | `bigint` | Sí | `` |

| `description` | `text` | No | `` |

| `budget` | `numeric(14,2)` | No | `` |

| `currency` | `character(3)` | No | `` |

| `required_at` | `timestamp with time zone` | No | `` |

| `status` | `text` | No | `'OPEN'::text` |


### Restricciones



- `urgent_requests_budget_check`: `CHECK ((budget >= (0)::numeric))`

- `urgent_requests_budget_not_null`: `NOT NULL budget`

- `urgent_requests_category_id_fkey`: `FOREIGN KEY (category_id) REFERENCES baney_catalog.categoria(id)`

- `urgent_requests_currency_check`: `CHECK ((currency ~ '^[A-Z]{3}$'::text))`

- `urgent_requests_currency_not_null`: `NOT NULL currency`

- `urgent_requests_description_not_null`: `NOT NULL description`

- `urgent_requests_id_not_null`: `NOT NULL id`

- `urgent_requests_pkey`: `PRIMARY KEY (id)`

- `urgent_requests_requester_id_fkey`: `FOREIGN KEY (requester_id) REFERENCES identity.users(id)`

- `urgent_requests_requester_id_not_null`: `NOT NULL requester_id`

- `urgent_requests_required_at_not_null`: `NOT NULL required_at`

- `urgent_requests_status_check`: `CHECK ((status = ANY (ARRAY['OPEN'::text, 'FULFILLED'::text, 'EXPIRED'::text, 'CANCELLED'::text])))`

- `urgent_requests_status_not_null`: `NOT NULL status`


### Índices



- `CREATE INDEX ix_fk_19712 ON baney_catalog.urgent_requests USING btree (requester_id)`

- `CREATE INDEX ix_fk_19717 ON baney_catalog.urgent_requests USING btree (category_id)`

- `CREATE UNIQUE INDEX urgent_requests_pkey ON baney_catalog.urgent_requests USING btree (id)`


## baney_catalog.variante

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `producto_id` | `bigint` | No | `` |

| `sku` | `character varying(64)` | No | `` |

| `nombre` | `character varying(160)` | No | `'Ãšnica'::character varying` |

| `atributos` | `jsonb` | Sí | `` |

| `precio` | `numeric(14,2)` | No | `` |

| `precio_comparacion` | `numeric(14,2)` | Sí | `` |

| `moneda` | `character(3)` | No | `'DOP'::bpchar` |

| `peso_kg` | `numeric(10,3)` | Sí | `` |

| `volumen_m3` | `numeric(10,4)` | Sí | `` |

| `cantidad_minima` | `bigint` | No | `1` |

| `cantidad_maxima` | `bigint` | Sí | `` |

| `activa` | `smallint` | No | `1` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `actualizado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `ck_variante_comparacion`: `CHECK (((precio_comparacion IS NULL) OR (precio_comparacion > precio)))`

- `ck_variante_precio`: `CHECK ((precio >= (0)::numeric))`

- `fk_variante_producto`: `FOREIGN KEY (producto_id) REFERENCES baney_catalog.producto(id) ON DELETE CASCADE`

- `uq_variante_sku`: `UNIQUE (sku)`

- `uq_variante_uid`: `UNIQUE (uid)`

- `variante_activa_check`: `CHECK ((activa = ANY (ARRAY[0, 1])))`

- `variante_activa_not_null`: `NOT NULL activa`

- `variante_actualizado_en_not_null`: `NOT NULL actualizado_en`

- `variante_cantidad_maxima_check`: `CHECK ((cantidad_maxima >= 0))`

- `variante_cantidad_minima_check`: `CHECK ((cantidad_minima >= 0))`

- `variante_cantidad_minima_not_null`: `NOT NULL cantidad_minima`

- `variante_creado_en_not_null`: `NOT NULL creado_en`

- `variante_id_check`: `CHECK ((id >= 0))`

- `variante_id_not_null`: `NOT NULL id`

- `variante_moneda_not_null`: `NOT NULL moneda`

- `variante_nombre_not_null`: `NOT NULL nombre`

- `variante_pkey`: `PRIMARY KEY (id)`

- `variante_precio_not_null`: `NOT NULL precio`

- `variante_producto_id_check`: `CHECK ((producto_id >= 0))`

- `variante_producto_id_not_null`: `NOT NULL producto_id`

- `variante_sku_not_null`: `NOT NULL sku`

- `variante_uid_not_null`: `NOT NULL uid`


### Índices



- `CREATE INDEX ix_variante_precio ON baney_catalog.variante USING btree (precio)`

- `CREATE INDEX ix_variante_producto ON baney_catalog.variante USING btree (producto_id, activa)`

- `CREATE UNIQUE INDEX uq_variante_sku ON baney_catalog.variante USING btree (sku)`

- `CREATE UNIQUE INDEX uq_variante_uid ON baney_catalog.variante USING btree (uid)`

- `CREATE UNIQUE INDEX variante_pkey ON baney_catalog.variante USING btree (id)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('actualizado_en')`


## baney_catalog.variante_precio_historial

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `variante_id` | `bigint` | No | `` |

| `precio_anterior` | `numeric(14,2)` | Sí | `` |

| `precio_nuevo` | `numeric(14,2)` | No | `` |

| `actor_uid` | `text` | Sí | `` |

| `motivo` | `character varying(200)` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `fk_precio_hist_variante`: `FOREIGN KEY (variante_id) REFERENCES baney_catalog.variante(id) ON DELETE CASCADE`

- `fk_unified_002`: `FOREIGN KEY (actor_uid) REFERENCES identity.users(id) DEFERRABLE`

- `variante_precio_historial_creado_en_not_null`: `NOT NULL creado_en`

- `variante_precio_historial_id_check`: `CHECK ((id >= 0))`

- `variante_precio_historial_id_not_null`: `NOT NULL id`

- `variante_precio_historial_pkey`: `PRIMARY KEY (id)`

- `variante_precio_historial_precio_nuevo_not_null`: `NOT NULL precio_nuevo`

- `variante_precio_historial_variante_id_check`: `CHECK ((variante_id >= 0))`

- `variante_precio_historial_variante_id_not_null`: `NOT NULL variante_id`


### Índices



- `CREATE INDEX ix_fk_20913 ON baney_catalog.variante_precio_historial USING btree (actor_uid)`

- `CREATE INDEX ix_precio_hist ON baney_catalog.variante_precio_historial USING btree (variante_id, creado_en)`

- `CREATE UNIQUE INDEX variante_precio_historial_pkey ON baney_catalog.variante_precio_historial USING btree (id)`


## baney_catalog.vendedor

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `nombre_negocio` | `character varying(160)` | No | `` |

| `slug` | `character varying(180)` | No | `` |

| `rnc` | `character varying(11)` | Sí | `` |

| `rnc_verificado` | `smallint` | No | `0` |

| `logo_url` | `character varying(500)` | Sí | `` |

| `descripcion` | `text` | Sí | `` |

| `provincia` | `character varying(80)` | Sí | `` |

| `municipio` | `character varying(80)` | Sí | `` |

| `latitud` | `numeric(10,7)` | Sí | `` |

| `longitud` | `numeric(10,7)` | Sí | `` |

| `estado` | `text` | No | `'pendiente'::text` |

| `motivo_estado` | `character varying(500)` | Sí | `` |

| `aprobado_por_uid` | `text` | Sí | `` |

| `aprobado_en` | `timestamp with time zone` | Sí | `` |

| `rating_promedio` | `numeric(3,2)` | No | `0.00` |

| `total_resenas` | `bigint` | No | `0` |

| `total_productos` | `bigint` | No | `0` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `actualizado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `ck_vendedor_rating`: `CHECK (((rating_promedio >= (0)::numeric) AND (rating_promedio <= (5)::numeric)))`

- `fk_unified_001`: `FOREIGN KEY (aprobado_por_uid) REFERENCES identity.users(id) DEFERRABLE`

- `fk_unified_061`: `FOREIGN KEY (uid) REFERENCES identity.users(id) DEFERRABLE`

- `uq_vendedor_slug`: `UNIQUE (slug)`

- `uq_vendedor_uid`: `UNIQUE (uid)`

- `vendedor_actualizado_en_not_null`: `NOT NULL actualizado_en`

- `vendedor_creado_en_not_null`: `NOT NULL creado_en`

- `vendedor_estado_check`: `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text, 'suspendido'::text])))`

- `vendedor_estado_not_null`: `NOT NULL estado`

- `vendedor_id_check`: `CHECK ((id >= 0))`

- `vendedor_id_not_null`: `NOT NULL id`

- `vendedor_nombre_negocio_not_null`: `NOT NULL nombre_negocio`

- `vendedor_pkey`: `PRIMARY KEY (id)`

- `vendedor_rating_promedio_not_null`: `NOT NULL rating_promedio`

- `vendedor_rnc_verificado_check`: `CHECK ((rnc_verificado = ANY (ARRAY[0, 1])))`

- `vendedor_rnc_verificado_not_null`: `NOT NULL rnc_verificado`

- `vendedor_slug_not_null`: `NOT NULL slug`

- `vendedor_total_productos_check`: `CHECK ((total_productos >= 0))`

- `vendedor_total_productos_not_null`: `NOT NULL total_productos`

- `vendedor_total_resenas_check`: `CHECK ((total_resenas >= 0))`

- `vendedor_total_resenas_not_null`: `NOT NULL total_resenas`

- `vendedor_uid_not_null`: `NOT NULL uid`


### Índices



- `CREATE INDEX ix_fk_20908 ON baney_catalog.vendedor USING btree (aprobado_por_uid)`

- `CREATE INDEX ix_vendedor_estado ON baney_catalog.vendedor USING btree (estado)`

- `CREATE INDEX ix_vendedor_geo ON baney_catalog.vendedor USING btree (latitud, longitud)`

- `CREATE UNIQUE INDEX uq_vendedor_slug ON baney_catalog.vendedor USING btree (slug)`

- `CREATE UNIQUE INDEX uq_vendedor_uid ON baney_catalog.vendedor USING btree (uid)`

- `CREATE UNIQUE INDEX vendedor_pkey ON baney_catalog.vendedor USING btree (id)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('actualizado_en')`


## baney_inventory.alerta_stock

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `existencia_id` | `bigint` | No | `` |

| `vendedor_uid` | `text` | No | `` |

| `tipo` | `text` | No | `` |

| `disponible_en_alerta` | `integer` | No | `` |

| `notificada` | `smallint` | No | `0` |

| `resuelta_en` | `timestamp with time zone` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `alerta_stock_creado_en_not_null`: `NOT NULL creado_en`

- `alerta_stock_disponible_en_alerta_not_null`: `NOT NULL disponible_en_alerta`

- `alerta_stock_existencia_id_check`: `CHECK ((existencia_id >= 0))`

- `alerta_stock_existencia_id_not_null`: `NOT NULL existencia_id`

- `alerta_stock_id_check`: `CHECK ((id >= 0))`

- `alerta_stock_id_not_null`: `NOT NULL id`

- `alerta_stock_notificada_check`: `CHECK ((notificada = ANY (ARRAY[0, 1])))`

- `alerta_stock_notificada_not_null`: `NOT NULL notificada`

- `alerta_stock_pkey`: `PRIMARY KEY (id)`

- `alerta_stock_tipo_check`: `CHECK ((tipo = ANY (ARRAY['bajo_umbral'::text, 'agotado'::text])))`

- `alerta_stock_tipo_not_null`: `NOT NULL tipo`

- `alerta_stock_vendedor_uid_not_null`: `NOT NULL vendedor_uid`

- `fk_alerta_existencia`: `FOREIGN KEY (existencia_id) REFERENCES baney_inventory.existencia(id) ON DELETE CASCADE`

- `fk_unified_015`: `FOREIGN KEY (vendedor_uid) REFERENCES baney_catalog.vendedor(uid) DEFERRABLE`


### Índices



- `CREATE UNIQUE INDEX alerta_stock_pkey ON baney_inventory.alerta_stock USING btree (id)`

- `CREATE INDEX ix_alerta_pendiente ON baney_inventory.alerta_stock USING btree (notificada, creado_en)`

- `CREATE INDEX ix_alerta_vendedor ON baney_inventory.alerta_stock USING btree (vendedor_uid, resuelta_en)`

- `CREATE INDEX ix_fk_16998 ON baney_inventory.alerta_stock USING btree (existencia_id)`


## baney_inventory.existencia

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `variante_uid` | `text` | No | `` |

| `producto_uid` | `text` | No | `` |

| `vendedor_uid` | `text` | No | `` |

| `sku` | `character varying(64)` | No | `` |

| `disponible` | `integer` | No | `0` |

| `reservado` | `integer` | No | `0` |

| `umbral_alerta` | `integer` | No | `0` |

| `permite_sobreventa` | `smallint` | No | `0` |

| `ubicacion` | `character varying(160)` | Sí | `` |

| `version` | `bigint` | No | `0` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `actualizado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `ck_existencia_no_negativo`: `CHECK (((disponible >= 0) AND (reservado >= 0)))`

- `existencia_actualizado_en_not_null`: `NOT NULL actualizado_en`

- `existencia_creado_en_not_null`: `NOT NULL creado_en`

- `existencia_disponible_not_null`: `NOT NULL disponible`

- `existencia_id_check`: `CHECK ((id >= 0))`

- `existencia_id_not_null`: `NOT NULL id`

- `existencia_permite_sobreventa_check`: `CHECK ((permite_sobreventa = ANY (ARRAY[0, 1])))`

- `existencia_permite_sobreventa_not_null`: `NOT NULL permite_sobreventa`

- `existencia_pkey`: `PRIMARY KEY (id)`

- `existencia_producto_uid_not_null`: `NOT NULL producto_uid`

- `existencia_reservado_not_null`: `NOT NULL reservado`

- `existencia_sku_not_null`: `NOT NULL sku`

- `existencia_umbral_alerta_not_null`: `NOT NULL umbral_alerta`

- `existencia_variante_uid_not_null`: `NOT NULL variante_uid`

- `existencia_vendedor_uid_not_null`: `NOT NULL vendedor_uid`

- `existencia_version_check`: `CHECK ((version >= 0))`

- `existencia_version_not_null`: `NOT NULL version`

- `fk_unified_008`: `FOREIGN KEY (variante_uid) REFERENCES baney_catalog.variante(uid) DEFERRABLE`

- `fk_unified_009`: `FOREIGN KEY (producto_uid) REFERENCES baney_catalog.producto(uid) DEFERRABLE`

- `fk_unified_010`: `FOREIGN KEY (vendedor_uid) REFERENCES baney_catalog.vendedor(uid) DEFERRABLE`

- `uq_existencia_variante`: `UNIQUE (variante_uid)`


### Índices



- `CREATE UNIQUE INDEX existencia_pkey ON baney_inventory.existencia USING btree (id)`

- `CREATE INDEX ix_existencia_bajo ON baney_inventory.existencia USING btree (vendedor_uid, disponible)`

- `CREATE INDEX ix_existencia_vendedor ON baney_inventory.existencia USING btree (vendedor_uid)`

- `CREATE INDEX ix_fk_20948 ON baney_inventory.existencia USING btree (producto_uid)`

- `CREATE UNIQUE INDEX uq_existencia_variante ON baney_inventory.existencia USING btree (variante_uid)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('actualizado_en')`


## baney_inventory.movimiento_stock

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `existencia_id` | `bigint` | No | `` |

| `variante_uid` | `text` | No | `` |

| `vendedor_uid` | `text` | No | `` |

| `tipo` | `text` | No | `` |

| `cantidad_delta` | `integer` | No | `` |

| `saldo_despues` | `integer` | No | `` |

| `referencia_tipo` | `text` | No | `` |

| `referencia_uid` | `text` | Sí | `` |

| `motivo` | `character varying(300)` | Sí | `` |

| `actor_uid` | `text` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `ref_pedido` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'pedido'::text) THEN referencia_uid     ELSE NULL::text END` |

| `ref_suborden` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'suborden'::text) THEN referencia_uid     ELSE NULL::text END` |

| `ref_devolucion` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'devolucion'::text) THEN referencia_uid     ELSE NULL::text END` |

| `ref_reserva` | `text` | Sí | ` CASE     WHEN (referencia_tipo = 'reserva'::text) THEN referencia_uid     ELSE NULL::text END` |


### Restricciones



- `ck_mov_delta`: `CHECK ((cantidad_delta <> 0))`

- `ck_typed_reference`: `CHECK (((referencia_tipo <> ALL (ARRAY['pedido'::text, 'suborden'::text, 'devolucion'::text, 'reserva'::text])) OR (referencia_uid IS NOT NULL)))`

- `fk_mov_existencia`: `FOREIGN KEY (existencia_id) REFERENCES baney_inventory.existencia(id) ON DELETE RESTRICT`

- `fk_unified_012`: `FOREIGN KEY (variante_uid) REFERENCES baney_catalog.variante(uid) DEFERRABLE`

- `fk_unified_013`: `FOREIGN KEY (vendedor_uid) REFERENCES baney_catalog.vendedor(uid) DEFERRABLE`

- `fk_unified_014`: `FOREIGN KEY (actor_uid) REFERENCES identity.users(id) DEFERRABLE`

- `movimiento_stock_cantidad_delta_not_null`: `NOT NULL cantidad_delta`

- `movimiento_stock_creado_en_not_null`: `NOT NULL creado_en`

- `movimiento_stock_existencia_id_check`: `CHECK ((existencia_id >= 0))`

- `movimiento_stock_existencia_id_not_null`: `NOT NULL existencia_id`

- `movimiento_stock_id_check`: `CHECK ((id >= 0))`

- `movimiento_stock_id_not_null`: `NOT NULL id`

- `movimiento_stock_pkey`: `PRIMARY KEY (id)`

- `movimiento_stock_ref_devolucion_fkey`: `FOREIGN KEY (ref_devolucion) REFERENCES baney_order.devolucion(uid)`

- `movimiento_stock_ref_pedido_fkey`: `FOREIGN KEY (ref_pedido) REFERENCES baney_order.pedido(uid)`

- `movimiento_stock_ref_reserva_fkey`: `FOREIGN KEY (ref_reserva) REFERENCES baney_inventory.reserva(uid)`

- `movimiento_stock_ref_suborden_fkey`: `FOREIGN KEY (ref_suborden) REFERENCES baney_order.suborden(uid)`

- `movimiento_stock_referencia_tipo_check`: `CHECK ((referencia_tipo = ANY (ARRAY['pedido'::text, 'suborden'::text, 'devolucion'::text, 'reserva'::text, 'manual'::text, 'importacion'::text])))`

- `movimiento_stock_referencia_tipo_not_null`: `NOT NULL referencia_tipo`

- `movimiento_stock_saldo_despues_not_null`: `NOT NULL saldo_despues`

- `movimiento_stock_tipo_check`: `CHECK ((tipo = ANY (ARRAY['ingreso'::text, 'venta'::text, 'devolucion'::text, 'ajuste_positivo'::text, 'ajuste_negativo'::text, 'merma'::text, 'reserva'::text, 'liberacion_reserva'::text])))`

- `movimiento_stock_tipo_not_null`: `NOT NULL tipo`

- `movimiento_stock_uid_not_null`: `NOT NULL uid`

- `movimiento_stock_variante_uid_not_null`: `NOT NULL variante_uid`

- `movimiento_stock_vendedor_uid_not_null`: `NOT NULL vendedor_uid`

- `uq_mov_idempotente`: `UNIQUE (referencia_tipo, referencia_uid, variante_uid, tipo)`

- `uq_mov_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_fk_16970 ON baney_inventory.movimiento_stock USING btree (existencia_id)`

- `CREATE INDEX ix_fk_20973 ON baney_inventory.movimiento_stock USING btree (actor_uid)`

- `CREATE INDEX ix_fk_21287 ON baney_inventory.movimiento_stock USING btree (ref_pedido)`

- `CREATE INDEX ix_fk_21303 ON baney_inventory.movimiento_stock USING btree (ref_suborden)`

- `CREATE INDEX ix_fk_21319 ON baney_inventory.movimiento_stock USING btree (ref_devolucion)`

- `CREATE INDEX ix_fk_21335 ON baney_inventory.movimiento_stock USING btree (ref_reserva)`

- `CREATE INDEX ix_mov_variante ON baney_inventory.movimiento_stock USING btree (variante_uid, creado_en)`

- `CREATE INDEX ix_mov_vendedor ON baney_inventory.movimiento_stock USING btree (vendedor_uid, creado_en)`

- `CREATE UNIQUE INDEX movimiento_stock_pkey ON baney_inventory.movimiento_stock USING btree (id)`

- `CREATE UNIQUE INDEX uq_mov_idempotente ON baney_inventory.movimiento_stock USING btree (referencia_tipo, referencia_uid, variante_uid, tipo)`

- `CREATE UNIQUE INDEX uq_mov_uid ON baney_inventory.movimiento_stock USING btree (uid)`


## baney_inventory.outbox

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `agregado_tipo` | `character varying(60)` | No | `` |

| `agregado_uid` | `text` | No | `` |

| `tipo_evento` | `character varying(80)` | No | `` |

| `carga` | `jsonb` | No | `` |

| `estado` | `text` | No | `'pendiente'::text` |

| `intentos` | `integer` | No | `0` |

| `ultimo_error` | `character varying(500)` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `publicado_en` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `outbox_agregado_tipo_not_null`: `NOT NULL agregado_tipo`

- `outbox_agregado_uid_not_null`: `NOT NULL agregado_uid`

- `outbox_carga_not_null`: `NOT NULL carga`

- `outbox_creado_en_not_null`: `NOT NULL creado_en`

- `outbox_estado_check`: `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'publicado'::text, 'fallido'::text])))`

- `outbox_estado_not_null`: `NOT NULL estado`

- `outbox_id_check`: `CHECK ((id >= 0))`

- `outbox_id_not_null`: `NOT NULL id`

- `outbox_intentos_check`: `CHECK ((intentos >= 0))`

- `outbox_intentos_not_null`: `NOT NULL intentos`

- `outbox_pkey`: `PRIMARY KEY (id)`

- `outbox_tipo_evento_not_null`: `NOT NULL tipo_evento`

- `outbox_uid_not_null`: `NOT NULL uid`

- `uq_outbox_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_outbox_pendiente ON baney_inventory.outbox USING btree (estado, creado_en)`

- `CREATE UNIQUE INDEX outbox_pkey ON baney_inventory.outbox USING btree (id)`

- `CREATE UNIQUE INDEX uq_outbox_uid ON baney_inventory.outbox USING btree (uid)`


## baney_inventory.reserva

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `existencia_id` | `bigint` | No | `` |

| `variante_uid` | `text` | No | `` |

| `origen_tipo` | `text` | No | `` |

| `origen_uid` | `text` | No | `` |

| `cantidad` | `bigint` | No | `` |

| `estado` | `text` | No | `'activa'::text` |

| `expira_en` | `timestamp with time zone` | No | `` |

| `confirmada_en` | `timestamp with time zone` | Sí | `` |

| `liberada_en` | `timestamp with time zone` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `ref_carrito` | `text` | Sí | ` CASE     WHEN (origen_tipo = 'carrito'::text) THEN origen_uid     ELSE NULL::text END` |

| `ref_pedido` | `text` | Sí | ` CASE     WHEN (origen_tipo = 'pedido'::text) THEN origen_uid     ELSE NULL::text END` |


### Restricciones



- `ck_reserva_cantidad`: `CHECK ((cantidad > 0))`

- `ck_typed_reference`: `CHECK (((origen_tipo <> ALL (ARRAY['carrito'::text, 'pedido'::text])) OR (origen_uid IS NOT NULL)))`

- `fk_reserva_existencia`: `FOREIGN KEY (existencia_id) REFERENCES baney_inventory.existencia(id) ON DELETE RESTRICT`

- `fk_unified_011`: `FOREIGN KEY (variante_uid) REFERENCES baney_catalog.variante(uid) DEFERRABLE`

- `reserva_cantidad_check`: `CHECK ((cantidad >= 0))`

- `reserva_cantidad_not_null`: `NOT NULL cantidad`

- `reserva_creado_en_not_null`: `NOT NULL creado_en`

- `reserva_estado_check`: `CHECK ((estado = ANY (ARRAY['activa'::text, 'confirmada'::text, 'liberada'::text, 'expirada'::text])))`

- `reserva_estado_not_null`: `NOT NULL estado`

- `reserva_existencia_id_check`: `CHECK ((existencia_id >= 0))`

- `reserva_existencia_id_not_null`: `NOT NULL existencia_id`

- `reserva_expira_en_not_null`: `NOT NULL expira_en`

- `reserva_id_check`: `CHECK ((id >= 0))`

- `reserva_id_not_null`: `NOT NULL id`

- `reserva_origen_tipo_check`: `CHECK ((origen_tipo = ANY (ARRAY['carrito'::text, 'pedido'::text])))`

- `reserva_origen_tipo_not_null`: `NOT NULL origen_tipo`

- `reserva_origen_uid_not_null`: `NOT NULL origen_uid`

- `reserva_pkey`: `PRIMARY KEY (id)`

- `reserva_ref_carrito_fkey`: `FOREIGN KEY (ref_carrito) REFERENCES baney_cart.carrito(uid)`

- `reserva_ref_pedido_fkey`: `FOREIGN KEY (ref_pedido) REFERENCES baney_order.pedido(uid)`

- `reserva_uid_not_null`: `NOT NULL uid`

- `reserva_variante_uid_not_null`: `NOT NULL variante_uid`

- `uq_reserva_origen_variante`: `UNIQUE (origen_tipo, origen_uid, variante_uid)`

- `uq_reserva_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_fk_16935 ON baney_inventory.reserva USING btree (existencia_id)`

- `CREATE INDEX ix_fk_20958 ON baney_inventory.reserva USING btree (variante_uid)`

- `CREATE INDEX ix_fk_21254 ON baney_inventory.reserva USING btree (ref_carrito)`

- `CREATE INDEX ix_fk_21270 ON baney_inventory.reserva USING btree (ref_pedido)`

- `CREATE INDEX ix_reserva_origen ON baney_inventory.reserva USING btree (origen_uid)`

- `CREATE INDEX ix_reserva_vencidas ON baney_inventory.reserva USING btree (estado, expira_en)`

- `CREATE UNIQUE INDEX reserva_pkey ON baney_inventory.reserva USING btree (id)`

- `CREATE UNIQUE INDEX uq_reserva_origen_variante ON baney_inventory.reserva USING btree (origen_tipo, origen_uid, variante_uid)`

- `CREATE UNIQUE INDEX uq_reserva_uid ON baney_inventory.reserva USING btree (uid)`


## baney_order.cancelacion

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `pedido_id` | `bigint` | No | `` |

| `suborden_id` | `bigint` | Sí | `` |

| `solicitante_tipo` | `text` | No | `` |

| `solicitante_uid` | `text` | Sí | `` |

| `motivo` | `text` | No | `` |

| `descripcion` | `character varying(500)` | Sí | `` |

| `penalidad` | `numeric(14,2)` | No | `0` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `cancelacion_creado_en_not_null`: `NOT NULL creado_en`

- `cancelacion_id_check`: `CHECK ((id >= 0))`

- `cancelacion_id_not_null`: `NOT NULL id`

- `cancelacion_motivo_check`: `CHECK ((motivo = ANY (ARRAY['arrepentimiento'::text, 'sin_stock'::text, 'precio_erroneo'::text, 'no_acepta_a_tiempo'::text, 'fraude_sospechado'::text, 'pago_fallido'::text, 'otro'::text])))`

- `cancelacion_motivo_not_null`: `NOT NULL motivo`

- `cancelacion_pedido_id_check`: `CHECK ((pedido_id >= 0))`

- `cancelacion_pedido_id_not_null`: `NOT NULL pedido_id`

- `cancelacion_penalidad_not_null`: `NOT NULL penalidad`

- `cancelacion_pkey`: `PRIMARY KEY (id)`

- `cancelacion_solicitante_tipo_check`: `CHECK ((solicitante_tipo = ANY (ARRAY['comprador'::text, 'vendedor'::text, 'administrador'::text, 'sistema'::text])))`

- `cancelacion_solicitante_tipo_not_null`: `NOT NULL solicitante_tipo`

- `cancelacion_suborden_id_check`: `CHECK ((suborden_id >= 0))`

- `cancelacion_uid_not_null`: `NOT NULL uid`

- `fk_cancelacion_pedido`: `FOREIGN KEY (pedido_id) REFERENCES baney_order.pedido(id) ON DELETE CASCADE`

- `fk_cancelacion_suborden`: `FOREIGN KEY (suborden_id) REFERENCES baney_order.suborden(id) ON DELETE CASCADE`

- `fk_unified_042`: `FOREIGN KEY (solicitante_uid) REFERENCES identity.users(id) DEFERRABLE`

- `uq_cancelacion_uid`: `UNIQUE (uid)`


### Índices



- `CREATE UNIQUE INDEX cancelacion_pkey ON baney_order.cancelacion USING btree (id)`

- `CREATE INDEX ix_cancelacion_pedido ON baney_order.cancelacion USING btree (pedido_id)`

- `CREATE INDEX ix_fk_17592 ON baney_order.cancelacion USING btree (suborden_id)`

- `CREATE INDEX ix_fk_21113 ON baney_order.cancelacion USING btree (solicitante_uid)`

- `CREATE UNIQUE INDEX uq_cancelacion_uid ON baney_order.cancelacion USING btree (uid)`


## baney_order.devolucion

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `numero` | `character varying(24)` | No | `` |

| `suborden_id` | `bigint` | No | `` |

| `solicitante_uid` | `text` | No | `` |

| `motivo` | `text` | No | `` |

| `descripcion` | `text` | Sí | `` |

| `estado` | `text` | No | `'solicitada'::text` |

| `monto_solicitado` | `numeric(14,2)` | No | `` |

| `monto_aprobado` | `numeric(14,2)` | Sí | `` |

| `resuelta_por_uid` | `text` | Sí | `` |

| `resuelta_por_tipo` | `text` | Sí | `` |

| `motivo_resolucion` | `character varying(500)` | Sí | `` |

| `limite_respuesta` | `timestamp with time zone` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `resuelta_en` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `devolucion_creado_en_not_null`: `NOT NULL creado_en`

- `devolucion_estado_check`: `CHECK ((estado = ANY (ARRAY['solicitada'::text, 'aprobada'::text, 'rechazada'::text, 'en_transito'::text, 'recibida'::text, 'reembolsada'::text, 'cerrada'::text])))`

- `devolucion_estado_not_null`: `NOT NULL estado`

- `devolucion_id_check`: `CHECK ((id >= 0))`

- `devolucion_id_not_null`: `NOT NULL id`

- `devolucion_monto_solicitado_not_null`: `NOT NULL monto_solicitado`

- `devolucion_motivo_check`: `CHECK ((motivo = ANY (ARRAY['producto_danado'::text, 'producto_incorrecto'::text, 'faltante'::text, 'calidad'::text, 'no_corresponde_descripcion'::text, 'entrega_tardia'::text, 'otro'::text])))`

- `devolucion_motivo_not_null`: `NOT NULL motivo`

- `devolucion_numero_not_null`: `NOT NULL numero`

- `devolucion_pkey`: `PRIMARY KEY (id)`

- `devolucion_resuelta_por_tipo_check`: `CHECK ((resuelta_por_tipo = ANY (ARRAY['vendedor'::text, 'administrador'::text])))`

- `devolucion_solicitante_uid_not_null`: `NOT NULL solicitante_uid`

- `devolucion_suborden_id_check`: `CHECK ((suborden_id >= 0))`

- `devolucion_suborden_id_not_null`: `NOT NULL suborden_id`

- `devolucion_uid_not_null`: `NOT NULL uid`

- `fk_devolucion_suborden`: `FOREIGN KEY (suborden_id) REFERENCES baney_order.suborden(id) ON DELETE RESTRICT`

- `fk_unified_036`: `FOREIGN KEY (solicitante_uid) REFERENCES identity.users(id) DEFERRABLE`

- `fk_unified_037`: `FOREIGN KEY (resuelta_por_uid) REFERENCES identity.users(id) DEFERRABLE`

- `uq_devolucion_numero`: `UNIQUE (numero)`

- `uq_devolucion_uid`: `UNIQUE (uid)`


### Índices



- `CREATE UNIQUE INDEX devolucion_pkey ON baney_order.devolucion USING btree (id)`

- `CREATE INDEX ix_devolucion_estado ON baney_order.devolucion USING btree (estado, creado_en)`

- `CREATE INDEX ix_devolucion_suborden ON baney_order.devolucion USING btree (suborden_id)`

- `CREATE INDEX ix_fk_21083 ON baney_order.devolucion USING btree (solicitante_uid)`

- `CREATE INDEX ix_fk_21088 ON baney_order.devolucion USING btree (resuelta_por_uid)`

- `CREATE UNIQUE INDEX uq_devolucion_numero ON baney_order.devolucion USING btree (numero)`

- `CREATE UNIQUE INDEX uq_devolucion_uid ON baney_order.devolucion USING btree (uid)`


## baney_order.devolucion_evidencia

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `devolucion_id` | `bigint` | No | `` |

| `tipo` | `text` | No | `'foto'::text` |

| `url` | `character varying(500)` | No | `` |

| `subida_por_uid` | `text` | No | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `devolucion_evidencia_creado_en_not_null`: `NOT NULL creado_en`

- `devolucion_evidencia_devolucion_id_check`: `CHECK ((devolucion_id >= 0))`

- `devolucion_evidencia_devolucion_id_not_null`: `NOT NULL devolucion_id`

- `devolucion_evidencia_id_check`: `CHECK ((id >= 0))`

- `devolucion_evidencia_id_not_null`: `NOT NULL id`

- `devolucion_evidencia_pkey`: `PRIMARY KEY (id)`

- `devolucion_evidencia_subida_por_uid_not_null`: `NOT NULL subida_por_uid`

- `devolucion_evidencia_tipo_check`: `CHECK ((tipo = ANY (ARRAY['foto'::text, 'video'::text, 'documento'::text])))`

- `devolucion_evidencia_tipo_not_null`: `NOT NULL tipo`

- `devolucion_evidencia_url_not_null`: `NOT NULL url`

- `fk_evidencia_devolucion`: `FOREIGN KEY (devolucion_id) REFERENCES baney_order.devolucion(id) ON DELETE CASCADE`

- `fk_unified_038`: `FOREIGN KEY (subida_por_uid) REFERENCES identity.users(id) DEFERRABLE`


### Índices



- `CREATE UNIQUE INDEX devolucion_evidencia_pkey ON baney_order.devolucion_evidencia USING btree (id)`

- `CREATE INDEX ix_evidencia_devolucion ON baney_order.devolucion_evidencia USING btree (devolucion_id)`

- `CREATE INDEX ix_fk_21093 ON baney_order.devolucion_evidencia USING btree (subida_por_uid)`


## baney_order.devolucion_item

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `devolucion_id` | `bigint` | No | `` |

| `suborden_item_id` | `bigint` | No | `` |

| `cantidad` | `bigint` | No | `` |

| `monto` | `numeric(14,2)` | No | `` |


### Restricciones



- `ck_dev_item_cantidad`: `CHECK ((cantidad > 0))`

- `devolucion_item_cantidad_check`: `CHECK ((cantidad >= 0))`

- `devolucion_item_cantidad_not_null`: `NOT NULL cantidad`

- `devolucion_item_devolucion_id_check`: `CHECK ((devolucion_id >= 0))`

- `devolucion_item_devolucion_id_not_null`: `NOT NULL devolucion_id`

- `devolucion_item_id_check`: `CHECK ((id >= 0))`

- `devolucion_item_id_not_null`: `NOT NULL id`

- `devolucion_item_monto_not_null`: `NOT NULL monto`

- `devolucion_item_pkey`: `PRIMARY KEY (id)`

- `devolucion_item_suborden_item_id_check`: `CHECK ((suborden_item_id >= 0))`

- `devolucion_item_suborden_item_id_not_null`: `NOT NULL suborden_item_id`

- `fk_dev_item_devolucion`: `FOREIGN KEY (devolucion_id) REFERENCES baney_order.devolucion(id) ON DELETE CASCADE`

- `fk_dev_item_item`: `FOREIGN KEY (suborden_item_id) REFERENCES baney_order.suborden_item(id) ON DELETE RESTRICT`

- `uq_dev_item`: `UNIQUE (devolucion_id, suborden_item_id)`


### Índices



- `CREATE UNIQUE INDEX devolucion_item_pkey ON baney_order.devolucion_item USING btree (id)`

- `CREATE INDEX ix_dev_item_suborden ON baney_order.devolucion_item USING btree (suborden_item_id)`

- `CREATE UNIQUE INDEX uq_dev_item ON baney_order.devolucion_item USING btree (devolucion_id, suborden_item_id)`


## baney_order.disputa_referencia

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `disputa_uid` | `text` | No | `` |

| `pedido_id` | `bigint` | No | `` |

| `suborden_id` | `bigint` | Sí | `` |

| `abierta_por_tipo` | `text` | No | `` |

| `abierta_por_uid` | `text` | No | `` |

| `motivo` | `character varying(200)` | No | `` |

| `estado` | `text` | No | `'abierta'::text` |

| `resolucion` | `text` | Sí | `` |

| `monto_resuelto` | `numeric(14,2)` | Sí | `` |

| `resuelta_por_uid` | `text` | Sí | `` |

| `congela_payout` | `smallint` | No | `1` |

| `abierta_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `resuelta_en` | `timestamp with time zone` | Sí | `` |

| `actualizado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `disputa_referencia_abierta_en_not_null`: `NOT NULL abierta_en`

- `disputa_referencia_abierta_por_tipo_check`: `CHECK ((abierta_por_tipo = ANY (ARRAY['comprador'::text, 'vendedor'::text])))`

- `disputa_referencia_abierta_por_tipo_not_null`: `NOT NULL abierta_por_tipo`

- `disputa_referencia_abierta_por_uid_not_null`: `NOT NULL abierta_por_uid`

- `disputa_referencia_actualizado_en_not_null`: `NOT NULL actualizado_en`

- `disputa_referencia_congela_payout_check`: `CHECK ((congela_payout = ANY (ARRAY[0, 1])))`

- `disputa_referencia_congela_payout_not_null`: `NOT NULL congela_payout`

- `disputa_referencia_disputa_uid_not_null`: `NOT NULL disputa_uid`

- `disputa_referencia_estado_check`: `CHECK ((estado = ANY (ARRAY['abierta'::text, 'en_revision'::text, 'resuelta'::text, 'cerrada'::text, 'escalada'::text])))`

- `disputa_referencia_estado_not_null`: `NOT NULL estado`

- `disputa_referencia_id_check`: `CHECK ((id >= 0))`

- `disputa_referencia_id_not_null`: `NOT NULL id`

- `disputa_referencia_motivo_not_null`: `NOT NULL motivo`

- `disputa_referencia_pedido_id_check`: `CHECK ((pedido_id >= 0))`

- `disputa_referencia_pedido_id_not_null`: `NOT NULL pedido_id`

- `disputa_referencia_pkey`: `PRIMARY KEY (id)`

- `disputa_referencia_resolucion_check`: `CHECK ((resolucion = ANY (ARRAY['a_favor_comprador'::text, 'a_favor_vendedor'::text, 'parcial'::text, 'sin_lugar'::text])))`

- `disputa_referencia_suborden_id_check`: `CHECK ((suborden_id >= 0))`

- `disputa_referencia_uid_not_null`: `NOT NULL uid`

- `fk_disputa_pedido`: `FOREIGN KEY (pedido_id) REFERENCES baney_order.pedido(id) ON DELETE RESTRICT`

- `fk_disputa_suborden`: `FOREIGN KEY (suborden_id) REFERENCES baney_order.suborden(id) ON DELETE RESTRICT`

- `fk_unified_043`: `FOREIGN KEY (disputa_uid) REFERENCES support.disputes(id) DEFERRABLE`

- `fk_unified_044`: `FOREIGN KEY (abierta_por_uid) REFERENCES identity.users(id) DEFERRABLE`

- `fk_unified_045`: `FOREIGN KEY (resuelta_por_uid) REFERENCES identity.users(id) DEFERRABLE`

- `uq_disputa_externa`: `UNIQUE (disputa_uid)`

- `uq_disputa_uid`: `UNIQUE (uid)`


### Índices



- `CREATE UNIQUE INDEX disputa_referencia_pkey ON baney_order.disputa_referencia USING btree (id)`

- `CREATE INDEX ix_disputa_abiertas ON baney_order.disputa_referencia USING btree (estado, abierta_en)`

- `CREATE INDEX ix_disputa_pedido ON baney_order.disputa_referencia USING btree (pedido_id, estado)`

- `CREATE INDEX ix_disputa_suborden ON baney_order.disputa_referencia USING btree (suborden_id)`

- `CREATE INDEX ix_fk_21123 ON baney_order.disputa_referencia USING btree (abierta_por_uid)`

- `CREATE INDEX ix_fk_21128 ON baney_order.disputa_referencia USING btree (resuelta_por_uid)`

- `CREATE UNIQUE INDEX uq_disputa_externa ON baney_order.disputa_referencia USING btree (disputa_uid)`

- `CREATE UNIQUE INDEX uq_disputa_uid ON baney_order.disputa_referencia USING btree (uid)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('actualizado_en')`


## baney_order.inbox_procesado

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `mensaje_uid` | `text` | No | `` |

| `tipo_evento` | `character varying(80)` | No | `` |

| `procesado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `inbox_procesado_id_check`: `CHECK ((id >= 0))`

- `inbox_procesado_id_not_null`: `NOT NULL id`

- `inbox_procesado_mensaje_uid_not_null`: `NOT NULL mensaje_uid`

- `inbox_procesado_pkey`: `PRIMARY KEY (id)`

- `inbox_procesado_procesado_en_not_null`: `NOT NULL procesado_en`

- `inbox_procesado_tipo_evento_not_null`: `NOT NULL tipo_evento`

- `uq_inbox_mensaje`: `UNIQUE (mensaje_uid)`


### Índices



- `CREATE UNIQUE INDEX inbox_procesado_pkey ON baney_order.inbox_procesado USING btree (id)`

- `CREATE INDEX ix_inbox_limpieza ON baney_order.inbox_procesado USING btree (procesado_en)`

- `CREATE UNIQUE INDEX uq_inbox_mensaje ON baney_order.inbox_procesado USING btree (mensaje_uid)`


## baney_order.outbox

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `agregado_tipo` | `character varying(60)` | No | `` |

| `agregado_uid` | `text` | No | `` |

| `tipo_evento` | `character varying(80)` | No | `` |

| `carga` | `jsonb` | No | `` |

| `estado` | `text` | No | `'pendiente'::text` |

| `intentos` | `integer` | No | `0` |

| `ultimo_error` | `character varying(500)` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `publicado_en` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `outbox_agregado_tipo_not_null`: `NOT NULL agregado_tipo`

- `outbox_agregado_uid_not_null`: `NOT NULL agregado_uid`

- `outbox_carga_not_null`: `NOT NULL carga`

- `outbox_creado_en_not_null`: `NOT NULL creado_en`

- `outbox_estado_check`: `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'publicado'::text, 'fallido'::text])))`

- `outbox_estado_not_null`: `NOT NULL estado`

- `outbox_id_check`: `CHECK ((id >= 0))`

- `outbox_id_not_null`: `NOT NULL id`

- `outbox_intentos_check`: `CHECK ((intentos >= 0))`

- `outbox_intentos_not_null`: `NOT NULL intentos`

- `outbox_pkey`: `PRIMARY KEY (id)`

- `outbox_tipo_evento_not_null`: `NOT NULL tipo_evento`

- `outbox_uid_not_null`: `NOT NULL uid`

- `uq_outbox_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_outbox_pendiente ON baney_order.outbox USING btree (estado, creado_en)`

- `CREATE UNIQUE INDEX outbox_pkey ON baney_order.outbox USING btree (id)`

- `CREATE UNIQUE INDEX uq_outbox_uid ON baney_order.outbox USING btree (uid)`


## baney_order.pago_referencia

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `pedido_id` | `bigint` | No | `` |

| `payment_uid` | `text` | No | `` |

| `metodo` | `text` | No | `` |

| `marca_tarjeta` | `character varying(20)` | Sí | `` |

| `ultimos4` | `character(4)` | Sí | `` |

| `estado` | `text` | No | `'pendiente'::text` |

| `monto` | `numeric(14,2)` | No | `` |

| `monto_reembolsado` | `numeric(14,2)` | No | `0` |

| `moneda` | `character(3)` | No | `'DOP'::bpchar` |

| `pasarela` | `text` | Sí | `` |

| `referencia_pasarela` | `character varying(100)` | Sí | `` |

| `autorizado_en` | `timestamp with time zone` | Sí | `` |

| `capturado_en` | `timestamp with time zone` | Sí | `` |

| `actualizado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `fk_pago_pedido`: `FOREIGN KEY (pedido_id) REFERENCES baney_order.pedido(id) ON DELETE RESTRICT`

- `fk_unified_035`: `FOREIGN KEY (payment_uid) REFERENCES payments.payment_intents(id) DEFERRABLE`

- `pago_referencia_actualizado_en_not_null`: `NOT NULL actualizado_en`

- `pago_referencia_estado_check`: `CHECK ((estado = ANY (ARRAY['pendiente'::text, 'autorizado'::text, 'capturado'::text, 'rechazado'::text, 'reembolsado'::text, 'reembolsado_parcial'::text, 'cancelado'::text])))`

- `pago_referencia_estado_not_null`: `NOT NULL estado`

- `pago_referencia_id_check`: `CHECK ((id >= 0))`

- `pago_referencia_id_not_null`: `NOT NULL id`

- `pago_referencia_metodo_check`: `CHECK ((metodo = ANY (ARRAY['tarjeta'::text, 'transferencia'::text, 'efectivo_contra_entrega'::text, 'credito_empresa'::text])))`

- `pago_referencia_metodo_not_null`: `NOT NULL metodo`

- `pago_referencia_moneda_not_null`: `NOT NULL moneda`

- `pago_referencia_monto_not_null`: `NOT NULL monto`

- `pago_referencia_monto_reembolsado_not_null`: `NOT NULL monto_reembolsado`

- `pago_referencia_pasarela_check`: `CHECK ((pasarela = ANY (ARRAY['azul'::text, 'cardnet'::text, 'manual'::text])))`

- `pago_referencia_payment_uid_not_null`: `NOT NULL payment_uid`

- `pago_referencia_pedido_id_check`: `CHECK ((pedido_id >= 0))`

- `pago_referencia_pedido_id_not_null`: `NOT NULL pedido_id`

- `pago_referencia_pkey`: `PRIMARY KEY (id)`

- `uq_pago_uid`: `UNIQUE (payment_uid)`


### Índices



- `CREATE INDEX ix_pago_pedido ON baney_order.pago_referencia USING btree (pedido_id, estado)`

- `CREATE UNIQUE INDEX pago_referencia_pkey ON baney_order.pago_referencia USING btree (id)`

- `CREATE UNIQUE INDEX uq_pago_uid ON baney_order.pago_referencia USING btree (payment_uid)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('actualizado_en')`


## baney_order.pedido

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `numero` | `character varying(20)` | No | `` |

| `comprador_uid` | `text` | No | `` |

| `comprador_nombre` | `character varying(160)` | No | `` |

| `comprador_email` | `character varying(190)` | Sí | `` |

| `comprador_telefono` | `character varying(30)` | Sí | `` |

| `comprador_rnc` | `character varying(11)` | Sí | `` |

| `estado` | `text` | No | `'creado'::text` |

| `carrito_uid` | `text` | Sí | `` |

| `idempotency_key` | `character(36)` | No | `` |

| `subtotal` | `numeric(14,2)` | No | `0` |

| `descuento_total` | `numeric(14,2)` | No | `0` |

| `itbis_total` | `numeric(14,2)` | No | `0` |

| `transporte_total` | `numeric(14,2)` | No | `0` |

| `total` | `numeric(14,2)` | No | `0` |

| `moneda` | `character(3)` | No | `'DOP'::bpchar` |

| `cupon_codigo` | `character varying(40)` | Sí | `` |

| `direccion_envio` | `jsonb` | Sí | `` |

| `requiere_factura` | `smallint` | No | `0` |

| `nota_comprador` | `character varying(500)` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `pagado_en` | `timestamp with time zone` | Sí | `` |

| `completado_en` | `timestamp with time zone` | Sí | `` |

| `cancelado_en` | `timestamp with time zone` | Sí | `` |

| `actualizado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `ck_pedido_total`: `CHECK ((total >= (0)::numeric))`

- `fk_unified_028`: `FOREIGN KEY (comprador_uid) REFERENCES identity.users(id) DEFERRABLE`

- `fk_unified_029`: `FOREIGN KEY (carrito_uid) REFERENCES baney_cart.carrito(uid) DEFERRABLE`

- `pedido_actualizado_en_not_null`: `NOT NULL actualizado_en`

- `pedido_comprador_nombre_not_null`: `NOT NULL comprador_nombre`

- `pedido_comprador_uid_not_null`: `NOT NULL comprador_uid`

- `pedido_creado_en_not_null`: `NOT NULL creado_en`

- `pedido_descuento_total_not_null`: `NOT NULL descuento_total`

- `pedido_estado_check`: `CHECK ((estado = ANY (ARRAY['creado'::text, 'pago_pendiente'::text, 'pagado'::text, 'en_preparacion'::text, 'parcialmente_despachado'::text, 'despachado'::text, 'completado'::text, 'cancelado'::text, 'reembolsado'::text])))`

- `pedido_estado_not_null`: `NOT NULL estado`

- `pedido_id_check`: `CHECK ((id >= 0))`

- `pedido_id_not_null`: `NOT NULL id`

- `pedido_idempotency_key_not_null`: `NOT NULL idempotency_key`

- `pedido_itbis_total_not_null`: `NOT NULL itbis_total`

- `pedido_moneda_not_null`: `NOT NULL moneda`

- `pedido_numero_not_null`: `NOT NULL numero`

- `pedido_pkey`: `PRIMARY KEY (id)`

- `pedido_requiere_factura_check`: `CHECK ((requiere_factura = ANY (ARRAY[0, 1])))`

- `pedido_requiere_factura_not_null`: `NOT NULL requiere_factura`

- `pedido_subtotal_not_null`: `NOT NULL subtotal`

- `pedido_total_not_null`: `NOT NULL total`

- `pedido_transporte_total_not_null`: `NOT NULL transporte_total`

- `pedido_uid_not_null`: `NOT NULL uid`

- `uq_pedido_idem`: `UNIQUE (idempotency_key)`

- `uq_pedido_numero`: `UNIQUE (numero)`

- `uq_pedido_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_fk_21048 ON baney_order.pedido USING btree (carrito_uid)`

- `CREATE INDEX ix_pedido_comprador ON baney_order.pedido USING btree (comprador_uid, creado_en)`

- `CREATE INDEX ix_pedido_estado ON baney_order.pedido USING btree (estado, creado_en)`

- `CREATE UNIQUE INDEX pedido_pkey ON baney_order.pedido USING btree (id)`

- `CREATE UNIQUE INDEX uq_pedido_idem ON baney_order.pedido USING btree (idempotency_key)`

- `CREATE UNIQUE INDEX uq_pedido_numero ON baney_order.pedido USING btree (numero)`

- `CREATE UNIQUE INDEX uq_pedido_uid ON baney_order.pedido USING btree (uid)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('actualizado_en')`


## baney_order.pedido_evento

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `pedido_id` | `bigint` | No | `` |

| `suborden_id` | `bigint` | Sí | `` |

| `tipo` | `character varying(60)` | No | `` |

| `estado_anterior` | `character varying(40)` | Sí | `` |

| `estado_nuevo` | `character varying(40)` | Sí | `` |

| `actor_tipo` | `text` | No | `` |

| `actor_uid` | `text` | Sí | `` |

| `mensaje` | `character varying(300)` | Sí | `` |

| `visible_comprador` | `smallint` | No | `1` |

| `datos` | `jsonb` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `fk_evento_pedido`: `FOREIGN KEY (pedido_id) REFERENCES baney_order.pedido(id) ON DELETE CASCADE`

- `fk_evento_suborden`: `FOREIGN KEY (suborden_id) REFERENCES baney_order.suborden(id) ON DELETE CASCADE`

- `fk_unified_034`: `FOREIGN KEY (actor_uid) REFERENCES identity.users(id) DEFERRABLE`

- `pedido_evento_actor_tipo_check`: `CHECK ((actor_tipo = ANY (ARRAY['comprador'::text, 'vendedor'::text, 'administrador'::text, 'sistema'::text, 'transportista'::text])))`

- `pedido_evento_actor_tipo_not_null`: `NOT NULL actor_tipo`

- `pedido_evento_creado_en_not_null`: `NOT NULL creado_en`

- `pedido_evento_id_check`: `CHECK ((id >= 0))`

- `pedido_evento_id_not_null`: `NOT NULL id`

- `pedido_evento_pedido_id_check`: `CHECK ((pedido_id >= 0))`

- `pedido_evento_pedido_id_not_null`: `NOT NULL pedido_id`

- `pedido_evento_pkey`: `PRIMARY KEY (id)`

- `pedido_evento_suborden_id_check`: `CHECK ((suborden_id >= 0))`

- `pedido_evento_tipo_not_null`: `NOT NULL tipo`

- `pedido_evento_uid_not_null`: `NOT NULL uid`

- `pedido_evento_visible_comprador_check`: `CHECK ((visible_comprador = ANY (ARRAY[0, 1])))`

- `pedido_evento_visible_comprador_not_null`: `NOT NULL visible_comprador`

- `uq_evento_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_evento_pedido ON baney_order.pedido_evento USING btree (pedido_id, creado_en)`

- `CREATE INDEX ix_evento_suborden ON baney_order.pedido_evento USING btree (suborden_id, creado_en)`

- `CREATE INDEX ix_fk_21073 ON baney_order.pedido_evento USING btree (actor_uid)`

- `CREATE UNIQUE INDEX pedido_evento_pkey ON baney_order.pedido_evento USING btree (id)`

- `CREATE UNIQUE INDEX uq_evento_uid ON baney_order.pedido_evento USING btree (uid)`


## baney_order.solicitud_reembolso

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `pedido_id` | `bigint` | No | `` |

| `suborden_id` | `bigint` | Sí | `` |

| `devolucion_id` | `bigint` | Sí | `` |

| `origen` | `text` | No | `` |

| `monto` | `numeric(14,2)` | No | `` |

| `estado` | `text` | No | `'solicitado'::text` |

| `autorizado_por_uid` | `text` | Sí | `` |

| `autorizado_en` | `timestamp with time zone` | Sí | `` |

| `motivo_rechazo` | `character varying(500)` | Sí | `` |

| `payment_refund_uid` | `text` | Sí | `` |

| `nota_credito_uid` | `text` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `procesado_en` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `ck_reembolso_monto`: `CHECK ((monto > (0)::numeric))`

- `fk_reembolso_devolucion`: `FOREIGN KEY (devolucion_id) REFERENCES baney_order.devolucion(id) ON DELETE SET NULL`

- `fk_reembolso_pedido`: `FOREIGN KEY (pedido_id) REFERENCES baney_order.pedido(id) ON DELETE RESTRICT`

- `fk_reembolso_suborden`: `FOREIGN KEY (suborden_id) REFERENCES baney_order.suborden(id) ON DELETE RESTRICT`

- `fk_unified_039`: `FOREIGN KEY (autorizado_por_uid) REFERENCES identity.users(id) DEFERRABLE`

- `fk_unified_040`: `FOREIGN KEY (payment_refund_uid) REFERENCES payments.refunds(id) DEFERRABLE`

- `fk_unified_041`: `FOREIGN KEY (nota_credito_uid) REFERENCES baney_billing.factura(uid) DEFERRABLE`

- `solicitud_reembolso_creado_en_not_null`: `NOT NULL creado_en`

- `solicitud_reembolso_devolucion_id_check`: `CHECK ((devolucion_id >= 0))`

- `solicitud_reembolso_estado_check`: `CHECK ((estado = ANY (ARRAY['solicitado'::text, 'autorizado'::text, 'rechazado'::text, 'procesando'::text, 'procesado'::text, 'fallido'::text])))`

- `solicitud_reembolso_estado_not_null`: `NOT NULL estado`

- `solicitud_reembolso_id_check`: `CHECK ((id >= 0))`

- `solicitud_reembolso_id_not_null`: `NOT NULL id`

- `solicitud_reembolso_monto_not_null`: `NOT NULL monto`

- `solicitud_reembolso_origen_check`: `CHECK ((origen = ANY (ARRAY['devolucion'::text, 'cancelacion'::text, 'disputa'::text, 'ajuste_manual'::text, 'cobro_duplicado'::text])))`

- `solicitud_reembolso_origen_not_null`: `NOT NULL origen`

- `solicitud_reembolso_pedido_id_check`: `CHECK ((pedido_id >= 0))`

- `solicitud_reembolso_pedido_id_not_null`: `NOT NULL pedido_id`

- `solicitud_reembolso_pkey`: `PRIMARY KEY (id)`

- `solicitud_reembolso_suborden_id_check`: `CHECK ((suborden_id >= 0))`

- `solicitud_reembolso_uid_not_null`: `NOT NULL uid`

- `uq_reembolso_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_fk_17551 ON baney_order.solicitud_reembolso USING btree (suborden_id)`

- `CREATE INDEX ix_fk_17556 ON baney_order.solicitud_reembolso USING btree (devolucion_id)`

- `CREATE INDEX ix_fk_21098 ON baney_order.solicitud_reembolso USING btree (autorizado_por_uid)`

- `CREATE INDEX ix_fk_21103 ON baney_order.solicitud_reembolso USING btree (payment_refund_uid)`

- `CREATE INDEX ix_fk_21108 ON baney_order.solicitud_reembolso USING btree (nota_credito_uid)`

- `CREATE INDEX ix_reembolso_estado ON baney_order.solicitud_reembolso USING btree (estado, creado_en)`

- `CREATE INDEX ix_reembolso_pedido ON baney_order.solicitud_reembolso USING btree (pedido_id, estado)`

- `CREATE UNIQUE INDEX solicitud_reembolso_pkey ON baney_order.solicitud_reembolso USING btree (id)`

- `CREATE UNIQUE INDEX uq_reembolso_uid ON baney_order.solicitud_reembolso USING btree (uid)`


## baney_order.suborden

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `pedido_id` | `bigint` | No | `` |

| `numero` | `character varying(24)` | No | `` |

| `vendedor_uid` | `text` | No | `` |

| `vendedor_nombre` | `character varying(160)` | No | `` |

| `estado` | `text` | No | `'pendiente_aceptacion'::text` |

| `modalidad_entrega` | `text` | No | `'envio_baney'::text` |

| `subtotal` | `numeric(14,2)` | No | `0` |

| `descuento` | `numeric(14,2)` | No | `0` |

| `itbis` | `numeric(14,2)` | No | `0` |

| `transporte` | `numeric(14,2)` | No | `0` |

| `total` | `numeric(14,2)` | No | `0` |

| `trip_uid` | `uuid` | Sí | `` |

| `trip_estado` | `character varying(40)` | Sí | `` |

| `codigo_entrega` | `character(6)` | Sí | `` |

| `motivo_rechazo` | `character varying(500)` | Sí | `` |

| `aceptada_en` | `timestamp with time zone` | Sí | `` |

| `preparada_en` | `timestamp with time zone` | Sí | `` |

| `despachada_en` | `timestamp with time zone` | Sí | `` |

| `entregada_en` | `timestamp with time zone` | Sí | `` |

| `cancelada_en` | `timestamp with time zone` | Sí | `` |

| `limite_aceptacion` | `timestamp with time zone` | Sí | `` |

| `creado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |

| `actualizado_en` | `timestamp with time zone` | No | `CURRENT_TIMESTAMP(3)` |


### Restricciones



- `fk_suborden_pedido`: `FOREIGN KEY (pedido_id) REFERENCES baney_order.pedido(id) ON DELETE RESTRICT`

- `fk_unified_030`: `FOREIGN KEY (vendedor_uid) REFERENCES baney_catalog.vendedor(uid) DEFERRABLE`

- `fk_unified_031`: `FOREIGN KEY (trip_uid) REFERENCES transport.trips(id) DEFERRABLE`

- `suborden_actualizado_en_not_null`: `NOT NULL actualizado_en`

- `suborden_creado_en_not_null`: `NOT NULL creado_en`

- `suborden_descuento_not_null`: `NOT NULL descuento`

- `suborden_estado_check`: `CHECK ((estado = ANY (ARRAY['pendiente_aceptacion'::text, 'aceptada'::text, 'rechazada'::text, 'en_preparacion'::text, 'lista_despacho'::text, 'en_transito'::text, 'entregada'::text, 'cancelada'::text, 'devolucion_solicitada'::text, 'devuelta'::text])))`

- `suborden_estado_not_null`: `NOT NULL estado`

- `suborden_id_check`: `CHECK ((id >= 0))`

- `suborden_id_not_null`: `NOT NULL id`

- `suborden_itbis_not_null`: `NOT NULL itbis`

- `suborden_modalidad_entrega_check`: `CHECK ((modalidad_entrega = ANY (ARRAY['envio_baney'::text, 'retiro_local'::text, 'acuerdo_vendedor'::text])))`

- `suborden_modalidad_entrega_not_null`: `NOT NULL modalidad_entrega`

- `suborden_numero_not_null`: `NOT NULL numero`

- `suborden_pedido_id_check`: `CHECK ((pedido_id >= 0))`

- `suborden_pedido_id_not_null`: `NOT NULL pedido_id`

- `suborden_pkey`: `PRIMARY KEY (id)`

- `suborden_subtotal_not_null`: `NOT NULL subtotal`

- `suborden_total_not_null`: `NOT NULL total`

- `suborden_transporte_not_null`: `NOT NULL transporte`

- `suborden_uid_not_null`: `NOT NULL uid`

- `suborden_vendedor_nombre_not_null`: `NOT NULL vendedor_nombre`

- `suborden_vendedor_uid_not_null`: `NOT NULL vendedor_uid`

- `uq_suborden_numero`: `UNIQUE (numero)`

- `uq_suborden_pedido_vendedor`: `UNIQUE (pedido_id, vendedor_uid)`

- `uq_suborden_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_suborden_limite ON baney_order.suborden USING btree (estado, limite_aceptacion)`

- `CREATE INDEX ix_suborden_trip ON baney_order.suborden USING btree (trip_uid)`

- `CREATE INDEX ix_suborden_vendedor ON baney_order.suborden USING btree (vendedor_uid, estado, creado_en)`

- `CREATE UNIQUE INDEX suborden_pkey ON baney_order.suborden USING btree (id)`

- `CREATE UNIQUE INDEX uq_suborden_numero ON baney_order.suborden USING btree (numero)`

- `CREATE UNIQUE INDEX uq_suborden_pedido_vendedor ON baney_order.suborden USING btree (pedido_id, vendedor_uid)`

- `CREATE UNIQUE INDEX uq_suborden_uid ON baney_order.suborden USING btree (uid)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('actualizado_en')`


## baney_order.suborden_item

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `bigint` | No | `` |

| `uid` | `text` | No | `` |

| `suborden_id` | `bigint` | No | `` |

| `variante_uid` | `text` | No | `` |

| `producto_uid` | `text` | No | `` |

| `sku` | `character varying(64)` | No | `` |

| `nombre` | `character varying(200)` | No | `` |

| `variante_nombre` | `character varying(160)` | No | `` |

| `foto_url` | `character varying(500)` | Sí | `` |

| `unidad_medida` | `character varying(20)` | No | `` |

| `cantidad` | `bigint` | No | `` |

| `cantidad_despachada` | `bigint` | No | `0` |

| `cantidad_devuelta` | `bigint` | No | `0` |

| `precio_unitario` | `numeric(14,2)` | No | `` |

| `descuento_unitario` | `numeric(14,2)` | No | `0` |

| `regimen_itbis` | `text` | No | `'exento'::text` |

| `tasa_itbis` | `numeric(5,4)` | No | `0.0000` |

| `itbis_linea` | `numeric(14,2)` | No | `0` |

| `total_linea` | `numeric(14,2)` | No | `` |


### Restricciones



- `ck_dispatched_quantity`: `CHECK (((cantidad_despachada <= cantidad) AND (cantidad_devuelta <= cantidad_despachada)))`

- `ck_item_cantidad`: `CHECK ((cantidad > 0))`

- `ck_item_devuelta`: `CHECK ((cantidad_devuelta <= cantidad))`

- `fk_item_suborden`: `FOREIGN KEY (suborden_id) REFERENCES baney_order.suborden(id) ON DELETE CASCADE`

- `fk_unified_032`: `FOREIGN KEY (variante_uid) REFERENCES baney_catalog.variante(uid) DEFERRABLE`

- `fk_unified_033`: `FOREIGN KEY (producto_uid) REFERENCES baney_catalog.producto(uid) DEFERRABLE`

- `suborden_item_cantidad_check`: `CHECK ((cantidad >= 0))`

- `suborden_item_cantidad_despachada_check`: `CHECK ((cantidad_despachada >= 0))`

- `suborden_item_cantidad_despachada_not_null`: `NOT NULL cantidad_despachada`

- `suborden_item_cantidad_devuelta_check`: `CHECK ((cantidad_devuelta >= 0))`

- `suborden_item_cantidad_devuelta_not_null`: `NOT NULL cantidad_devuelta`

- `suborden_item_cantidad_not_null`: `NOT NULL cantidad`

- `suborden_item_descuento_unitario_not_null`: `NOT NULL descuento_unitario`

- `suborden_item_id_check`: `CHECK ((id >= 0))`

- `suborden_item_id_not_null`: `NOT NULL id`

- `suborden_item_itbis_linea_not_null`: `NOT NULL itbis_linea`

- `suborden_item_nombre_not_null`: `NOT NULL nombre`

- `suborden_item_pkey`: `PRIMARY KEY (id)`

- `suborden_item_precio_unitario_not_null`: `NOT NULL precio_unitario`

- `suborden_item_producto_uid_not_null`: `NOT NULL producto_uid`

- `suborden_item_regimen_itbis_check`: `CHECK ((regimen_itbis = ANY (ARRAY['exento'::text, 'gravado'::text, 'tasa_cero'::text])))`

- `suborden_item_regimen_itbis_not_null`: `NOT NULL regimen_itbis`

- `suborden_item_sku_not_null`: `NOT NULL sku`

- `suborden_item_suborden_id_check`: `CHECK ((suborden_id >= 0))`

- `suborden_item_suborden_id_not_null`: `NOT NULL suborden_id`

- `suborden_item_tasa_itbis_not_null`: `NOT NULL tasa_itbis`

- `suborden_item_total_linea_not_null`: `NOT NULL total_linea`

- `suborden_item_uid_not_null`: `NOT NULL uid`

- `suborden_item_unidad_medida_not_null`: `NOT NULL unidad_medida`

- `suborden_item_variante_nombre_not_null`: `NOT NULL variante_nombre`

- `suborden_item_variante_uid_not_null`: `NOT NULL variante_uid`

- `uq_item_uid`: `UNIQUE (uid)`


### Índices



- `CREATE INDEX ix_fk_21068 ON baney_order.suborden_item USING btree (producto_uid)`

- `CREATE INDEX ix_item_suborden ON baney_order.suborden_item USING btree (suborden_id)`

- `CREATE INDEX ix_item_variante ON baney_order.suborden_item USING btree (variante_uid)`

- `CREATE UNIQUE INDEX suborden_item_pkey ON baney_order.suborden_item USING btree (id)`

- `CREATE UNIQUE INDEX uq_item_uid ON baney_order.suborden_item USING btree (uid)`


## communications.attachments

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `message_id` | `uuid` | No | `` |

| `file_url` | `text` | No | `` |

| `mime_type` | `text` | No | `` |

| `bytes` | `bigint` | No | `` |

| `sha256` | `character(64)` | Sí | `` |


### Restricciones



- `attachments_bytes_check`: `CHECK ((bytes >= 0))`

- `attachments_bytes_not_null`: `NOT NULL bytes`

- `attachments_file_url_not_null`: `NOT NULL file_url`

- `attachments_id_not_null`: `NOT NULL id`

- `attachments_message_id_fkey`: `FOREIGN KEY (message_id) REFERENCES communications.messages(id)`

- `attachments_message_id_not_null`: `NOT NULL message_id`

- `attachments_mime_type_not_null`: `NOT NULL mime_type`

- `attachments_pkey`: `PRIMARY KEY (id)`


### Índices



- `CREATE UNIQUE INDEX attachments_pkey ON communications.attachments USING btree (id)`

- `CREATE INDEX ix_fk_20094 ON communications.attachments USING btree (message_id)`


## communications.conversations

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `request_id` | `uuid` | Sí | `` |

| `order_id` | `bigint` | Sí | `` |

| `subject` | `text` | Sí | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `conversations_created_at_not_null`: `NOT NULL created_at`

- `conversations_id_not_null`: `NOT NULL id`

- `conversations_order_id_fkey`: `FOREIGN KEY (order_id) REFERENCES baney_order.pedido(id)`

- `conversations_pkey`: `PRIMARY KEY (id)`

- `conversations_request_id_fkey`: `FOREIGN KEY (request_id) REFERENCES transport.transport_requests(id)`


### Índices



- `CREATE UNIQUE INDEX conversations_pkey ON communications.conversations USING btree (id)`

- `CREATE INDEX ix_fk_20030 ON communications.conversations USING btree (request_id)`

- `CREATE INDEX ix_fk_20035 ON communications.conversations USING btree (order_id)`


## communications.delivery_attempts

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `notification_id` | `uuid` | No | `` |

| `attempt` | `integer` | No | `` |

| `provider` | `text` | No | `` |

| `provider_reference` | `text` | Sí | `` |

| `status` | `text` | No | `` |

| `error` | `text` | Sí | `` |

| `attempted_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `delivery_attempts_attempt_check`: `CHECK ((attempt > 0))`

- `delivery_attempts_attempt_not_null`: `NOT NULL attempt`

- `delivery_attempts_attempted_at_not_null`: `NOT NULL attempted_at`

- `delivery_attempts_id_not_null`: `NOT NULL id`

- `delivery_attempts_notification_id_attempt_key`: `UNIQUE (notification_id, attempt)`

- `delivery_attempts_notification_id_fkey`: `FOREIGN KEY (notification_id) REFERENCES communications.notifications(id)`

- `delivery_attempts_notification_id_not_null`: `NOT NULL notification_id`

- `delivery_attempts_pkey`: `PRIMARY KEY (id)`

- `delivery_attempts_provider_not_null`: `NOT NULL provider`

- `delivery_attempts_status_check`: `CHECK ((status = ANY (ARRAY['SENT'::text, 'FAILED'::text])))`

- `delivery_attempts_status_not_null`: `NOT NULL status`


### Índices



- `CREATE UNIQUE INDEX delivery_attempts_notification_id_attempt_key ON communications.delivery_attempts USING btree (notification_id, attempt)`

- `CREATE UNIQUE INDEX delivery_attempts_pkey ON communications.delivery_attempts USING btree (id)`


## communications.messages

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `conversation_id` | `uuid` | No | `` |

| `sender_id` | `text` | No | `` |

| `body` | `text` | No | `` |

| `sent_at` | `timestamp with time zone` | No | `now()` |

| `edited_at` | `timestamp with time zone` | Sí | `` |

| `deleted_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `messages_body_not_null`: `NOT NULL body`

- `messages_conversation_id_not_null`: `NOT NULL conversation_id`

- `messages_conversation_id_sender_id_fkey`: `FOREIGN KEY (conversation_id, sender_id) REFERENCES communications.participants(conversation_id, user_id)`

- `messages_id_not_null`: `NOT NULL id`

- `messages_pkey`: `PRIMARY KEY (id)`

- `messages_sender_id_not_null`: `NOT NULL sender_id`

- `messages_sent_at_not_null`: `NOT NULL sent_at`


### Índices



- `CREATE INDEX ix_fk_20075 ON communications.messages USING btree (conversation_id, sender_id)`

- `CREATE UNIQUE INDEX messages_pkey ON communications.messages USING btree (id)`


## communications.notification_preferences

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `user_id` | `text` | No | `` |

| `channel` | `text` | No | `` |

| `topic` | `text` | No | `` |

| `enabled` | `boolean` | No | `true` |


### Restricciones



- `notification_preferences_channel_check`: `CHECK ((channel = ANY (ARRAY['EMAIL'::text, 'SMS'::text, 'PUSH'::text, 'IN_APP'::text])))`

- `notification_preferences_channel_not_null`: `NOT NULL channel`

- `notification_preferences_enabled_not_null`: `NOT NULL enabled`

- `notification_preferences_pkey`: `PRIMARY KEY (user_id, channel, topic)`

- `notification_preferences_topic_not_null`: `NOT NULL topic`

- `notification_preferences_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `notification_preferences_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE UNIQUE INDEX notification_preferences_pkey ON communications.notification_preferences USING btree (user_id, channel, topic)`


## communications.notification_templates

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `code` | `text` | No | `` |

| `channel` | `text` | No | `` |

| `locale` | `text` | No | `'es-DO'::text` |

| `subject` | `text` | Sí | `` |

| `body` | `text` | No | `` |

| `version` | `integer` | No | `` |


### Restricciones



- `notification_templates_body_not_null`: `NOT NULL body`

- `notification_templates_channel_check`: `CHECK ((channel = ANY (ARRAY['EMAIL'::text, 'SMS'::text, 'PUSH'::text, 'IN_APP'::text])))`

- `notification_templates_channel_not_null`: `NOT NULL channel`

- `notification_templates_code_channel_locale_version_key`: `UNIQUE (code, channel, locale, version)`

- `notification_templates_code_not_null`: `NOT NULL code`

- `notification_templates_id_not_null`: `NOT NULL id`

- `notification_templates_locale_not_null`: `NOT NULL locale`

- `notification_templates_pkey`: `PRIMARY KEY (id)`

- `notification_templates_version_check`: `CHECK ((version > 0))`

- `notification_templates_version_not_null`: `NOT NULL version`


### Índices



- `CREATE UNIQUE INDEX notification_templates_code_channel_locale_version_key ON communications.notification_templates USING btree (code, channel, locale, version)`

- `CREATE UNIQUE INDEX notification_templates_pkey ON communications.notification_templates USING btree (id)`


## communications.notifications

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `user_id` | `text` | No | `` |

| `template_id` | `uuid` | Sí | `` |

| `channel` | `text` | No | `` |

| `payload` | `jsonb` | No | `` |

| `status` | `text` | No | `'QUEUED'::text` |

| `idempotency_key` | `text` | No | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |

| `read_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `notifications_channel_check`: `CHECK ((channel = ANY (ARRAY['EMAIL'::text, 'SMS'::text, 'PUSH'::text, 'IN_APP'::text])))`

- `notifications_channel_not_null`: `NOT NULL channel`

- `notifications_created_at_not_null`: `NOT NULL created_at`

- `notifications_id_not_null`: `NOT NULL id`

- `notifications_idempotency_key_key`: `UNIQUE (idempotency_key)`

- `notifications_idempotency_key_not_null`: `NOT NULL idempotency_key`

- `notifications_payload_not_null`: `NOT NULL payload`

- `notifications_pkey`: `PRIMARY KEY (id)`

- `notifications_status_check`: `CHECK ((status = ANY (ARRAY['QUEUED'::text, 'SENT'::text, 'FAILED'::text, 'READ'::text])))`

- `notifications_status_not_null`: `NOT NULL status`

- `notifications_template_id_fkey`: `FOREIGN KEY (template_id) REFERENCES communications.notification_templates(id)`

- `notifications_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `notifications_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE INDEX ix_fk_19985 ON communications.notifications USING btree (user_id)`

- `CREATE INDEX ix_fk_19990 ON communications.notifications USING btree (template_id)`

- `CREATE UNIQUE INDEX notifications_idempotency_key_key ON communications.notifications USING btree (idempotency_key)`

- `CREATE UNIQUE INDEX notifications_pkey ON communications.notifications USING btree (id)`


## communications.participants

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `conversation_id` | `uuid` | No | `` |

| `user_id` | `text` | No | `` |

| `joined_at` | `timestamp with time zone` | No | `now()` |

| `left_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `participants_conversation_id_fkey`: `FOREIGN KEY (conversation_id) REFERENCES communications.conversations(id)`

- `participants_conversation_id_not_null`: `NOT NULL conversation_id`

- `participants_joined_at_not_null`: `NOT NULL joined_at`

- `participants_pkey`: `PRIMARY KEY (conversation_id, user_id)`

- `participants_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `participants_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE INDEX ix_fk_20056 ON communications.participants USING btree (user_id)`

- `CREATE UNIQUE INDEX participants_pkey ON communications.participants USING btree (conversation_id, user_id)`


## education.assessment_attempts

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `assessment_id` | `uuid` | No | `` |

| `enrollment_id` | `uuid` | No | `` |

| `course_id` | `uuid` | No | `` |

| `score` | `numeric(5,2)` | No | `` |

| `attempted_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `assessment_attempts_assessment_id_course_id_fkey`: `FOREIGN KEY (assessment_id, course_id) REFERENCES education.assessments(id, course_id)`

- `assessment_attempts_assessment_id_not_null`: `NOT NULL assessment_id`

- `assessment_attempts_attempted_at_not_null`: `NOT NULL attempted_at`

- `assessment_attempts_course_id_not_null`: `NOT NULL course_id`

- `assessment_attempts_enrollment_id_course_id_fkey`: `FOREIGN KEY (enrollment_id, course_id) REFERENCES education.enrollments(id, course_id)`

- `assessment_attempts_enrollment_id_not_null`: `NOT NULL enrollment_id`

- `assessment_attempts_id_not_null`: `NOT NULL id`

- `assessment_attempts_pkey`: `PRIMARY KEY (id)`

- `assessment_attempts_score_check`: `CHECK (((score >= (0)::numeric) AND (score <= (100)::numeric)))`

- `assessment_attempts_score_not_null`: `NOT NULL score`


### Índices



- `CREATE UNIQUE INDEX assessment_attempts_pkey ON education.assessment_attempts USING btree (id)`

- `CREATE INDEX ix_fk_20673 ON education.assessment_attempts USING btree (assessment_id, course_id)`

- `CREATE INDEX ix_fk_20678 ON education.assessment_attempts USING btree (enrollment_id, course_id)`


## education.assessments

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `course_id` | `uuid` | No | `` |

| `title` | `text` | No | `` |

| `pass_score` | `numeric(5,2)` | No | `` |


### Restricciones



- `assessments_course_id_fkey`: `FOREIGN KEY (course_id) REFERENCES education.courses(id)`

- `assessments_course_id_not_null`: `NOT NULL course_id`

- `assessments_id_course_id_key`: `UNIQUE (id, course_id)`

- `assessments_id_not_null`: `NOT NULL id`

- `assessments_pass_score_check`: `CHECK (((pass_score >= (0)::numeric) AND (pass_score <= (100)::numeric)))`

- `assessments_pass_score_not_null`: `NOT NULL pass_score`

- `assessments_pkey`: `PRIMARY KEY (id)`

- `assessments_title_not_null`: `NOT NULL title`


### Índices



- `CREATE UNIQUE INDEX assessments_id_course_id_key ON education.assessments USING btree (id, course_id)`

- `CREATE UNIQUE INDEX assessments_pkey ON education.assessments USING btree (id)`

- `CREATE INDEX ix_fk_20654 ON education.assessments USING btree (course_id)`


## education.certifications

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `enrollment_id` | `uuid` | No | `` |

| `certificate_number` | `text` | No | `` |

| `issued_at` | `timestamp with time zone` | No | `now()` |

| `expires_at` | `timestamp with time zone` | Sí | `` |

| `file_url` | `text` | Sí | `` |


### Restricciones



- `certifications_certificate_number_key`: `UNIQUE (certificate_number)`

- `certifications_certificate_number_not_null`: `NOT NULL certificate_number`

- `certifications_enrollment_id_fkey`: `FOREIGN KEY (enrollment_id) REFERENCES education.enrollments(id)`

- `certifications_enrollment_id_key`: `UNIQUE (enrollment_id)`

- `certifications_enrollment_id_not_null`: `NOT NULL enrollment_id`

- `certifications_id_not_null`: `NOT NULL id`

- `certifications_issued_at_not_null`: `NOT NULL issued_at`

- `certifications_pkey`: `PRIMARY KEY (id)`


### Índices



- `CREATE UNIQUE INDEX certifications_certificate_number_key ON education.certifications USING btree (certificate_number)`

- `CREATE UNIQUE INDEX certifications_enrollment_id_key ON education.certifications USING btree (enrollment_id)`

- `CREATE UNIQUE INDEX certifications_pkey ON education.certifications USING btree (id)`


## education.courses

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `title` | `text` | No | `` |

| `description` | `text` | Sí | `` |

| `instructor_id` | `text` | Sí | `` |

| `status` | `text` | No | `'DRAFT'::text` |


### Restricciones



- `courses_id_not_null`: `NOT NULL id`

- `courses_instructor_id_fkey`: `FOREIGN KEY (instructor_id) REFERENCES identity.users(id)`

- `courses_pkey`: `PRIMARY KEY (id)`

- `courses_status_check`: `CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'ARCHIVED'::text])))`

- `courses_status_not_null`: `NOT NULL status`

- `courses_title_not_null`: `NOT NULL title`


### Índices



- `CREATE UNIQUE INDEX courses_pkey ON education.courses USING btree (id)`

- `CREATE INDEX ix_fk_20586 ON education.courses USING btree (instructor_id)`


## education.enrollments

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `course_id` | `uuid` | No | `` |

| `user_id` | `text` | No | `` |

| `enrolled_at` | `timestamp with time zone` | No | `now()` |

| `completed_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `enrollments_course_id_fkey`: `FOREIGN KEY (course_id) REFERENCES education.courses(id)`

- `enrollments_course_id_not_null`: `NOT NULL course_id`

- `enrollments_course_id_user_id_key`: `UNIQUE (course_id, user_id)`

- `enrollments_enrolled_at_not_null`: `NOT NULL enrolled_at`

- `enrollments_id_course_id_key`: `UNIQUE (id, course_id)`

- `enrollments_id_not_null`: `NOT NULL id`

- `enrollments_pkey`: `PRIMARY KEY (id)`

- `enrollments_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `enrollments_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE UNIQUE INDEX enrollments_course_id_user_id_key ON education.enrollments USING btree (course_id, user_id)`

- `CREATE UNIQUE INDEX enrollments_id_course_id_key ON education.enrollments USING btree (id, course_id)`

- `CREATE UNIQUE INDEX enrollments_pkey ON education.enrollments USING btree (id)`

- `CREATE INDEX ix_fk_20634 ON education.enrollments USING btree (user_id)`


## education.lessons

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `course_id` | `uuid` | No | `` |

| `title` | `text` | No | `` |

| `position` | `integer` | No | `` |

| `content_url` | `text` | No | `` |


### Restricciones



- `lessons_content_url_not_null`: `NOT NULL content_url`

- `lessons_course_id_fkey`: `FOREIGN KEY (course_id) REFERENCES education.courses(id)`

- `lessons_course_id_not_null`: `NOT NULL course_id`

- `lessons_course_id_position_key`: `UNIQUE (course_id, "position")`

- `lessons_id_not_null`: `NOT NULL id`

- `lessons_pkey`: `PRIMARY KEY (id)`

- `lessons_position_check`: `CHECK (("position" > 0))`

- `lessons_position_not_null`: `NOT NULL "position"`

- `lessons_title_not_null`: `NOT NULL title`


### Índices



- `CREATE UNIQUE INDEX lessons_course_id_position_key ON education.lessons USING btree (course_id, "position")`

- `CREATE UNIQUE INDEX lessons_pkey ON education.lessons USING btree (id)`


## governance.access_logs

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `user_id` | `text` | Sí | `` |

| `resource` | `text` | No | `` |

| `action` | `text` | No | `` |

| `allowed` | `boolean` | No | `` |

| `ip` | `inet` | Sí | `` |

| `occurred_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `access_logs_action_not_null`: `NOT NULL action`

- `access_logs_allowed_not_null`: `NOT NULL allowed`

- `access_logs_id_not_null`: `NOT NULL id`

- `access_logs_occurred_at_not_null`: `NOT NULL occurred_at`

- `access_logs_pkey`: `PRIMARY KEY (id)`

- `access_logs_resource_not_null`: `NOT NULL resource`

- `access_logs_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`


### Índices



- `CREATE UNIQUE INDEX access_logs_pkey ON governance.access_logs USING btree (id)`

- `CREATE INDEX ix_fk_20444 ON governance.access_logs USING btree (user_id)`


## governance.audit_entries

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `actor_id` | `text` | Sí | `` |

| `action` | `text` | No | `` |

| `entity_type` | `text` | No | `` |

| `entity_id` | `text` | Sí | `` |

| `correlation_id` | `text` | Sí | `` |

| `details` | `jsonb` | No | `'{}'::jsonb` |

| `occurred_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `audit_entries_action_not_null`: `NOT NULL action`

- `audit_entries_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES identity.users(id)`

- `audit_entries_details_not_null`: `NOT NULL details`

- `audit_entries_entity_type_not_null`: `NOT NULL entity_type`

- `audit_entries_id_not_null`: `NOT NULL id`

- `audit_entries_occurred_at_not_null`: `NOT NULL occurred_at`

- `audit_entries_pkey`: `PRIMARY KEY (id)`


### Índices



- `CREATE UNIQUE INDEX audit_entries_pkey ON governance.audit_entries USING btree (id)`

- `CREATE INDEX ix_fk_20425 ON governance.audit_entries USING btree (actor_id)`


### Triggers



- `immutable_audit: EXECUTE FUNCTION reject_mutation()`


## governance.consents

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `user_id` | `text` | No | `` |

| `purpose` | `text` | No | `` |

| `policy_version` | `text` | No | `` |

| `granted_at` | `timestamp with time zone` | No | `now()` |

| `revoked_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `consents_check`: `CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at)))`

- `consents_granted_at_not_null`: `NOT NULL granted_at`

- `consents_id_not_null`: `NOT NULL id`

- `consents_pkey`: `PRIMARY KEY (id)`

- `consents_policy_version_not_null`: `NOT NULL policy_version`

- `consents_purpose_not_null`: `NOT NULL purpose`

- `consents_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `consents_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE UNIQUE INDEX consents_pkey ON governance.consents USING btree (id)`

- `CREATE INDEX ix_fk_20480 ON governance.consents USING btree (user_id)`


## governance.data_access_grants

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `subject_id` | `text` | No | `` |

| `grantee_id` | `text` | No | `` |

| `scope` | `text` | No | `` |

| `purpose` | `text` | No | `` |

| `expires_at` | `timestamp with time zone` | No | `` |

| `revoked_at` | `timestamp with time zone` | Sí | `` |

| `granted_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `data_access_grants_check`: `CHECK ((expires_at > granted_at))`

- `data_access_grants_expires_at_not_null`: `NOT NULL expires_at`

- `data_access_grants_granted_at_not_null`: `NOT NULL granted_at`

- `data_access_grants_grantee_id_fkey`: `FOREIGN KEY (grantee_id) REFERENCES identity.users(id)`

- `data_access_grants_grantee_id_not_null`: `NOT NULL grantee_id`

- `data_access_grants_id_not_null`: `NOT NULL id`

- `data_access_grants_pkey`: `PRIMARY KEY (id)`

- `data_access_grants_purpose_not_null`: `NOT NULL purpose`

- `data_access_grants_scope_not_null`: `NOT NULL scope`

- `data_access_grants_subject_id_fkey`: `FOREIGN KEY (subject_id) REFERENCES identity.users(id)`

- `data_access_grants_subject_id_not_null`: `NOT NULL subject_id`


### Índices



- `CREATE UNIQUE INDEX data_access_grants_pkey ON governance.data_access_grants USING btree (id)`

- `CREATE INDEX ix_fk_20544 ON governance.data_access_grants USING btree (subject_id)`

- `CREATE INDEX ix_fk_20549 ON governance.data_access_grants USING btree (grantee_id)`


## governance.data_changes

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `audit_entry_id` | `uuid` | No | `` |

| `field_name` | `text` | No | `` |

| `before_value` | `jsonb` | Sí | `` |

| `after_value` | `jsonb` | Sí | `` |


### Restricciones



- `data_changes_audit_entry_id_fkey`: `FOREIGN KEY (audit_entry_id) REFERENCES governance.audit_entries(id)`

- `data_changes_audit_entry_id_not_null`: `NOT NULL audit_entry_id`

- `data_changes_field_name_not_null`: `NOT NULL field_name`

- `data_changes_id_not_null`: `NOT NULL id`

- `data_changes_pkey`: `PRIMARY KEY (id)`


### Índices



- `CREATE UNIQUE INDEX data_changes_pkey ON governance.data_changes USING btree (id)`

- `CREATE INDEX ix_fk_20460 ON governance.data_changes USING btree (audit_entry_id)`


## governance.data_subject_requests

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `user_id` | `text` | No | `` |

| `type` | `text` | No | `` |

| `status` | `text` | No | `'OPEN'::text` |

| `requested_at` | `timestamp with time zone` | No | `now()` |

| `resolved_at` | `timestamp with time zone` | Sí | `` |

| `resolution` | `text` | Sí | `` |


### Restricciones



- `data_subject_requests_id_not_null`: `NOT NULL id`

- `data_subject_requests_pkey`: `PRIMARY KEY (id)`

- `data_subject_requests_requested_at_not_null`: `NOT NULL requested_at`

- `data_subject_requests_status_check`: `CHECK ((status = ANY (ARRAY['OPEN'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'REJECTED'::text])))`

- `data_subject_requests_status_not_null`: `NOT NULL status`

- `data_subject_requests_type_check`: `CHECK ((type = ANY (ARRAY['ACCESS'::text, 'EXPORT'::text, 'RECTIFY'::text, 'DELETE'::text, 'RESTRICT'::text])))`

- `data_subject_requests_type_not_null`: `NOT NULL type`

- `data_subject_requests_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `data_subject_requests_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE UNIQUE INDEX data_subject_requests_pkey ON governance.data_subject_requests USING btree (id)`

- `CREATE INDEX ix_fk_20502 ON governance.data_subject_requests USING btree (user_id)`


## governance.fraud_cases

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `assessment_id` | `uuid` | No | `` |

| `assigned_to` | `text` | Sí | `` |

| `status` | `text` | No | `` |

| `opened_at` | `timestamp with time zone` | No | `now()` |

| `closed_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `fraud_cases_assessment_id_fkey`: `FOREIGN KEY (assessment_id) REFERENCES governance.risk_assessments(id)`

- `fraud_cases_assessment_id_not_null`: `NOT NULL assessment_id`

- `fraud_cases_assigned_to_fkey`: `FOREIGN KEY (assigned_to) REFERENCES identity.users(id)`

- `fraud_cases_id_not_null`: `NOT NULL id`

- `fraud_cases_opened_at_not_null`: `NOT NULL opened_at`

- `fraud_cases_pkey`: `PRIMARY KEY (id)`

- `fraud_cases_status_check`: `CHECK ((status = ANY (ARRAY['OPEN'::text, 'INVESTIGATING'::text, 'CONFIRMED'::text, 'DISMISSED'::text])))`

- `fraud_cases_status_not_null`: `NOT NULL status`


### Índices



- `CREATE UNIQUE INDEX fraud_cases_pkey ON governance.fraud_cases USING btree (id)`

- `CREATE INDEX ix_fk_20370 ON governance.fraud_cases USING btree (assessment_id)`

- `CREATE INDEX ix_fk_20375 ON governance.fraud_cases USING btree (assigned_to)`


## governance.retention_policies

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `entity_type` | `text` | No | `` |

| `version` | `integer` | No | `` |

| `retention_days` | `integer` | No | `` |

| `action` | `text` | No | `` |

| `active` | `boolean` | No | `false` |


### Restricciones



- `retention_policies_action_check`: `CHECK ((action = ANY (ARRAY['DELETE'::text, 'ANONYMIZE'::text, 'ARCHIVE'::text])))`

- `retention_policies_action_not_null`: `NOT NULL action`

- `retention_policies_active_not_null`: `NOT NULL active`

- `retention_policies_entity_type_not_null`: `NOT NULL entity_type`

- `retention_policies_entity_type_version_key`: `UNIQUE (entity_type, version)`

- `retention_policies_id_not_null`: `NOT NULL id`

- `retention_policies_pkey`: `PRIMARY KEY (id)`

- `retention_policies_retention_days_check`: `CHECK ((retention_days > 0))`

- `retention_policies_retention_days_not_null`: `NOT NULL retention_days`

- `retention_policies_version_check`: `CHECK ((version > 0))`

- `retention_policies_version_not_null`: `NOT NULL version`


### Índices



- `CREATE UNIQUE INDEX retention_policies_entity_type_version_key ON governance.retention_policies USING btree (entity_type, version)`

- `CREATE UNIQUE INDEX retention_policies_pkey ON governance.retention_policies USING btree (id)`


## governance.risk_assessments

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `user_id` | `text` | No | `` |

| `payment_intent_id` | `text` | Sí | `` |

| `rule_id` | `uuid` | Sí | `` |

| `score` | `numeric(5,4)` | No | `` |

| `findings` | `jsonb` | No | `` |

| `assessed_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `risk_assessments_assessed_at_not_null`: `NOT NULL assessed_at`

- `risk_assessments_findings_not_null`: `NOT NULL findings`

- `risk_assessments_id_not_null`: `NOT NULL id`

- `risk_assessments_payment_intent_id_fkey`: `FOREIGN KEY (payment_intent_id) REFERENCES payments.payment_intents(id)`

- `risk_assessments_pkey`: `PRIMARY KEY (id)`

- `risk_assessments_rule_id_fkey`: `FOREIGN KEY (rule_id) REFERENCES governance.risk_rules(id)`

- `risk_assessments_score_check`: `CHECK (((score >= (0)::numeric) AND (score <= (1)::numeric)))`

- `risk_assessments_score_not_null`: `NOT NULL score`

- `risk_assessments_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `risk_assessments_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE INDEX ix_fk_20341 ON governance.risk_assessments USING btree (user_id)`

- `CREATE INDEX ix_fk_20346 ON governance.risk_assessments USING btree (payment_intent_id)`

- `CREATE INDEX ix_fk_20351 ON governance.risk_assessments USING btree (rule_id)`

- `CREATE UNIQUE INDEX risk_assessments_pkey ON governance.risk_assessments USING btree (id)`


## governance.risk_decisions

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `assessment_id` | `uuid` | No | `` |

| `fraud_case_id` | `uuid` | Sí | `` |

| `actor_id` | `text` | Sí | `` |

| `decision` | `text` | No | `` |

| `reason` | `text` | No | `` |

| `decided_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `risk_decisions_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES identity.users(id)`

- `risk_decisions_assessment_id_fkey`: `FOREIGN KEY (assessment_id) REFERENCES governance.risk_assessments(id)`

- `risk_decisions_assessment_id_not_null`: `NOT NULL assessment_id`

- `risk_decisions_decided_at_not_null`: `NOT NULL decided_at`

- `risk_decisions_decision_check`: `CHECK ((decision = ANY (ARRAY['ALLOW'::text, 'REVIEW'::text, 'BLOCK'::text])))`

- `risk_decisions_decision_not_null`: `NOT NULL decision`

- `risk_decisions_fraud_case_id_fkey`: `FOREIGN KEY (fraud_case_id) REFERENCES governance.fraud_cases(id)`

- `risk_decisions_id_not_null`: `NOT NULL id`

- `risk_decisions_pkey`: `PRIMARY KEY (id)`

- `risk_decisions_reason_not_null`: `NOT NULL reason`


### Índices



- `CREATE INDEX ix_fk_20395 ON governance.risk_decisions USING btree (assessment_id)`

- `CREATE INDEX ix_fk_20400 ON governance.risk_decisions USING btree (fraud_case_id)`

- `CREATE INDEX ix_fk_20405 ON governance.risk_decisions USING btree (actor_id)`

- `CREATE UNIQUE INDEX risk_decisions_pkey ON governance.risk_decisions USING btree (id)`


## governance.risk_rules

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `code` | `text` | No | `` |

| `version` | `integer` | No | `` |

| `definition` | `jsonb` | No | `` |

| `active` | `boolean` | No | `false` |


### Restricciones



- `risk_rules_active_not_null`: `NOT NULL active`

- `risk_rules_code_not_null`: `NOT NULL code`

- `risk_rules_code_version_key`: `UNIQUE (code, version)`

- `risk_rules_definition_not_null`: `NOT NULL definition`

- `risk_rules_id_not_null`: `NOT NULL id`

- `risk_rules_pkey`: `PRIMARY KEY (id)`

- `risk_rules_version_check`: `CHECK ((version > 0))`

- `risk_rules_version_not_null`: `NOT NULL version`


### Índices



- `CREATE UNIQUE INDEX risk_rules_code_version_key ON governance.risk_rules USING btree (code, version)`

- `CREATE UNIQUE INDEX risk_rules_pkey ON governance.risk_rules USING btree (id)`


## governance.taxpayers

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `rnc` | `text` | No | `` |

| `user_id` | `text` | Sí | `` |

| `legal_name` | `text` | No | `` |

| `verification_status` | `text` | No | `'PENDING'::text` |

| `verified_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `taxpayers_legal_name_not_null`: `NOT NULL legal_name`

- `taxpayers_pkey`: `PRIMARY KEY (rnc)`

- `taxpayers_rnc_not_null`: `NOT NULL rnc`

- `taxpayers_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `taxpayers_user_id_key`: `UNIQUE (user_id)`

- `taxpayers_verification_status_check`: `CHECK ((verification_status = ANY (ARRAY['PENDING'::text, 'VERIFIED'::text, 'REJECTED'::text])))`

- `taxpayers_verification_status_not_null`: `NOT NULL verification_status`


### Índices



- `CREATE UNIQUE INDEX taxpayers_pkey ON governance.taxpayers USING btree (rnc)`

- `CREATE UNIQUE INDEX taxpayers_user_id_key ON governance.taxpayers USING btree (user_id)`


## identity.credentials

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `user_id` | `text` | No | `` |

| `password_hash` | `text` | No | `` |

| `password_changed_at` | `timestamp with time zone` | No | `now()` |

| `must_change` | `boolean` | No | `false` |


### Restricciones



- `credentials_must_change_not_null`: `NOT NULL must_change`

- `credentials_password_changed_at_not_null`: `NOT NULL password_changed_at`

- `credentials_password_hash_not_null`: `NOT NULL password_hash`

- `credentials_pkey`: `PRIMARY KEY (user_id)`

- `credentials_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `credentials_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE UNIQUE INDEX credentials_pkey ON identity.credentials USING btree (user_id)`


## identity.email_verifications

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `user_id` | `text` | No | `` |

| `email` | `text` | No | `` |

| `token_hash` | `text` | No | `` |

| `expires_at` | `timestamp with time zone` | No | `` |

| `consumed_at` | `timestamp with time zone` | Sí | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `email_verifications_check`: `CHECK ((expires_at > created_at))`

- `email_verifications_created_at_not_null`: `NOT NULL created_at`

- `email_verifications_email_not_null`: `NOT NULL email`

- `email_verifications_expires_at_not_null`: `NOT NULL expires_at`

- `email_verifications_id_not_null`: `NOT NULL id`

- `email_verifications_pkey`: `PRIMARY KEY (id)`

- `email_verifications_token_hash_key`: `UNIQUE (token_hash)`

- `email_verifications_token_hash_not_null`: `NOT NULL token_hash`

- `email_verifications_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `email_verifications_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE UNIQUE INDEX email_verifications_pkey ON identity.email_verifications USING btree (id)`

- `CREATE UNIQUE INDEX email_verifications_token_hash_key ON identity.email_verifications USING btree (token_hash)`

- `CREATE INDEX ix_fk_19161 ON identity.email_verifications USING btree (user_id)`


## identity.oauth_identities

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `user_id` | `text` | No | `` |

| `provider` | `text` | No | `` |

| `provider_subject` | `text` | No | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `oauth_identities_created_at_not_null`: `NOT NULL created_at`

- `oauth_identities_id_not_null`: `NOT NULL id`

- `oauth_identities_pkey`: `PRIMARY KEY (id)`

- `oauth_identities_provider_not_null`: `NOT NULL provider`

- `oauth_identities_provider_provider_subject_key`: `UNIQUE (provider, provider_subject)`

- `oauth_identities_provider_subject_not_null`: `NOT NULL provider_subject`

- `oauth_identities_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `oauth_identities_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE INDEX ix_fk_19090 ON identity.oauth_identities USING btree (user_id)`

- `CREATE UNIQUE INDEX oauth_identities_pkey ON identity.oauth_identities USING btree (id)`

- `CREATE UNIQUE INDEX oauth_identities_provider_provider_subject_key ON identity.oauth_identities USING btree (provider, provider_subject)`


## identity.password_resets

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `user_id` | `text` | No | `` |

| `token_hash` | `text` | No | `` |

| `expires_at` | `timestamp with time zone` | No | `` |

| `consumed_at` | `timestamp with time zone` | Sí | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `password_resets_check`: `CHECK ((expires_at > created_at))`

- `password_resets_created_at_not_null`: `NOT NULL created_at`

- `password_resets_expires_at_not_null`: `NOT NULL expires_at`

- `password_resets_id_not_null`: `NOT NULL id`

- `password_resets_pkey`: `PRIMARY KEY (id)`

- `password_resets_token_hash_key`: `UNIQUE (token_hash)`

- `password_resets_token_hash_not_null`: `NOT NULL token_hash`

- `password_resets_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `password_resets_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE INDEX ix_fk_19183 ON identity.password_resets USING btree (user_id)`

- `CREATE UNIQUE INDEX password_resets_pkey ON identity.password_resets USING btree (id)`

- `CREATE UNIQUE INDEX password_resets_token_hash_key ON identity.password_resets USING btree (token_hash)`


## identity.permissions

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `code` | `text` | No | `` |

| `description` | `text` | No | `` |


### Restricciones



- `permissions_code_not_null`: `NOT NULL code`

- `permissions_description_not_null`: `NOT NULL description`

- `permissions_pkey`: `PRIMARY KEY (code)`


### Índices



- `CREATE UNIQUE INDEX permissions_pkey ON identity.permissions USING btree (code)`


## identity.recovery_codes

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `user_id` | `text` | No | `` |

| `code_hash` | `text` | No | `` |

| `used_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `recovery_codes_code_hash_key`: `UNIQUE (code_hash)`

- `recovery_codes_code_hash_not_null`: `NOT NULL code_hash`

- `recovery_codes_id_not_null`: `NOT NULL id`

- `recovery_codes_pkey`: `PRIMARY KEY (id)`

- `recovery_codes_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.two_factor_configurations(user_id)`

- `recovery_codes_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE INDEX ix_fk_19218 ON identity.recovery_codes USING btree (user_id)`

- `CREATE UNIQUE INDEX recovery_codes_code_hash_key ON identity.recovery_codes USING btree (code_hash)`

- `CREATE UNIQUE INDEX recovery_codes_pkey ON identity.recovery_codes USING btree (id)`


## identity.refresh_tokens

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `session_id` | `uuid` | No | `` |

| `token_hash` | `text` | No | `` |

| `parent_token_id` | `uuid` | Sí | `` |

| `expires_at` | `timestamp with time zone` | No | `` |

| `consumed_at` | `timestamp with time zone` | Sí | `` |

| `revoked_at` | `timestamp with time zone` | Sí | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `refresh_tokens_check`: `CHECK ((expires_at > created_at))`

- `refresh_tokens_created_at_not_null`: `NOT NULL created_at`

- `refresh_tokens_expires_at_not_null`: `NOT NULL expires_at`

- `refresh_tokens_id_not_null`: `NOT NULL id`

- `refresh_tokens_parent_token_id_fkey`: `FOREIGN KEY (parent_token_id) REFERENCES identity.refresh_tokens(id)`

- `refresh_tokens_parent_token_id_key`: `UNIQUE (parent_token_id)`

- `refresh_tokens_pkey`: `PRIMARY KEY (id)`

- `refresh_tokens_session_id_fkey`: `FOREIGN KEY (session_id) REFERENCES identity.sessions(id)`

- `refresh_tokens_session_id_not_null`: `NOT NULL session_id`

- `refresh_tokens_token_hash_key`: `UNIQUE (token_hash)`

- `refresh_tokens_token_hash_not_null`: `NOT NULL token_hash`


### Índices



- `CREATE INDEX ix_fk_19133 ON identity.refresh_tokens USING btree (session_id)`

- `CREATE UNIQUE INDEX refresh_tokens_parent_token_id_key ON identity.refresh_tokens USING btree (parent_token_id)`

- `CREATE UNIQUE INDEX refresh_tokens_pkey ON identity.refresh_tokens USING btree (id)`

- `CREATE UNIQUE INDEX refresh_tokens_token_hash_key ON identity.refresh_tokens USING btree (token_hash)`


## identity.role_assignments

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `user_id` | `text` | No | `` |

| `role_code` | `text` | No | `` |

| `granted_by` | `text` | Sí | `` |

| `granted_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `role_assignments_granted_at_not_null`: `NOT NULL granted_at`

- `role_assignments_granted_by_fkey`: `FOREIGN KEY (granted_by) REFERENCES identity.users(id)`

- `role_assignments_pkey`: `PRIMARY KEY (user_id, role_code)`

- `role_assignments_role_code_fkey`: `FOREIGN KEY (role_code) REFERENCES identity.roles(code)`

- `role_assignments_role_code_not_null`: `NOT NULL role_code`

- `role_assignments_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `role_assignments_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE INDEX ix_fk_19276 ON identity.role_assignments USING btree (role_code)`

- `CREATE INDEX ix_fk_19281 ON identity.role_assignments USING btree (granted_by)`

- `CREATE UNIQUE INDEX role_assignments_pkey ON identity.role_assignments USING btree (user_id, role_code)`


## identity.role_permissions

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `role_code` | `text` | No | `` |

| `permission_code` | `text` | No | `` |


### Restricciones



- `role_permissions_permission_code_fkey`: `FOREIGN KEY (permission_code) REFERENCES identity.permissions(code)`

- `role_permissions_permission_code_not_null`: `NOT NULL permission_code`

- `role_permissions_pkey`: `PRIMARY KEY (role_code, permission_code)`

- `role_permissions_role_code_fkey`: `FOREIGN KEY (role_code) REFERENCES identity.roles(code)`

- `role_permissions_role_code_not_null`: `NOT NULL role_code`


### Índices



- `CREATE INDEX ix_fk_19255 ON identity.role_permissions USING btree (permission_code)`

- `CREATE UNIQUE INDEX role_permissions_pkey ON identity.role_permissions USING btree (role_code, permission_code)`


## identity.roles

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `code` | `text` | No | `` |

| `description` | `text` | No | `` |


### Restricciones



- `roles_code_not_null`: `NOT NULL code`

- `roles_description_not_null`: `NOT NULL description`

- `roles_pkey`: `PRIMARY KEY (code)`


### Índices



- `CREATE UNIQUE INDEX roles_pkey ON identity.roles USING btree (code)`


## identity.sessions

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `user_id` | `text` | No | `` |

| `device_fingerprint_hash` | `text` | Sí | `` |

| `user_agent` | `text` | Sí | `` |

| `ip` | `inet` | Sí | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |

| `expires_at` | `timestamp with time zone` | No | `` |

| `revoked_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `sessions_check`: `CHECK ((expires_at > created_at))`

- `sessions_created_at_not_null`: `NOT NULL created_at`

- `sessions_expires_at_not_null`: `NOT NULL expires_at`

- `sessions_id_not_null`: `NOT NULL id`

- `sessions_pkey`: `PRIMARY KEY (id)`

- `sessions_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `sessions_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE INDEX ix_fk_19109 ON identity.sessions USING btree (user_id)`

- `CREATE UNIQUE INDEX sessions_pkey ON identity.sessions USING btree (id)`


## identity.two_factor_configurations

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `user_id` | `text` | No | `` |

| `secret_ciphertext` | `bytea` | No | `` |

| `key_version` | `text` | No | `` |

| `enabled_at` | `timestamp with time zone` | Sí | `` |

| `updated_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `two_factor_configurations_key_version_not_null`: `NOT NULL key_version`

- `two_factor_configurations_pkey`: `PRIMARY KEY (user_id)`

- `two_factor_configurations_secret_ciphertext_not_null`: `NOT NULL secret_ciphertext`

- `two_factor_configurations_updated_at_not_null`: `NOT NULL updated_at`

- `two_factor_configurations_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `two_factor_configurations_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE UNIQUE INDEX two_factor_configurations_pkey ON identity.two_factor_configurations USING btree (user_id)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('updated_at')`


## identity.users

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `text` | No | `(gen_random_uuid())::text` |

| `email` | `text` | No | `` |

| `status` | `text` | No | `'PENDING'::text` |

| `email_verified_at` | `timestamp with time zone` | Sí | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |

| `updated_at` | `timestamp with time zone` | No | `now()` |

| `deleted_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `users_created_at_not_null`: `NOT NULL created_at`

- `users_email_check`: `CHECK (((email = lower(btrim(email))) AND (POSITION(('@'::text) IN (email)) > 1)))`

- `users_email_key`: `UNIQUE (email)`

- `users_email_not_null`: `NOT NULL email`

- `users_id_check`: `CHECK ((length(btrim(id)) > 0))`

- `users_id_not_null`: `NOT NULL id`

- `users_pkey`: `PRIMARY KEY (id)`

- `users_status_check`: `CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'SUSPENDED'::text, 'DISABLED'::text])))`

- `users_status_not_null`: `NOT NULL status`

- `users_updated_at_not_null`: `NOT NULL updated_at`


### Índices



- `CREATE UNIQUE INDEX users_email_key ON identity.users USING btree (email)`

- `CREATE UNIQUE INDEX users_pkey ON identity.users USING btree (id)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('updated_at')`


## payments.payment_intents

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `text` | No | `(gen_random_uuid())::text` |

| `user_id` | `text` | No | `` |

| `order_id` | `bigint` | Sí | `` |

| `request_id` | `uuid` | Sí | `` |

| `payment_method_id` | `text` | Sí | `` |

| `amount` | `numeric(14,2)` | No | `` |

| `currency` | `character(3)` | No | `` |

| `status` | `text` | No | `'PENDING'::text` |

| `idempotency_key` | `text` | No | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `payment_intents_amount_check`: `CHECK ((amount > (0)::numeric))`

- `payment_intents_amount_not_null`: `NOT NULL amount`

- `payment_intents_check`: `CHECK ((num_nonnulls(order_id, request_id) = 1))`

- `payment_intents_created_at_not_null`: `NOT NULL created_at`

- `payment_intents_currency_check`: `CHECK ((currency ~ '^[A-Z]{3}$'::text))`

- `payment_intents_currency_not_null`: `NOT NULL currency`

- `payment_intents_id_not_null`: `NOT NULL id`

- `payment_intents_idempotency_key_key`: `UNIQUE (idempotency_key)`

- `payment_intents_idempotency_key_not_null`: `NOT NULL idempotency_key`

- `payment_intents_order_id_fkey`: `FOREIGN KEY (order_id) REFERENCES baney_order.pedido(id)`

- `payment_intents_payment_method_id_fkey`: `FOREIGN KEY (payment_method_id) REFERENCES payments.payment_methods(id)`

- `payment_intents_pkey`: `PRIMARY KEY (id)`

- `payment_intents_request_id_fkey`: `FOREIGN KEY (request_id) REFERENCES transport.transport_requests(id)`

- `payment_intents_status_check`: `CHECK ((status = ANY (ARRAY['PENDING'::text, 'AUTHORIZED'::text, 'CAPTURED'::text, 'FAILED'::text, 'CANCELLED'::text, 'REFUNDED'::text, 'PARTIALLY_REFUNDED'::text])))`

- `payment_intents_status_not_null`: `NOT NULL status`

- `payment_intents_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `payment_intents_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE INDEX ix_fk_19767 ON payments.payment_intents USING btree (user_id)`

- `CREATE INDEX ix_fk_19772 ON payments.payment_intents USING btree (order_id)`

- `CREATE INDEX ix_fk_19777 ON payments.payment_intents USING btree (request_id)`

- `CREATE INDEX ix_fk_19782 ON payments.payment_intents USING btree (payment_method_id)`

- `CREATE UNIQUE INDEX payment_intents_idempotency_key_key ON payments.payment_intents USING btree (idempotency_key)`

- `CREATE UNIQUE INDEX payment_intents_pkey ON payments.payment_intents USING btree (id)`


## payments.payment_methods

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `text` | No | `(gen_random_uuid())::text` |

| `user_id` | `text` | No | `` |

| `provider` | `text` | No | `` |

| `provider_token` | `text` | No | `` |

| `type` | `text` | No | `` |

| `last_four` | `character(4)` | Sí | `` |

| `active` | `boolean` | No | `true` |


### Restricciones



- `payment_methods_active_not_null`: `NOT NULL active`

- `payment_methods_id_not_null`: `NOT NULL id`

- `payment_methods_pkey`: `PRIMARY KEY (id)`

- `payment_methods_provider_not_null`: `NOT NULL provider`

- `payment_methods_provider_provider_token_key`: `UNIQUE (provider, provider_token)`

- `payment_methods_provider_token_not_null`: `NOT NULL provider_token`

- `payment_methods_type_not_null`: `NOT NULL type`

- `payment_methods_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `payment_methods_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE INDEX ix_fk_19739 ON payments.payment_methods USING btree (user_id)`

- `CREATE UNIQUE INDEX payment_methods_pkey ON payments.payment_methods USING btree (id)`

- `CREATE UNIQUE INDEX payment_methods_provider_provider_token_key ON payments.payment_methods USING btree (provider, provider_token)`


## payments.payment_transactions

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `text` | No | `(gen_random_uuid())::text` |

| `intent_id` | `text` | No | `` |

| `provider` | `text` | No | `` |

| `provider_reference` | `text` | No | `` |

| `type` | `text` | No | `` |

| `status` | `text` | No | `` |

| `amount` | `numeric(14,2)` | No | `` |

| `currency` | `character(3)` | No | `` |

| `occurred_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `payment_transactions_amount_check`: `CHECK ((amount > (0)::numeric))`

- `payment_transactions_amount_not_null`: `NOT NULL amount`

- `payment_transactions_currency_check`: `CHECK ((currency ~ '^[A-Z]{3}$'::text))`

- `payment_transactions_currency_not_null`: `NOT NULL currency`

- `payment_transactions_id_not_null`: `NOT NULL id`

- `payment_transactions_intent_id_fkey`: `FOREIGN KEY (intent_id) REFERENCES payments.payment_intents(id)`

- `payment_transactions_intent_id_not_null`: `NOT NULL intent_id`

- `payment_transactions_occurred_at_not_null`: `NOT NULL occurred_at`

- `payment_transactions_pkey`: `PRIMARY KEY (id)`

- `payment_transactions_provider_not_null`: `NOT NULL provider`

- `payment_transactions_provider_provider_reference_key`: `UNIQUE (provider, provider_reference)`

- `payment_transactions_provider_reference_not_null`: `NOT NULL provider_reference`

- `payment_transactions_status_check`: `CHECK ((status = ANY (ARRAY['PENDING'::text, 'SUCCEEDED'::text, 'FAILED'::text])))`

- `payment_transactions_status_not_null`: `NOT NULL status`

- `payment_transactions_type_check`: `CHECK ((type = ANY (ARRAY['AUTHORIZE'::text, 'CAPTURE'::text, 'VOID'::text, 'REFUND'::text])))`

- `payment_transactions_type_not_null`: `NOT NULL type`


### Índices



- `CREATE INDEX ix_fk_19811 ON payments.payment_transactions USING btree (intent_id)`

- `CREATE UNIQUE INDEX payment_transactions_pkey ON payments.payment_transactions USING btree (id)`

- `CREATE UNIQUE INDEX payment_transactions_provider_provider_reference_key ON payments.payment_transactions USING btree (provider, provider_reference)`


## payments.refunds

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `text` | No | `(gen_random_uuid())::text` |

| `intent_id` | `text` | No | `` |

| `transaction_id` | `text` | Sí | `` |

| `amount` | `numeric(14,2)` | No | `` |

| `reason` | `text` | No | `` |

| `status` | `text` | No | `'PENDING'::text` |

| `idempotency_key` | `text` | No | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `refunds_amount_check`: `CHECK ((amount > (0)::numeric))`

- `refunds_amount_not_null`: `NOT NULL amount`

- `refunds_created_at_not_null`: `NOT NULL created_at`

- `refunds_id_not_null`: `NOT NULL id`

- `refunds_idempotency_key_key`: `UNIQUE (idempotency_key)`

- `refunds_idempotency_key_not_null`: `NOT NULL idempotency_key`

- `refunds_intent_id_fkey`: `FOREIGN KEY (intent_id) REFERENCES payments.payment_intents(id)`

- `refunds_intent_id_not_null`: `NOT NULL intent_id`

- `refunds_pkey`: `PRIMARY KEY (id)`

- `refunds_reason_not_null`: `NOT NULL reason`

- `refunds_status_check`: `CHECK ((status = ANY (ARRAY['PENDING'::text, 'SUCCEEDED'::text, 'FAILED'::text])))`

- `refunds_status_not_null`: `NOT NULL status`

- `refunds_transaction_id_fkey`: `FOREIGN KEY (transaction_id) REFERENCES payments.payment_transactions(id)`

- `refunds_transaction_id_key`: `UNIQUE (transaction_id)`


### Índices



- `CREATE INDEX ix_fk_19839 ON payments.refunds USING btree (intent_id)`

- `CREATE UNIQUE INDEX refunds_idempotency_key_key ON payments.refunds USING btree (idempotency_key)`

- `CREATE UNIQUE INDEX refunds_pkey ON payments.refunds USING btree (id)`

- `CREATE UNIQUE INDEX refunds_transaction_id_key ON payments.refunds USING btree (transaction_id)`


## platform.admin_actions

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `actor_id` | `text` | No | `` |

| `audit_entry_id` | `uuid` | Sí | `` |

| `action` | `text` | No | `` |

| `reason` | `text` | No | `` |

| `occurred_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `admin_actions_action_not_null`: `NOT NULL action`

- `admin_actions_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES identity.users(id)`

- `admin_actions_actor_id_not_null`: `NOT NULL actor_id`

- `admin_actions_audit_entry_id_fkey`: `FOREIGN KEY (audit_entry_id) REFERENCES governance.audit_entries(id)`

- `admin_actions_id_not_null`: `NOT NULL id`

- `admin_actions_occurred_at_not_null`: `NOT NULL occurred_at`

- `admin_actions_pkey`: `PRIMARY KEY (id)`

- `admin_actions_reason_not_null`: `NOT NULL reason`


### Índices



- `CREATE UNIQUE INDEX admin_actions_pkey ON platform.admin_actions USING btree (id)`

- `CREATE INDEX ix_fk_20887 ON platform.admin_actions USING btree (actor_id)`

- `CREATE INDEX ix_fk_20892 ON platform.admin_actions USING btree (audit_entry_id)`


## platform.configuration_versions

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `configuration_key` | `text` | No | `` |

| `version` | `integer` | No | `` |

| `value` | `jsonb` | No | `` |

| `changed_by` | `text` | No | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `configuration_versions_changed_by_fkey`: `FOREIGN KEY (changed_by) REFERENCES identity.users(id)`

- `configuration_versions_changed_by_not_null`: `NOT NULL changed_by`

- `configuration_versions_configuration_key_fkey`: `FOREIGN KEY (configuration_key) REFERENCES configurations(key)`

- `configuration_versions_configuration_key_not_null`: `NOT NULL configuration_key`

- `configuration_versions_created_at_not_null`: `NOT NULL created_at`

- `configuration_versions_pkey`: `PRIMARY KEY (configuration_key, version)`

- `configuration_versions_value_not_null`: `NOT NULL value`

- `configuration_versions_version_check`: `CHECK ((version > 0))`

- `configuration_versions_version_not_null`: `NOT NULL version`


### Índices



- `CREATE UNIQUE INDEX configuration_versions_pkey ON platform.configuration_versions USING btree (configuration_key, version)`

- `CREATE INDEX ix_fk_20849 ON platform.configuration_versions USING btree (changed_by)`


## platform.configurations

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `key` | `text` | No | `` |

| `description` | `text` | No | `` |


### Restricciones



- `configurations_description_not_null`: `NOT NULL description`

- `configurations_key_not_null`: `NOT NULL key`

- `configurations_pkey`: `PRIMARY KEY (key)`


### Índices



- `CREATE UNIQUE INDEX configurations_pkey ON platform.configurations USING btree (key)`


## platform.feature_flags

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `key` | `text` | No | `` |

| `enabled` | `boolean` | No | `false` |

| `rules` | `jsonb` | No | `'{}'::jsonb` |

| `updated_by` | `text` | Sí | `` |

| `updated_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `feature_flags_enabled_not_null`: `NOT NULL enabled`

- `feature_flags_key_not_null`: `NOT NULL key`

- `feature_flags_pkey`: `PRIMARY KEY (key)`

- `feature_flags_rules_not_null`: `NOT NULL rules`

- `feature_flags_updated_at_not_null`: `NOT NULL updated_at`

- `feature_flags_updated_by_fkey`: `FOREIGN KEY (updated_by) REFERENCES identity.users(id)`


### Índices



- `CREATE UNIQUE INDEX feature_flags_pkey ON platform.feature_flags USING btree (key)`

- `CREATE INDEX ix_fk_20868 ON platform.feature_flags USING btree (updated_by)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('updated_at')`


## platform.schema_versions

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `version` | `text` | No | `` |

| `description` | `text` | No | `` |

| `applied_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `schema_versions_applied_at_not_null`: `NOT NULL applied_at`

- `schema_versions_description_not_null`: `NOT NULL description`

- `schema_versions_pkey`: `PRIMARY KEY (version)`

- `schema_versions_version_not_null`: `NOT NULL version`


### Índices



- `CREATE UNIQUE INDEX schema_versions_pkey ON platform.schema_versions USING btree (version)`


## profiles.account_activities

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `user_id` | `text` | No | `` |

| `activity_type` | `text` | No | `` |

| `description` | `text` | No | `` |

| `occurred_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `account_activities_activity_type_not_null`: `NOT NULL activity_type`

- `account_activities_description_not_null`: `NOT NULL description`

- `account_activities_id_not_null`: `NOT NULL id`

- `account_activities_occurred_at_not_null`: `NOT NULL occurred_at`

- `account_activities_pkey`: `PRIMARY KEY (id)`

- `account_activities_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `account_activities_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE UNIQUE INDEX account_activities_pkey ON profiles.account_activities USING btree (id)`

- `CREATE INDEX ix_fk_19421 ON profiles.account_activities USING btree (user_id)`


## profiles.account_status_changes

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `user_id` | `text` | No | `` |

| `actor_id` | `text` | Sí | `` |

| `previous_status` | `text` | No | `` |

| `new_status` | `text` | No | `` |

| `reason` | `text` | No | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `account_status_changes_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES identity.users(id)`

- `account_status_changes_created_at_not_null`: `NOT NULL created_at`

- `account_status_changes_id_not_null`: `NOT NULL id`

- `account_status_changes_new_status_not_null`: `NOT NULL new_status`

- `account_status_changes_pkey`: `PRIMARY KEY (id)`

- `account_status_changes_previous_status_not_null`: `NOT NULL previous_status`

- `account_status_changes_reason_not_null`: `NOT NULL reason`

- `account_status_changes_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `account_status_changes_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE UNIQUE INDEX account_status_changes_pkey ON profiles.account_status_changes USING btree (id)`

- `CREATE INDEX ix_fk_19397 ON profiles.account_status_changes USING btree (user_id)`

- `CREATE INDEX ix_fk_19402 ON profiles.account_status_changes USING btree (actor_id)`


## profiles.addresses

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `text` | No | `(gen_random_uuid())::text` |

| `user_id` | `text` | No | `` |

| `label` | `text` | No | `` |

| `address` | `text` | No | `` |

| `province` | `text` | Sí | `` |

| `municipality` | `text` | Sí | `` |

| `latitude` | `numeric(9,6)` | Sí | `` |

| `longitude` | `numeric(9,6)` | Sí | `` |

| `is_default` | `boolean` | No | `false` |

| `deleted_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `addresses_address_not_null`: `NOT NULL address`

- `addresses_check`: `CHECK (((latitude IS NULL) = (longitude IS NULL)))`

- `addresses_id_not_null`: `NOT NULL id`

- `addresses_is_default_not_null`: `NOT NULL is_default`

- `addresses_label_not_null`: `NOT NULL label`

- `addresses_latitude_check`: `CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)))`

- `addresses_longitude_check`: `CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))`

- `addresses_pkey`: `PRIMARY KEY (id)`

- `addresses_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `addresses_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE UNIQUE INDEX addresses_pkey ON profiles.addresses USING btree (id)`

- `CREATE INDEX ix_fk_19321 ON profiles.addresses USING btree (user_id)`

- `CREATE UNIQUE INDEX uq_default_address ON profiles.addresses USING btree (user_id) WHERE (is_default AND (deleted_at IS NULL))`


## profiles.contacts

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `user_id` | `text` | No | `` |

| `type` | `text` | No | `` |

| `value` | `text` | No | `` |

| `verified_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `contacts_id_not_null`: `NOT NULL id`

- `contacts_pkey`: `PRIMARY KEY (id)`

- `contacts_type_check`: `CHECK ((type = ANY (ARRAY['EMAIL'::text, 'PHONE'::text])))`

- `contacts_type_not_null`: `NOT NULL type`

- `contacts_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `contacts_user_id_not_null`: `NOT NULL user_id`

- `contacts_user_id_type_value_key`: `UNIQUE (user_id, type, value)`

- `contacts_value_not_null`: `NOT NULL value`


### Índices



- `CREATE UNIQUE INDEX contacts_pkey ON profiles.contacts USING btree (id)`

- `CREATE UNIQUE INDEX contacts_user_id_type_value_key ON profiles.contacts USING btree (user_id, type, value)`


## profiles.onboarding

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `user_id` | `text` | No | `` |

| `stage` | `text` | No | `` |

| `status` | `text` | No | `` |

| `completed_at` | `timestamp with time zone` | Sí | `` |

| `updated_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `onboarding_pkey`: `PRIMARY KEY (user_id)`

- `onboarding_stage_not_null`: `NOT NULL stage`

- `onboarding_status_check`: `CHECK ((status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'REJECTED'::text])))`

- `onboarding_status_not_null`: `NOT NULL status`

- `onboarding_updated_at_not_null`: `NOT NULL updated_at`

- `onboarding_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `onboarding_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE UNIQUE INDEX onboarding_pkey ON profiles.onboarding USING btree (user_id)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('updated_at')`


## profiles.preferences

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `user_id` | `text` | No | `` |

| `key` | `text` | No | `` |

| `value` | `jsonb` | No | `` |

| `updated_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `preferences_key_not_null`: `NOT NULL key`

- `preferences_pkey`: `PRIMARY KEY (user_id, key)`

- `preferences_updated_at_not_null`: `NOT NULL updated_at`

- `preferences_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `preferences_user_id_not_null`: `NOT NULL user_id`

- `preferences_value_not_null`: `NOT NULL value`


### Índices



- `CREATE UNIQUE INDEX preferences_pkey ON profiles.preferences USING btree (user_id, key)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('updated_at')`


## profiles.user_profiles

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `user_id` | `text` | No | `` |

| `display_name` | `text` | No | `` |

| `avatar_url` | `text` | Sí | `` |

| `bio` | `text` | Sí | `` |

| `metadata` | `jsonb` | No | `'{}'::jsonb` |

| `updated_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `user_profiles_display_name_not_null`: `NOT NULL display_name`

- `user_profiles_metadata_not_null`: `NOT NULL metadata`

- `user_profiles_pkey`: `PRIMARY KEY (user_id)`

- `user_profiles_updated_at_not_null`: `NOT NULL updated_at`

- `user_profiles_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`

- `user_profiles_user_id_not_null`: `NOT NULL user_id`


### Índices



- `CREATE UNIQUE INDEX user_profiles_pkey ON profiles.user_profiles USING btree (user_id)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('updated_at')`


## support.claims

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `dispute_id` | `text` | No | `` |

| `claimant_id` | `text` | No | `` |

| `description` | `text` | No | `` |

| `requested_amount` | `numeric(14,2)` | Sí | `` |

| `currency` | `character(3)` | Sí | `` |


### Restricciones



- `claims_check`: `CHECK (((requested_amount IS NULL) = (currency IS NULL)))`

- `claims_claimant_id_fkey`: `FOREIGN KEY (claimant_id) REFERENCES identity.users(id)`

- `claims_claimant_id_not_null`: `NOT NULL claimant_id`

- `claims_currency_check`: `CHECK ((currency ~ '^[A-Z]{3}$'::text))`

- `claims_description_not_null`: `NOT NULL description`

- `claims_dispute_id_fkey`: `FOREIGN KEY (dispute_id) REFERENCES support.disputes(id)`

- `claims_dispute_id_not_null`: `NOT NULL dispute_id`

- `claims_id_not_null`: `NOT NULL id`

- `claims_pkey`: `PRIMARY KEY (id)`

- `claims_requested_amount_check`: `CHECK ((requested_amount >= (0)::numeric))`


### Índices



- `CREATE UNIQUE INDEX claims_pkey ON support.claims USING btree (id)`

- `CREATE INDEX ix_fk_20146 ON support.claims USING btree (dispute_id)`

- `CREATE INDEX ix_fk_20151 ON support.claims USING btree (claimant_id)`


## support.disputes

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `text` | No | `(gen_random_uuid())::text` |

| `opened_by` | `text` | No | `` |

| `order_id` | `bigint` | Sí | `` |

| `request_id` | `uuid` | Sí | `` |

| `reason` | `text` | No | `` |

| `status` | `text` | No | `'OPEN'::text` |

| `created_at` | `timestamp with time zone` | No | `now()` |

| `closed_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `disputes_check`: `CHECK ((num_nonnulls(order_id, request_id) = 1))`

- `disputes_created_at_not_null`: `NOT NULL created_at`

- `disputes_id_not_null`: `NOT NULL id`

- `disputes_opened_by_fkey`: `FOREIGN KEY (opened_by) REFERENCES identity.users(id)`

- `disputes_opened_by_not_null`: `NOT NULL opened_by`

- `disputes_order_id_fkey`: `FOREIGN KEY (order_id) REFERENCES baney_order.pedido(id)`

- `disputes_pkey`: `PRIMARY KEY (id)`

- `disputes_reason_not_null`: `NOT NULL reason`

- `disputes_request_id_fkey`: `FOREIGN KEY (request_id) REFERENCES transport.transport_requests(id)`

- `disputes_status_check`: `CHECK ((status = ANY (ARRAY['OPEN'::text, 'IN_REVIEW'::text, 'RESOLVED'::text, 'CLOSED'::text, 'ESCALATED'::text])))`

- `disputes_status_not_null`: `NOT NULL status`


### Índices



- `CREATE UNIQUE INDEX disputes_pkey ON support.disputes USING btree (id)`

- `CREATE INDEX ix_fk_20116 ON support.disputes USING btree (opened_by)`

- `CREATE INDEX ix_fk_20121 ON support.disputes USING btree (order_id)`

- `CREATE INDEX ix_fk_20126 ON support.disputes USING btree (request_id)`


## support.evidence

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `dispute_id` | `text` | No | `` |

| `uploaded_by` | `text` | No | `` |

| `file_url` | `text` | No | `` |

| `description` | `text` | Sí | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `evidence_created_at_not_null`: `NOT NULL created_at`

- `evidence_dispute_id_fkey`: `FOREIGN KEY (dispute_id) REFERENCES support.disputes(id)`

- `evidence_dispute_id_not_null`: `NOT NULL dispute_id`

- `evidence_file_url_not_null`: `NOT NULL file_url`

- `evidence_id_not_null`: `NOT NULL id`

- `evidence_pkey`: `PRIMARY KEY (id)`

- `evidence_uploaded_by_fkey`: `FOREIGN KEY (uploaded_by) REFERENCES identity.users(id)`

- `evidence_uploaded_by_not_null`: `NOT NULL uploaded_by`


### Índices



- `CREATE UNIQUE INDEX evidence_pkey ON support.evidence USING btree (id)`

- `CREATE INDEX ix_fk_20170 ON support.evidence USING btree (dispute_id)`

- `CREATE INDEX ix_fk_20175 ON support.evidence USING btree (uploaded_by)`


## support.interactions

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `ticket_id` | `uuid` | No | `` |

| `author_id` | `text` | No | `` |

| `body` | `text` | No | `` |

| `internal` | `boolean` | No | `false` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `interactions_author_id_fkey`: `FOREIGN KEY (author_id) REFERENCES identity.users(id)`

- `interactions_author_id_not_null`: `NOT NULL author_id`

- `interactions_body_not_null`: `NOT NULL body`

- `interactions_created_at_not_null`: `NOT NULL created_at`

- `interactions_id_not_null`: `NOT NULL id`

- `interactions_internal_not_null`: `NOT NULL internal`

- `interactions_pkey`: `PRIMARY KEY (id)`

- `interactions_ticket_id_fkey`: `FOREIGN KEY (ticket_id) REFERENCES support.tickets(id)`

- `interactions_ticket_id_not_null`: `NOT NULL ticket_id`


### Índices



- `CREATE UNIQUE INDEX interactions_pkey ON support.interactions USING btree (id)`

- `CREATE INDEX ix_fk_20299 ON support.interactions USING btree (ticket_id)`

- `CREATE INDEX ix_fk_20304 ON support.interactions USING btree (author_id)`


## support.resolutions

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `dispute_id` | `text` | No | `` |

| `resolved_by` | `text` | No | `` |

| `decision` | `text` | No | `` |

| `reasoning` | `text` | No | `` |

| `refund_id` | `text` | Sí | `` |

| `resolved_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `resolutions_decision_not_null`: `NOT NULL decision`

- `resolutions_dispute_id_fkey`: `FOREIGN KEY (dispute_id) REFERENCES support.disputes(id)`

- `resolutions_dispute_id_key`: `UNIQUE (dispute_id)`

- `resolutions_dispute_id_not_null`: `NOT NULL dispute_id`

- `resolutions_id_not_null`: `NOT NULL id`

- `resolutions_pkey`: `PRIMARY KEY (id)`

- `resolutions_reasoning_not_null`: `NOT NULL reasoning`

- `resolutions_refund_id_fkey`: `FOREIGN KEY (refund_id) REFERENCES payments.refunds(id)`

- `resolutions_resolved_at_not_null`: `NOT NULL resolved_at`

- `resolutions_resolved_by_fkey`: `FOREIGN KEY (resolved_by) REFERENCES identity.users(id)`

- `resolutions_resolved_by_not_null`: `NOT NULL resolved_by`


### Índices



- `CREATE INDEX ix_fk_20202 ON support.resolutions USING btree (resolved_by)`

- `CREATE INDEX ix_fk_20207 ON support.resolutions USING btree (refund_id)`

- `CREATE UNIQUE INDEX resolutions_dispute_id_key ON support.resolutions USING btree (dispute_id)`

- `CREATE UNIQUE INDEX resolutions_pkey ON support.resolutions USING btree (id)`


## support.slas

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `name` | `text` | No | `` |

| `first_response_minutes` | `integer` | No | `` |

| `resolution_minutes` | `integer` | No | `` |


### Restricciones



- `slas_first_response_minutes_check`: `CHECK ((first_response_minutes > 0))`

- `slas_first_response_minutes_not_null`: `NOT NULL first_response_minutes`

- `slas_id_not_null`: `NOT NULL id`

- `slas_name_key`: `UNIQUE (name)`

- `slas_name_not_null`: `NOT NULL name`

- `slas_pkey`: `PRIMARY KEY (id)`

- `slas_resolution_minutes_check`: `CHECK ((resolution_minutes > 0))`

- `slas_resolution_minutes_not_null`: `NOT NULL resolution_minutes`


### Índices



- `CREATE UNIQUE INDEX slas_name_key ON support.slas USING btree (name)`

- `CREATE UNIQUE INDEX slas_pkey ON support.slas USING btree (id)`


## support.ticket_assignments

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `ticket_id` | `uuid` | No | `` |

| `agent_id` | `text` | No | `` |

| `assigned_at` | `timestamp with time zone` | No | `now()` |

| `released_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `ticket_assignments_agent_id_fkey`: `FOREIGN KEY (agent_id) REFERENCES identity.users(id)`

- `ticket_assignments_agent_id_not_null`: `NOT NULL agent_id`

- `ticket_assignments_assigned_at_not_null`: `NOT NULL assigned_at`

- `ticket_assignments_id_not_null`: `NOT NULL id`

- `ticket_assignments_pkey`: `PRIMARY KEY (id)`

- `ticket_assignments_ticket_id_fkey`: `FOREIGN KEY (ticket_id) REFERENCES support.tickets(id)`

- `ticket_assignments_ticket_id_not_null`: `NOT NULL ticket_id`


### Índices



- `CREATE INDEX ix_fk_20272 ON support.ticket_assignments USING btree (ticket_id)`

- `CREATE INDEX ix_fk_20277 ON support.ticket_assignments USING btree (agent_id)`

- `CREATE UNIQUE INDEX ticket_assignments_pkey ON support.ticket_assignments USING btree (id)`

- `CREATE UNIQUE INDEX uq_active_ticket_agent ON support.ticket_assignments USING btree (ticket_id) WHERE (released_at IS NULL)`


## support.tickets

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `requester_id` | `text` | No | `` |

| `dispute_id` | `text` | Sí | `` |

| `sla_id` | `uuid` | Sí | `` |

| `subject` | `text` | No | `` |

| `status` | `text` | No | `'OPEN'::text` |

| `created_at` | `timestamp with time zone` | No | `now()` |

| `due_at` | `timestamp with time zone` | Sí | `` |

| `closed_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `tickets_created_at_not_null`: `NOT NULL created_at`

- `tickets_dispute_id_fkey`: `FOREIGN KEY (dispute_id) REFERENCES support.disputes(id)`

- `tickets_id_not_null`: `NOT NULL id`

- `tickets_pkey`: `PRIMARY KEY (id)`

- `tickets_requester_id_fkey`: `FOREIGN KEY (requester_id) REFERENCES identity.users(id)`

- `tickets_requester_id_not_null`: `NOT NULL requester_id`

- `tickets_sla_id_fkey`: `FOREIGN KEY (sla_id) REFERENCES support.slas(id)`

- `tickets_status_check`: `CHECK ((status = ANY (ARRAY['OPEN'::text, 'ASSIGNED'::text, 'WAITING'::text, 'RESOLVED'::text, 'CLOSED'::text])))`

- `tickets_status_not_null`: `NOT NULL status`

- `tickets_subject_not_null`: `NOT NULL subject`


### Índices



- `CREATE INDEX ix_fk_20244 ON support.tickets USING btree (requester_id)`

- `CREATE INDEX ix_fk_20249 ON support.tickets USING btree (dispute_id)`

- `CREATE INDEX ix_fk_20254 ON support.tickets USING btree (sla_id)`

- `CREATE UNIQUE INDEX tickets_pkey ON support.tickets USING btree (id)`


## transport.assignments

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `request_id` | `uuid` | No | `` |

| `driver_profile_id` | `uuid` | No | `` |

| `vehicle_id` | `uuid` | No | `` |

| `status` | `transport.assignment_status` | No | `'ACTIVE'::transport.assignment_status` |

| `assigned_at` | `timestamp with time zone` | No | `now()` |

| `released_at` | `timestamp with time zone` | Sí | `` |

| `completed_at` | `timestamp with time zone` | Sí | `` |

| `deleted_at` | `timestamp with time zone` | Sí | `` |

| `accepted_offer_id` | `uuid` | Sí | `` |


### Restricciones



- `active_pointer_assignment`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`

- `assignments_accepted_offer_id_fkey`: `FOREIGN KEY (accepted_offer_id) REFERENCES transport.transport_offers(id)`

- `assignments_assigned_at_not_null`: `NOT NULL assigned_at`

- `assignments_driver_profile_id_fkey`: `FOREIGN KEY (driver_profile_id) REFERENCES transport.driver_profiles(id)`

- `assignments_driver_profile_id_not_null`: `NOT NULL driver_profile_id`

- `assignments_id_not_null`: `NOT NULL id`

- `assignments_pkey`: `PRIMARY KEY (id)`

- `assignments_request_id_fkey`: `FOREIGN KEY (request_id) REFERENCES transport.transport_requests(id)`

- `assignments_request_id_not_null`: `NOT NULL request_id`

- `assignments_status_not_null`: `NOT NULL status`

- `assignments_vehicle_id_fkey`: `FOREIGN KEY (vehicle_id) REFERENCES transport.vehicles(id)`

- `assignments_vehicle_id_not_null`: `NOT NULL vehicle_id`

- `uq_assignment_request`: `UNIQUE (id, request_id)`


### Índices



- `CREATE UNIQUE INDEX assignments_pkey ON transport.assignments USING btree (id)`

- `CREATE INDEX ix_fk_18851 ON transport.assignments USING btree (request_id)`

- `CREATE INDEX ix_fk_18856 ON transport.assignments USING btree (driver_profile_id)`

- `CREATE INDEX ix_fk_18861 ON transport.assignments USING btree (vehicle_id)`

- `CREATE INDEX ix_fk_21748 ON transport.assignments USING btree (accepted_offer_id)`

- `CREATE UNIQUE INDEX uq_active_assignment_per_request ON transport.assignments USING btree (request_id) WHERE ((status = 'ACTIVE'::transport.assignment_status) AND (deleted_at IS NULL))`

- `CREATE UNIQUE INDEX uq_assignment_request ON transport.assignments USING btree (id, request_id)`


### Triggers



- `active_pointer_assignment: EXECUTE FUNCTION transport.check_active_pointer()`

- `guard_assignment: EXECUTE FUNCTION transport.guard_assignment()`


## transport.dispatch_boards

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `name` | `text` | No | `` |

| `region` | `text` | Sí | `` |

| `manager_id` | `text` | Sí | `` |


### Restricciones



- `dispatch_boards_id_not_null`: `NOT NULL id`

- `dispatch_boards_manager_id_fkey`: `FOREIGN KEY (manager_id) REFERENCES identity.users(id)`

- `dispatch_boards_name_not_null`: `NOT NULL name`

- `dispatch_boards_pkey`: `PRIMARY KEY (id)`


### Índices



- `CREATE UNIQUE INDEX dispatch_boards_pkey ON transport.dispatch_boards USING btree (id)`

- `CREATE INDEX ix_fk_19491 ON transport.dispatch_boards USING btree (manager_id)`


## transport.dispatch_decisions

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `job_id` | `uuid` | No | `` |

| `assignment_id` | `uuid` | Sí | `` |

| `actor_id` | `text` | Sí | `` |

| `decision` | `text` | No | `` |

| `reason` | `text` | No | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `dispatch_decisions_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES identity.users(id)`

- `dispatch_decisions_assignment_id_fkey`: `FOREIGN KEY (assignment_id) REFERENCES transport.assignments(id)`

- `dispatch_decisions_created_at_not_null`: `NOT NULL created_at`

- `dispatch_decisions_decision_not_null`: `NOT NULL decision`

- `dispatch_decisions_id_not_null`: `NOT NULL id`

- `dispatch_decisions_job_id_fkey`: `FOREIGN KEY (job_id) REFERENCES transport.dispatch_jobs(id)`

- `dispatch_decisions_job_id_not_null`: `NOT NULL job_id`

- `dispatch_decisions_pkey`: `PRIMARY KEY (id)`

- `dispatch_decisions_reason_not_null`: `NOT NULL reason`


### Índices



- `CREATE UNIQUE INDEX dispatch_decisions_pkey ON transport.dispatch_decisions USING btree (id)`

- `CREATE INDEX ix_fk_19538 ON transport.dispatch_decisions USING btree (job_id)`

- `CREATE INDEX ix_fk_19543 ON transport.dispatch_decisions USING btree (assignment_id)`

- `CREATE INDEX ix_fk_19548 ON transport.dispatch_decisions USING btree (actor_id)`


## transport.dispatch_jobs

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `board_id` | `uuid` | No | `` |

| `request_id` | `uuid` | No | `` |

| `status` | `text` | No | `'QUEUED'::text` |

| `priority` | `integer` | No | `0` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `dispatch_jobs_board_id_fkey`: `FOREIGN KEY (board_id) REFERENCES transport.dispatch_boards(id)`

- `dispatch_jobs_board_id_not_null`: `NOT NULL board_id`

- `dispatch_jobs_created_at_not_null`: `NOT NULL created_at`

- `dispatch_jobs_id_not_null`: `NOT NULL id`

- `dispatch_jobs_pkey`: `PRIMARY KEY (id)`

- `dispatch_jobs_priority_not_null`: `NOT NULL priority`

- `dispatch_jobs_request_id_fkey`: `FOREIGN KEY (request_id) REFERENCES transport.transport_requests(id)`

- `dispatch_jobs_request_id_not_null`: `NOT NULL request_id`

- `dispatch_jobs_status_check`: `CHECK ((status = ANY (ARRAY['QUEUED'::text, 'ASSIGNED'::text, 'COMPLETED'::text, 'CANCELLED'::text])))`

- `dispatch_jobs_status_not_null`: `NOT NULL status`


### Índices



- `CREATE UNIQUE INDEX dispatch_jobs_pkey ON transport.dispatch_jobs USING btree (id)`

- `CREATE INDEX ix_fk_19514 ON transport.dispatch_jobs USING btree (board_id)`

- `CREATE INDEX ix_fk_19519 ON transport.dispatch_jobs USING btree (request_id)`


## transport.driver_availability

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `driver_profile_id` | `uuid` | No | `` |

| `vehicle_id` | `uuid` | Sí | `` |

| `starts_at` | `timestamp with time zone` | No | `` |

| `ends_at` | `timestamp with time zone` | No | `` |

| `status` | `text` | No | `` |


### Restricciones



- `driver_availability_check`: `CHECK ((ends_at > starts_at))`

- `driver_availability_driver_profile_id_fkey`: `FOREIGN KEY (driver_profile_id) REFERENCES transport.driver_profiles(id)`

- `driver_availability_driver_profile_id_not_null`: `NOT NULL driver_profile_id`

- `driver_availability_ends_at_not_null`: `NOT NULL ends_at`

- `driver_availability_id_not_null`: `NOT NULL id`

- `driver_availability_pkey`: `PRIMARY KEY (id)`

- `driver_availability_starts_at_not_null`: `NOT NULL starts_at`

- `driver_availability_status_check`: `CHECK ((status = ANY (ARRAY['AVAILABLE'::text, 'UNAVAILABLE'::text])))`

- `driver_availability_status_not_null`: `NOT NULL status`

- `driver_availability_vehicle_id_fkey`: `FOREIGN KEY (vehicle_id) REFERENCES transport.vehicles(id)`


### Índices



- `CREATE UNIQUE INDEX driver_availability_pkey ON transport.driver_availability USING btree (id)`

- `CREATE INDEX ix_fk_19471 ON transport.driver_availability USING btree (driver_profile_id)`

- `CREATE INDEX ix_fk_19476 ON transport.driver_availability USING btree (vehicle_id)`


## transport.driver_profiles

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `user_id` | `text` | No | `` |

| `status` | `transport.driver_status` | No | `'PENDING'::transport.driver_status` |

| `created_at` | `timestamp with time zone` | No | `now()` |

| `updated_at` | `timestamp with time zone` | No | `now()` |

| `deleted_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `driver_profiles_created_at_not_null`: `NOT NULL created_at`

- `driver_profiles_id_not_null`: `NOT NULL id`

- `driver_profiles_pkey`: `PRIMARY KEY (id)`

- `driver_profiles_status_not_null`: `NOT NULL status`

- `driver_profiles_updated_at_not_null`: `NOT NULL updated_at`

- `driver_profiles_user_id_key`: `UNIQUE (user_id)`

- `driver_profiles_user_id_not_null`: `NOT NULL user_id`

- `fk_unified_063`: `FOREIGN KEY (user_id) REFERENCES identity.users(id) DEFERRABLE`


### Índices



- `CREATE UNIQUE INDEX driver_profiles_pkey ON transport.driver_profiles USING btree (id)`

- `CREATE UNIQUE INDEX driver_profiles_user_id_key ON transport.driver_profiles USING btree (user_id)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('updated_at')`


## transport.eta_estimates

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `trip_id` | `uuid` | No | `` |

| `estimated_arrival_at` | `timestamp with time zone` | No | `` |

| `calculated_at` | `timestamp with time zone` | No | `now()` |

| `provider` | `text` | No | `` |


### Restricciones



- `eta_estimates_calculated_at_not_null`: `NOT NULL calculated_at`

- `eta_estimates_estimated_arrival_at_not_null`: `NOT NULL estimated_arrival_at`

- `eta_estimates_id_not_null`: `NOT NULL id`

- `eta_estimates_pkey`: `PRIMARY KEY (id)`

- `eta_estimates_provider_not_null`: `NOT NULL provider`

- `eta_estimates_trip_id_fkey`: `FOREIGN KEY (trip_id) REFERENCES transport.trips(id)`

- `eta_estimates_trip_id_not_null`: `NOT NULL trip_id`


### Índices



- `CREATE UNIQUE INDEX eta_estimates_pkey ON transport.eta_estimates USING btree (id)`

- `CREATE INDEX ix_fk_19606 ON transport.eta_estimates USING btree (trip_id)`


## transport.geofences

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `name` | `text` | No | `` |

| `center_id` | `uuid` | No | `` |

| `radius_meters` | `numeric(12,2)` | No | `` |

| `active` | `boolean` | No | `true` |


### Restricciones



- `geofences_active_not_null`: `NOT NULL active`

- `geofences_center_id_fkey`: `FOREIGN KEY (center_id) REFERENCES transport.map_locations(id)`

- `geofences_center_id_not_null`: `NOT NULL center_id`

- `geofences_id_not_null`: `NOT NULL id`

- `geofences_name_not_null`: `NOT NULL name`

- `geofences_pkey`: `PRIMARY KEY (id)`

- `geofences_radius_meters_check`: `CHECK ((radius_meters > (0)::numeric))`

- `geofences_radius_meters_not_null`: `NOT NULL radius_meters`


### Índices



- `CREATE UNIQUE INDEX geofences_pkey ON transport.geofences USING btree (id)`

- `CREATE INDEX ix_fk_19587 ON transport.geofences USING btree (center_id)`


## transport.map_locations

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `user_id` | `text` | Sí | `` |

| `label` | `text` | No | `` |

| `latitude` | `numeric(9,6)` | No | `` |

| `longitude` | `numeric(9,6)` | No | `` |


### Restricciones



- `map_locations_id_not_null`: `NOT NULL id`

- `map_locations_label_not_null`: `NOT NULL label`

- `map_locations_latitude_check`: `CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)))`

- `map_locations_latitude_not_null`: `NOT NULL latitude`

- `map_locations_longitude_check`: `CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))`

- `map_locations_longitude_not_null`: `NOT NULL longitude`

- `map_locations_pkey`: `PRIMARY KEY (id)`

- `map_locations_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES identity.users(id)`


### Índices



- `CREATE INDEX ix_fk_19567 ON transport.map_locations USING btree (user_id)`

- `CREATE UNIQUE INDEX map_locations_pkey ON transport.map_locations USING btree (id)`


## transport.matching_candidates

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `request_id` | `uuid` | No | `` |

| `driver_profile_id` | `uuid` | No | `` |

| `vehicle_id` | `uuid` | No | `` |

| `score` | `numeric(5,4)` | No | `` |

| `distance_km` | `numeric(12,3)` | Sí | `` |

| `expires_at` | `timestamp with time zone` | Sí | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `ck_candidate_distance`: `CHECK (((distance_km IS NULL) OR (distance_km >= (0)::numeric)))`

- `ck_candidate_score`: `CHECK (((score >= (0)::numeric) AND (score <= (1)::numeric)))`

- `matching_candidates_created_at_not_null`: `NOT NULL created_at`

- `matching_candidates_driver_profile_id_fkey`: `FOREIGN KEY (driver_profile_id) REFERENCES transport.driver_profiles(id)`

- `matching_candidates_driver_profile_id_not_null`: `NOT NULL driver_profile_id`

- `matching_candidates_id_not_null`: `NOT NULL id`

- `matching_candidates_pkey`: `PRIMARY KEY (id)`

- `matching_candidates_request_id_fkey`: `FOREIGN KEY (request_id) REFERENCES transport.transport_requests(id)`

- `matching_candidates_request_id_not_null`: `NOT NULL request_id`

- `matching_candidates_score_not_null`: `NOT NULL score`

- `matching_candidates_vehicle_id_fkey`: `FOREIGN KEY (vehicle_id) REFERENCES transport.vehicles(id)`

- `matching_candidates_vehicle_id_not_null`: `NOT NULL vehicle_id`


### Índices



- `CREATE INDEX ix_candidates_request_score ON transport.matching_candidates USING btree (request_id, score DESC)`

- `CREATE INDEX ix_fk_18781 ON transport.matching_candidates USING btree (driver_profile_id)`

- `CREATE INDEX ix_fk_18786 ON transport.matching_candidates USING btree (vehicle_id)`

- `CREATE UNIQUE INDEX matching_candidates_pkey ON transport.matching_candidates USING btree (id)`

- `CREATE UNIQUE INDEX uq_matching_candidate_per_vehicle ON transport.matching_candidates USING btree (request_id, vehicle_id)`


## transport.outbox_events

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `event_id` | `uuid` | No | `gen_random_uuid()` |

| `aggregate_type` | `text` | No | `` |

| `aggregate_id` | `text` | No | `` |

| `event_type` | `text` | No | `` |

| `aggregate_version` | `integer` | No | `` |

| `correlation_id` | `text` | No | `` |

| `schema_version` | `integer` | No | `1` |

| `payload` | `jsonb` | No | `` |

| `occurred_at` | `timestamp with time zone` | No | `now()` |

| `published_at` | `timestamp with time zone` | Sí | `` |

| `attempts` | `integer` | No | `0` |


### Restricciones



- `ck_outbox_attempts`: `CHECK ((attempts >= 0))`

- `ck_outbox_versions`: `CHECK (((aggregate_version > 0) AND (schema_version > 0)))`

- `outbox_events_aggregate_id_not_null`: `NOT NULL aggregate_id`

- `outbox_events_aggregate_type_not_null`: `NOT NULL aggregate_type`

- `outbox_events_aggregate_version_not_null`: `NOT NULL aggregate_version`

- `outbox_events_attempts_not_null`: `NOT NULL attempts`

- `outbox_events_correlation_id_not_null`: `NOT NULL correlation_id`

- `outbox_events_event_id_not_null`: `NOT NULL event_id`

- `outbox_events_event_type_not_null`: `NOT NULL event_type`

- `outbox_events_occurred_at_not_null`: `NOT NULL occurred_at`

- `outbox_events_payload_not_null`: `NOT NULL payload`

- `outbox_events_pkey`: `PRIMARY KEY (event_id)`

- `outbox_events_schema_version_not_null`: `NOT NULL schema_version`

- `uq_outbox_aggregate_version`: `UNIQUE (aggregate_type, aggregate_id, aggregate_version)`


### Índices



- `CREATE INDEX ix_outbox_pending ON transport.outbox_events USING btree (published_at, occurred_at) WHERE (published_at IS NULL)`

- `CREATE UNIQUE INDEX outbox_events_pkey ON transport.outbox_events USING btree (event_id)`

- `CREATE UNIQUE INDEX uq_outbox_aggregate_version ON transport.outbox_events USING btree (aggregate_type, aggregate_id, aggregate_version)`


## transport.pricing_rules

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `name` | `text` | No | `` |

| `base_amount` | `numeric(14,2)` | No | `` |

| `price_per_km` | `numeric(14,2)` | No | `` |

| `currency` | `character(3)` | No | `` |

| `active` | `boolean` | No | `false` |

| `effective_from` | `timestamp with time zone` | No | `` |

| `effective_until` | `timestamp with time zone` | Sí | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `ck_pricing_amounts`: `CHECK (((base_amount >= (0)::numeric) AND (price_per_km >= (0)::numeric)))`

- `ck_pricing_currency`: `CHECK ((currency ~ '^[A-Z]{3}$'::text))`

- `ck_pricing_period`: `CHECK (((effective_until IS NULL) OR (effective_from < effective_until)))`

- `pricing_rules_active_not_null`: `NOT NULL active`

- `pricing_rules_base_amount_not_null`: `NOT NULL base_amount`

- `pricing_rules_created_at_not_null`: `NOT NULL created_at`

- `pricing_rules_currency_not_null`: `NOT NULL currency`

- `pricing_rules_effective_from_not_null`: `NOT NULL effective_from`

- `pricing_rules_id_not_null`: `NOT NULL id`

- `pricing_rules_name_not_null`: `NOT NULL name`

- `pricing_rules_pkey`: `PRIMARY KEY (id)`

- `pricing_rules_price_per_km_not_null`: `NOT NULL price_per_km`


### Índices



- `CREATE UNIQUE INDEX pricing_rules_pkey ON transport.pricing_rules USING btree (id)`


## transport.processed_events

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `consumer` | `text` | No | `` |

| `event_id` | `uuid` | No | `` |

| `processed_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `processed_events_consumer_not_null`: `NOT NULL consumer`

- `processed_events_event_id_not_null`: `NOT NULL event_id`

- `processed_events_pkey`: `PRIMARY KEY (consumer, event_id)`

- `processed_events_processed_at_not_null`: `NOT NULL processed_at`


### Índices



- `CREATE UNIQUE INDEX processed_events_pkey ON transport.processed_events USING btree (consumer, event_id)`


## transport.request_status_history

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `request_id` | `uuid` | No | `` |

| `previous_status` | `transport.transport_request_status` | Sí | `` |

| `new_status` | `transport.transport_request_status` | No | `` |

| `actor_id` | `text` | Sí | `` |

| `occurred_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `request_status_history_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES identity.users(id)`

- `request_status_history_id_not_null`: `NOT NULL id`

- `request_status_history_new_status_not_null`: `NOT NULL new_status`

- `request_status_history_occurred_at_not_null`: `NOT NULL occurred_at`

- `request_status_history_pkey`: `PRIMARY KEY (id)`

- `request_status_history_request_id_fkey`: `FOREIGN KEY (request_id) REFERENCES transport.transport_requests(id)`

- `request_status_history_request_id_not_null`: `NOT NULL request_id`


### Índices



- `CREATE INDEX ix_fk_19624 ON transport.request_status_history USING btree (request_id)`

- `CREATE INDEX ix_fk_19629 ON transport.request_status_history USING btree (actor_id)`

- `CREATE UNIQUE INDEX request_status_history_pkey ON transport.request_status_history USING btree (id)`


## transport.routes

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `origin_address` | `text` | No | `` |

| `origin_latitude` | `numeric(9,6)` | No | `` |

| `origin_longitude` | `numeric(9,6)` | No | `` |

| `destination_address` | `text` | No | `` |

| `destination_latitude` | `numeric(9,6)` | No | `` |

| `destination_longitude` | `numeric(9,6)` | No | `` |

| `distance_km` | `numeric(12,3)` | No | `` |

| `estimated_duration_minutes` | `integer` | No | `` |

| `provider` | `text` | Sí | `` |

| `provider_route_id` | `text` | Sí | `` |

| `calculated_at` | `timestamp with time zone` | No | `now()` |


### Restricciones



- `ck_route_coordinates`: `CHECK ((((origin_latitude >= ('-90'::integer)::numeric) AND (origin_latitude <= (90)::numeric)) AND ((origin_longitude >= ('-180'::integer)::numeric) AND (origin_longitude <= (180)::numeric)) AND ((destination_latitude >= ('-90'::integer)::numeric) AND (destination_latitude <= (90)::numeric)) AND ((destination_longitude >= ('-180'::integer)::numeric) AND (destination_longitude <= (180)::numeric))))`

- `ck_route_metrics`: `CHECK (((distance_km > (0)::numeric) AND (estimated_duration_minutes > 0)))`

- `routes_calculated_at_not_null`: `NOT NULL calculated_at`

- `routes_destination_address_not_null`: `NOT NULL destination_address`

- `routes_destination_latitude_not_null`: `NOT NULL destination_latitude`

- `routes_destination_longitude_not_null`: `NOT NULL destination_longitude`

- `routes_distance_km_not_null`: `NOT NULL distance_km`

- `routes_estimated_duration_minutes_not_null`: `NOT NULL estimated_duration_minutes`

- `routes_id_not_null`: `NOT NULL id`

- `routes_origin_address_not_null`: `NOT NULL origin_address`

- `routes_origin_latitude_not_null`: `NOT NULL origin_latitude`

- `routes_origin_longitude_not_null`: `NOT NULL origin_longitude`

- `routes_pkey`: `PRIMARY KEY (id)`


### Índices



- `CREATE UNIQUE INDEX routes_pkey ON transport.routes USING btree (id)`


## transport.tracking_points

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `trip_id` | `uuid` | No | `` |

| `source` | `text` | No | `` |

| `source_point_id` | `text` | No | `` |

| `latitude` | `numeric(9,6)` | No | `` |

| `longitude` | `numeric(9,6)` | No | `` |

| `recorded_at` | `timestamp with time zone` | No | `` |

| `accuracy_meters` | `numeric(10,2)` | Sí | `` |


### Restricciones



- `ck_tracking_accuracy`: `CHECK (((accuracy_meters IS NULL) OR (accuracy_meters >= (0)::numeric)))`

- `ck_tracking_coordinates`: `CHECK ((((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)) AND ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))))`

- `tracking_points_id_not_null`: `NOT NULL id`

- `tracking_points_latitude_not_null`: `NOT NULL latitude`

- `tracking_points_longitude_not_null`: `NOT NULL longitude`

- `tracking_points_pkey`: `PRIMARY KEY (id)`

- `tracking_points_recorded_at_not_null`: `NOT NULL recorded_at`

- `tracking_points_source_not_null`: `NOT NULL source`

- `tracking_points_source_point_id_not_null`: `NOT NULL source_point_id`

- `tracking_points_trip_id_fkey`: `FOREIGN KEY (trip_id) REFERENCES transport.trips(id)`

- `tracking_points_trip_id_not_null`: `NOT NULL trip_id`

- `uq_tracking_source_point`: `UNIQUE (source, source_point_id)`


### Índices



- `CREATE INDEX ix_tracking_trip_recorded ON transport.tracking_points USING btree (trip_id, recorded_at DESC)`

- `CREATE UNIQUE INDEX tracking_points_pkey ON transport.tracking_points USING btree (id)`

- `CREATE UNIQUE INDEX uq_tracking_source_point ON transport.tracking_points USING btree (source, source_point_id)`


## transport.transport_cargos

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `request_id` | `uuid` | No | `` |

| `description` | `text` | No | `` |

| `cargo_type` | `transport.cargo_type` | Sí | `` |

| `weight_kg` | `numeric(12,3)` | Sí | `` |

| `volume_m3` | `numeric(12,3)` | Sí | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |

| `updated_at` | `timestamp with time zone` | No | `now()` |

| `deleted_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `ck_cargo_quantities`: `CHECK ((((weight_kg IS NULL) OR (weight_kg > (0)::numeric)) AND ((volume_m3 IS NULL) OR (volume_m3 > (0)::numeric))))`

- `transport_cargos_created_at_not_null`: `NOT NULL created_at`

- `transport_cargos_description_not_null`: `NOT NULL description`

- `transport_cargos_id_not_null`: `NOT NULL id`

- `transport_cargos_pkey`: `PRIMARY KEY (id)`

- `transport_cargos_request_id_fkey`: `FOREIGN KEY (request_id) REFERENCES transport.transport_requests(id)`

- `transport_cargos_request_id_key`: `UNIQUE (request_id)`

- `transport_cargos_request_id_not_null`: `NOT NULL request_id`

- `transport_cargos_updated_at_not_null`: `NOT NULL updated_at`


### Índices



- `CREATE UNIQUE INDEX transport_cargos_pkey ON transport.transport_cargos USING btree (id)`

- `CREATE UNIQUE INDEX transport_cargos_request_id_key ON transport.transport_cargos USING btree (request_id)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('updated_at')`


## transport.transport_exceptions

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `trip_id` | `uuid` | No | `` |

| `type` | `transport.exception_type` | No | `` |

| `description` | `text` | No | `` |

| `occurred_at` | `timestamp with time zone` | No | `` |

| `resolved_at` | `timestamp with time zone` | Sí | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |

| `deleted_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `ck_exception_resolution`: `CHECK (((resolved_at IS NULL) OR (resolved_at >= occurred_at)))`

- `transport_exceptions_created_at_not_null`: `NOT NULL created_at`

- `transport_exceptions_description_not_null`: `NOT NULL description`

- `transport_exceptions_id_not_null`: `NOT NULL id`

- `transport_exceptions_occurred_at_not_null`: `NOT NULL occurred_at`

- `transport_exceptions_pkey`: `PRIMARY KEY (id)`

- `transport_exceptions_trip_id_fkey`: `FOREIGN KEY (trip_id) REFERENCES transport.trips(id)`

- `transport_exceptions_trip_id_not_null`: `NOT NULL trip_id`

- `transport_exceptions_type_not_null`: `NOT NULL type`


### Índices



- `CREATE INDEX ix_fk_18984 ON transport.transport_exceptions USING btree (trip_id)`

- `CREATE UNIQUE INDEX transport_exceptions_pkey ON transport.transport_exceptions USING btree (id)`


## transport.transport_offers

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `request_id` | `uuid` | No | `` |

| `carrier_id` | `text` | No | `` |

| `vehicle_id` | `uuid` | Sí | `` |

| `amount` | `numeric(14,2)` | No | `` |

| `currency` | `character(3)` | No | `` |

| `status` | `transport.offer_status` | No | `'DRAFT'::transport.offer_status` |

| `valid_until` | `timestamp with time zone` | No | `` |

| `parent_offer_id` | `uuid` | Sí | `` |

| `proposed_by` | `transport.offer_actor` | Sí | `` |

| `round` | `integer` | No | `0` |

| `created_at` | `timestamp with time zone` | No | `now()` |

| `updated_at` | `timestamp with time zone` | No | `now()` |

| `deleted_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `ck_offer_amount`: `CHECK ((amount >= (0)::numeric))`

- `ck_offer_counter`: `CHECK ((((parent_offer_id IS NULL) = (proposed_by IS NULL)) AND ((round = 0) OR ((parent_offer_id IS NOT NULL) AND (proposed_by IS NOT NULL)))))`

- `ck_offer_currency`: `CHECK ((currency ~ '^[A-Z]{3}$'::text))`

- `ck_offer_not_self`: `CHECK ((parent_offer_id <> id))`

- `ck_offer_round`: `CHECK ((round >= 0))`

- `fk_counteroffer_context`: `FOREIGN KEY (parent_offer_id, request_id, carrier_id) REFERENCES transport.transport_offers(id, request_id, carrier_id)`

- `fk_unified_065`: `FOREIGN KEY (carrier_id) REFERENCES identity.users(id) DEFERRABLE`

- `transport_offers_amount_not_null`: `NOT NULL amount`

- `transport_offers_carrier_id_not_null`: `NOT NULL carrier_id`

- `transport_offers_created_at_not_null`: `NOT NULL created_at`

- `transport_offers_currency_not_null`: `NOT NULL currency`

- `transport_offers_id_not_null`: `NOT NULL id`

- `transport_offers_parent_offer_id_fkey`: `FOREIGN KEY (parent_offer_id) REFERENCES transport.transport_offers(id)`

- `transport_offers_pkey`: `PRIMARY KEY (id)`

- `transport_offers_request_id_fkey`: `FOREIGN KEY (request_id) REFERENCES transport.transport_requests(id)`

- `transport_offers_request_id_not_null`: `NOT NULL request_id`

- `transport_offers_round_not_null`: `NOT NULL round`

- `transport_offers_status_not_null`: `NOT NULL status`

- `transport_offers_updated_at_not_null`: `NOT NULL updated_at`

- `transport_offers_valid_until_not_null`: `NOT NULL valid_until`

- `transport_offers_vehicle_id_fkey`: `FOREIGN KEY (vehicle_id) REFERENCES transport.vehicles(id)`

- `uq_offer_context`: `UNIQUE (id, request_id, carrier_id)`


### Índices



- `CREATE INDEX ix_fk_18824 ON transport.transport_offers USING btree (vehicle_id)`

- `CREATE INDEX ix_fk_18829 ON transport.transport_offers USING btree (parent_offer_id)`

- `CREATE INDEX ix_fk_21228 ON transport.transport_offers USING btree (carrier_id)`

- `CREATE INDEX ix_fk_21755 ON transport.transport_offers USING btree (parent_offer_id, request_id, carrier_id)`

- `CREATE INDEX ix_offers_expiration ON transport.transport_offers USING btree (status, valid_until) WHERE ((status = 'SUBMITTED'::transport.offer_status) AND (deleted_at IS NULL))`

- `CREATE INDEX ix_offers_request_created ON transport.transport_offers USING btree (request_id, created_at DESC)`

- `CREATE UNIQUE INDEX transport_offers_pkey ON transport.transport_offers USING btree (id)`

- `CREATE UNIQUE INDEX uq_accepted_offer_per_request ON transport.transport_offers USING btree (request_id) WHERE ((status = 'ACCEPTED'::transport.offer_status) AND (deleted_at IS NULL))`

- `CREATE UNIQUE INDEX uq_offer_context ON transport.transport_offers USING btree (id, request_id, carrier_id)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('updated_at')`


## transport.transport_requests

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `requester_id` | `text` | No | `` |

| `idempotency_key` | `text` | Sí | `` |

| `status` | `transport.transport_request_status` | No | `'DRAFT'::transport.transport_request_status` |

| `origin_address` | `text` | No | `` |

| `origin_latitude` | `numeric(9,6)` | No | `` |

| `origin_longitude` | `numeric(9,6)` | No | `` |

| `destination_address` | `text` | No | `` |

| `destination_latitude` | `numeric(9,6)` | No | `` |

| `destination_longitude` | `numeric(9,6)` | No | `` |

| `window_starts_at` | `timestamp with time zone` | No | `` |

| `window_ends_at` | `timestamp with time zone` | No | `` |

| `active_assignment_id` | `uuid` | Sí | `` |

| `row_version` | `integer` | No | `1` |

| `aggregate_version` | `integer` | No | `0` |

| `created_at` | `timestamp with time zone` | No | `now()` |

| `updated_at` | `timestamp with time zone` | No | `now()` |

| `cancelled_at` | `timestamp with time zone` | Sí | `` |

| `deleted_at` | `timestamp with time zone` | Sí | `` |

| `pricing_rule_id` | `uuid` | Sí | `` |


### Restricciones



- `active_pointer_request`: `TRIGGER DEFERRABLE INITIALLY DEFERRED`

- `ck_request_coordinates`: `CHECK ((((origin_latitude >= ('-90'::integer)::numeric) AND (origin_latitude <= (90)::numeric)) AND ((origin_longitude >= ('-180'::integer)::numeric) AND (origin_longitude <= (180)::numeric)) AND ((destination_latitude >= ('-90'::integer)::numeric) AND (destination_latitude <= (90)::numeric)) AND ((destination_longitude >= ('-180'::integer)::numeric) AND (destination_longitude <= (180)::numeric))))`

- `ck_request_versions`: `CHECK (((row_version > 0) AND (aggregate_version >= 0)))`

- `ck_request_window`: `CHECK ((window_starts_at < window_ends_at))`

- `fk_active_assignment`: `FOREIGN KEY (active_assignment_id, id) REFERENCES transport.assignments(id, request_id) DEFERRABLE INITIALLY DEFERRED`

- `fk_unified_062`: `FOREIGN KEY (requester_id) REFERENCES identity.users(id) DEFERRABLE`

- `transport_requests_aggregate_version_not_null`: `NOT NULL aggregate_version`

- `transport_requests_created_at_not_null`: `NOT NULL created_at`

- `transport_requests_destination_address_not_null`: `NOT NULL destination_address`

- `transport_requests_destination_latitude_not_null`: `NOT NULL destination_latitude`

- `transport_requests_destination_longitude_not_null`: `NOT NULL destination_longitude`

- `transport_requests_id_not_null`: `NOT NULL id`

- `transport_requests_origin_address_not_null`: `NOT NULL origin_address`

- `transport_requests_origin_latitude_not_null`: `NOT NULL origin_latitude`

- `transport_requests_origin_longitude_not_null`: `NOT NULL origin_longitude`

- `transport_requests_pkey`: `PRIMARY KEY (id)`

- `transport_requests_pricing_rule_id_fkey`: `FOREIGN KEY (pricing_rule_id) REFERENCES transport.pricing_rules(id)`

- `transport_requests_requester_id_not_null`: `NOT NULL requester_id`

- `transport_requests_row_version_not_null`: `NOT NULL row_version`

- `transport_requests_status_not_null`: `NOT NULL status`

- `transport_requests_updated_at_not_null`: `NOT NULL updated_at`

- `transport_requests_window_ends_at_not_null`: `NOT NULL window_ends_at`

- `transport_requests_window_starts_at_not_null`: `NOT NULL window_starts_at`


### Índices



- `CREATE INDEX ix_fk_21735 ON transport.transport_requests USING btree (active_assignment_id, id)`

- `CREATE INDEX ix_fk_21763 ON transport.transport_requests USING btree (pricing_rule_id)`

- `CREATE INDEX ix_requests_requester_created ON transport.transport_requests USING btree (requester_id, created_at DESC)`

- `CREATE INDEX ix_requests_status_window ON transport.transport_requests USING btree (status, window_starts_at)`

- `CREATE UNIQUE INDEX transport_requests_pkey ON transport.transport_requests USING btree (id)`

- `CREATE UNIQUE INDEX uq_requests_idempotency ON transport.transport_requests USING btree (requester_id, idempotency_key) WHERE (idempotency_key IS NOT NULL)`


### Triggers



- `active_pointer_request: EXECUTE FUNCTION transport.check_active_pointer()`

- `record_status: EXECUTE FUNCTION transport.record_request_status()`

- `touch_updated: EXECUTE FUNCTION touch_updated_at('updated_at')`


## transport.trips

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `request_id` | `uuid` | No | `` |

| `assignment_id` | `uuid` | No | `` |

| `route_id` | `uuid` | Sí | `` |

| `status` | `transport.trip_status` | No | `'PLANNED'::transport.trip_status` |

| `started_at` | `timestamp with time zone` | Sí | `` |

| `completed_at` | `timestamp with time zone` | Sí | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |

| `updated_at` | `timestamp with time zone` | No | `now()` |

| `deleted_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `ck_trip_dates`: `CHECK ((((status <> ALL (ARRAY['IN_PROGRESS'::transport.trip_status, 'COMPLETED'::transport.trip_status])) OR (started_at IS NOT NULL)) AND ((status <> 'COMPLETED'::transport.trip_status) OR (completed_at IS NOT NULL)) AND ((completed_at IS NULL) OR (completed_at >= started_at))))`

- `fk_trip_assignment_request`: `FOREIGN KEY (assignment_id, request_id) REFERENCES transport.assignments(id, request_id)`

- `trips_assignment_id_fkey`: `FOREIGN KEY (assignment_id) REFERENCES transport.assignments(id)`

- `trips_assignment_id_key`: `UNIQUE (assignment_id)`

- `trips_assignment_id_not_null`: `NOT NULL assignment_id`

- `trips_created_at_not_null`: `NOT NULL created_at`

- `trips_id_not_null`: `NOT NULL id`

- `trips_pkey`: `PRIMARY KEY (id)`

- `trips_request_id_fkey`: `FOREIGN KEY (request_id) REFERENCES transport.transport_requests(id)`

- `trips_request_id_key`: `UNIQUE (request_id)`

- `trips_request_id_not_null`: `NOT NULL request_id`

- `trips_route_id_fkey`: `FOREIGN KEY (route_id) REFERENCES transport.routes(id)`

- `trips_status_not_null`: `NOT NULL status`

- `trips_updated_at_not_null`: `NOT NULL updated_at`

- `uq_trip_route`: `UNIQUE (route_id)`


### Índices



- `CREATE INDEX ix_fk_21740 ON transport.trips USING btree (assignment_id, request_id)`

- `CREATE UNIQUE INDEX trips_assignment_id_key ON transport.trips USING btree (assignment_id)`

- `CREATE UNIQUE INDEX trips_pkey ON transport.trips USING btree (id)`

- `CREATE UNIQUE INDEX trips_request_id_key ON transport.trips USING btree (request_id)`

- `CREATE UNIQUE INDEX uq_open_trip_per_assignment ON transport.trips USING btree (assignment_id) WHERE ((status = ANY (ARRAY['PLANNED'::transport.trip_status, 'IN_PROGRESS'::transport.trip_status])) AND (deleted_at IS NULL))`

- `CREATE UNIQUE INDEX uq_trip_route ON transport.trips USING btree (route_id)`


### Triggers



- `guard_trip: EXECUTE FUNCTION transport.guard_trip()`

- `touch_updated: EXECUTE FUNCTION touch_updated_at('updated_at')`


## transport.vehicle_documents

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `vehicle_id` | `uuid` | No | `` |

| `document_type` | `text` | No | `` |

| `file_url` | `text` | No | `` |

| `expires_at` | `timestamp with time zone` | Sí | `` |

| `verification_status` | `text` | No | `'PENDING'::text` |

| `verified_by` | `text` | Sí | `` |

| `verified_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `vehicle_documents_document_type_not_null`: `NOT NULL document_type`

- `vehicle_documents_file_url_not_null`: `NOT NULL file_url`

- `vehicle_documents_id_not_null`: `NOT NULL id`

- `vehicle_documents_pkey`: `PRIMARY KEY (id)`

- `vehicle_documents_vehicle_id_fkey`: `FOREIGN KEY (vehicle_id) REFERENCES transport.vehicles(id)`

- `vehicle_documents_vehicle_id_not_null`: `NOT NULL vehicle_id`

- `vehicle_documents_verification_status_check`: `CHECK ((verification_status = ANY (ARRAY['PENDING'::text, 'VERIFIED'::text, 'REJECTED'::text])))`

- `vehicle_documents_verification_status_not_null`: `NOT NULL verification_status`

- `vehicle_documents_verified_by_fkey`: `FOREIGN KEY (verified_by) REFERENCES identity.users(id)`


### Índices



- `CREATE INDEX ix_fk_19446 ON transport.vehicle_documents USING btree (vehicle_id)`

- `CREATE INDEX ix_fk_19451 ON transport.vehicle_documents USING btree (verified_by)`

- `CREATE UNIQUE INDEX vehicle_documents_pkey ON transport.vehicle_documents USING btree (id)`


## transport.vehicles

| Columna | Tipo | Nulo | Default / expresión |

|---|---|---|---|

| `id` | `uuid` | No | `gen_random_uuid()` |

| `owner_id` | `text` | No | `` |

| `registration_number` | `text` | No | `` |

| `registration_number_normalized` | `text` | No | `` |

| `body_type` | `transport.vehicle_body_type` | No | `` |

| `capacity_value` | `numeric(12,3)` | No | `` |

| `capacity_unit` | `transport.capacity_unit` | No | `` |

| `capacity_kg` | `numeric(12,3)` | No | `` |

| `status` | `transport.vehicle_status` | No | `'PENDING'::transport.vehicle_status` |

| `source_version` | `integer` | Sí | `` |

| `created_at` | `timestamp with time zone` | No | `now()` |

| `updated_at` | `timestamp with time zone` | No | `now()` |

| `deleted_at` | `timestamp with time zone` | Sí | `` |


### Restricciones



- `ck_normalized_plate`: `CHECK (((registration_number_normalized = upper(regexp_replace(registration_number, '[[:space:]-]'::text, ''::text, 'g'::text))) AND (length(registration_number_normalized) > 0)))`

- `ck_vehicle_capacities`: `CHECK (((capacity_value > (0)::numeric) AND (capacity_kg > (0)::numeric)))`

- `ck_vehicle_capacity_unit`: `CHECK ((((body_type = 'DUMP_TRUCK'::transport.vehicle_body_type) AND (capacity_unit = 'M3'::transport.capacity_unit)) OR ((body_type = 'FLATBED'::transport.vehicle_body_type) AND (capacity_unit = ANY (ARRAY['TON'::transport.capacity_unit, 'FT'::transport.capacity_unit]))) OR (body_type = 'OTHER'::transport.vehicle_body_type)))`

- `fk_unified_064`: `FOREIGN KEY (owner_id) REFERENCES identity.users(id) DEFERRABLE`

- `vehicles_body_type_not_null`: `NOT NULL body_type`

- `vehicles_capacity_kg_not_null`: `NOT NULL capacity_kg`

- `vehicles_capacity_unit_not_null`: `NOT NULL capacity_unit`

- `vehicles_capacity_value_not_null`: `NOT NULL capacity_value`

- `vehicles_created_at_not_null`: `NOT NULL created_at`

- `vehicles_id_not_null`: `NOT NULL id`

- `vehicles_owner_id_not_null`: `NOT NULL owner_id`

- `vehicles_pkey`: `PRIMARY KEY (id)`

- `vehicles_registration_number_normalized_not_null`: `NOT NULL registration_number_normalized`

- `vehicles_registration_number_not_null`: `NOT NULL registration_number`

- `vehicles_status_not_null`: `NOT NULL status`

- `vehicles_updated_at_not_null`: `NOT NULL updated_at`


### Índices



- `CREATE INDEX ix_vehicles_matching ON transport.vehicles USING btree (status, body_type, capacity_kg)`

- `CREATE INDEX ix_vehicles_owner_status ON transport.vehicles USING btree (owner_id, status)`

- `CREATE UNIQUE INDEX uq_vehicle_registration_normalized ON transport.vehicles USING btree (registration_number_normalized) WHERE (deleted_at IS NULL)`

- `CREATE UNIQUE INDEX vehicles_pkey ON transport.vehicles USING btree (id)`


### Triggers



- `touch_updated: EXECUTE FUNCTION touch_updated_at('updated_at')`


## Enumeraciones



### transport.assignment_status

`ACTIVE`, `RELEASED`, `COMPLETED`

### transport.capacity_unit

`M3`, `TON`, `FT`

### transport.cargo_type

`MATERIALS`, `AGGREGATES`, `MACHINERY`, `OTHER`

### transport.driver_status

`PENDING`, `ENABLED`, `DISABLED`, `SUSPENDED`

### transport.exception_type

`DELAY`, `DAMAGE`, `BREAKDOWN`, `ROUTE_DEVIATION`, `OTHER`

### transport.offer_actor

`CLIENT`, `CARRIER`

### transport.offer_status

`DRAFT`, `SUBMITTED`, `COUNTERED`, `ACCEPTED`, `REJECTED`, `WITHDRAWN`, `EXPIRED`

### transport.transport_request_status

`DRAFT`, `OPEN`, `MATCHING`, `OFFERED`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`

### transport.trip_status

`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`

### transport.vehicle_body_type

`DUMP_TRUCK`, `FLATBED`, `OTHER`

### transport.vehicle_status

`PENDING`, `ENABLED`, `DISABLED`, `SUSPENDED`


## Vistas



### baney_billing.v_reporte_607

```sql

 SELECT to_char(fecha_emision, 'YYYYMM'::text) AS periodo,
    receptor_rnc AS rnc_cliente,
    ncf,
    tipo_ecf,
    date(fecha_emision) AS fecha_comprobante,
    monto_exento,
    base_imponible AS monto_facturado_gravado,
    itbis AS itbis_facturado,
    total
   FROM baney_billing.factura f
  WHERE ((tipo_documento = 'factura'::text) AND (estado = ANY (ARRAY['emitida'::text, 'enviada_dgii'::text, 'aceptada_dgii'::text])) AND (ncf IS NOT NULL));

```

### baney_caja.v_descuadre_saldos

```sql

 SELECT s.cuenta_id,
    s.total AS saldo_materializado,
    COALESCE(sum(m.monto), (0)::numeric) AS saldo_real,
    (s.total - COALESCE(sum(m.monto), (0)::numeric)) AS diferencia
   FROM (baney_caja.saldo_cuenta s
     LEFT JOIN baney_caja.movimiento m ON ((m.cuenta_id = s.cuenta_id)))
  GROUP BY s.cuenta_id, s.total
 HAVING (abs((s.total - COALESCE(sum(m.monto), (0)::numeric))) > 0.005);

```

### baney_caja.v_resumen_mensual

```sql

 SELECT cuenta_id,
    to_char((fecha_valor)::timestamp with time zone, 'YYYY-MM'::text) AS periodo,
    sum(
        CASE
            WHEN (tipo = ANY (ARRAY['venta'::text, 'flete'::text])) THEN monto
            ELSE (0)::numeric
        END) AS ingresos,
    sum(
        CASE
            WHEN (tipo = 'comision'::text) THEN (- monto)
            ELSE (0)::numeric
        END) AS comisiones,
    sum(
        CASE
            WHEN (tipo = 'itbis'::text) THEN monto
            ELSE (0)::numeric
        END) AS itbis,
    sum(
        CASE
            WHEN (tipo = 'retencion'::text) THEN (- monto)
            ELSE (0)::numeric
        END) AS retenciones,
    sum(
        CASE
            WHEN (tipo = 'payout'::text) THEN (- monto)
            ELSE (0)::numeric
        END) AS payouts,
    sum(
        CASE
            WHEN (tipo = ANY (ARRAY['reembolso'::text, 'devolucion'::text])) THEN (- monto)
            ELSE (0)::numeric
        END) AS reembolsos,
    sum(monto) AS neto,
    count(*) AS movimientos
   FROM baney_caja.movimiento m
  GROUP BY cuenta_id, (to_char((fecha_valor)::timestamp with time zone, 'YYYY-MM'::text));

```

### baney_inventory.v_disponibilidad

```sql

 SELECT variante_uid,
    producto_uid,
    vendedor_uid,
    disponible,
    reservado,
    (disponible + reservado) AS total_fisico,
        CASE
            WHEN (permite_sobreventa = 1) THEN 'disponible'::text
            WHEN (disponible <= 0) THEN 'agotado'::text
            WHEN (disponible <= umbral_alerta) THEN 'pocas_unidades'::text
            ELSE 'disponible'::text
        END AS estado_disponibilidad
   FROM baney_inventory.existencia e;

```

### baney_order.v_ventas_vendedor

```sql

 SELECT s.vendedor_uid,
    date(p.pagado_en) AS fecha,
    count(DISTINCT s.id) AS subordenes,
    sum(s.subtotal) AS subtotal,
    sum(s.descuento) AS descuento,
    sum(s.itbis) AS itbis,
    sum(s.transporte) AS transporte,
    sum(s.total) AS total
   FROM (baney_order.suborden s
     JOIN baney_order.pedido p ON ((p.id = s.pedido_id)))
  WHERE ((p.pagado_en IS NOT NULL) AND (s.estado <> ALL (ARRAY['rechazada'::text, 'cancelada'::text])))
  GROUP BY s.vendedor_uid, (date(p.pagado_en));

```

### profiles.account_summaries

```sql

 SELECT u.id AS user_id,
    u.email,
    u.status,
    p.display_name,
    ( SELECT count(*) AS count
           FROM transport.transport_requests r
          WHERE (r.requester_id = u.id)) AS transport_requests,
    ( SELECT count(*) AS count
           FROM baney_order.pedido o
          WHERE (o.comprador_uid = u.id)) AS orders
   FROM (identity.users u
     LEFT JOIN profiles.user_profiles p ON ((p.user_id = u.id)));

```