-- BANEY Transporte - esquema base de datos
-- Motor propuesto: PostgreSQL
-- Este archivo define la estructura inicial; no sustituye las migraciones versionadas.
-- Los IDs son generados por la aplicación y llegan a la base como UUID.
-- No se crean foreign keys hacia Auth ni hacia User Service.

BEGIN;

CREATE SCHEMA IF NOT EXISTS transport;
SET search_path TO transport, public;

CREATE TYPE transport_request_status AS ENUM (
  'DRAFT', 'OPEN', 'MATCHING', 'OFFERED', 'ASSIGNED',
  'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
);

CREATE TYPE cargo_type AS ENUM ('MATERIALS', 'AGGREGATES', 'MACHINERY', 'OTHER');
CREATE TYPE driver_status AS ENUM ('PENDING', 'ENABLED', 'DISABLED', 'SUSPENDED');
CREATE TYPE vehicle_status AS ENUM ('PENDING', 'ENABLED', 'DISABLED', 'SUSPENDED');
CREATE TYPE vehicle_body_type AS ENUM ('DUMP_TRUCK', 'FLATBED', 'OTHER');
CREATE TYPE capacity_unit AS ENUM ('M3', 'TON', 'FT');
CREATE TYPE offer_status AS ENUM (
  'DRAFT', 'SUBMITTED', 'COUNTERED', 'ACCEPTED',
  'REJECTED', 'WITHDRAWN', 'EXPIRED'
);
CREATE TYPE offer_actor AS ENUM ('CLIENT', 'CARRIER');
CREATE TYPE assignment_status AS ENUM ('ACTIVE', 'RELEASED', 'COMPLETED');
CREATE TYPE trip_status AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE exception_type AS ENUM ('DELAY', 'DAMAGE', 'BREAKDOWN', 'ROUTE_DEVIATION', 'OTHER');

CREATE TABLE transport_requests (
  id                    uuid PRIMARY KEY,
  requester_id          text NOT NULL,
  idempotency_key       text,
  status                transport_request_status NOT NULL DEFAULT 'DRAFT',
  origin_address        text NOT NULL,
  origin_latitude       numeric(9, 6) NOT NULL,
  origin_longitude      numeric(9, 6) NOT NULL,
  destination_address   text NOT NULL,
  destination_latitude  numeric(9, 6) NOT NULL,
  destination_longitude numeric(9, 6) NOT NULL,
  window_starts_at      timestamptz NOT NULL,
  window_ends_at        timestamptz NOT NULL,
  active_assignment_id  uuid,
  row_version           integer NOT NULL DEFAULT 1,
  aggregate_version     integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  cancelled_at          timestamptz,
  deleted_at            timestamptz,
  CONSTRAINT ck_request_coordinates CHECK (
    origin_latitude BETWEEN -90 AND 90 AND
    origin_longitude BETWEEN -180 AND 180 AND
    destination_latitude BETWEEN -90 AND 90 AND
    destination_longitude BETWEEN -180 AND 180
  ),
  CONSTRAINT ck_request_window CHECK (window_starts_at < window_ends_at),
  CONSTRAINT ck_request_versions CHECK (row_version > 0 AND aggregate_version >= 0)
);

CREATE UNIQUE INDEX uq_requests_idempotency
  ON transport_requests (requester_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_requests_requester_created
  ON transport_requests (requester_id, created_at DESC);
CREATE INDEX ix_requests_status_window
  ON transport_requests (status, window_starts_at);

CREATE TABLE transport_cargos (
  id            uuid PRIMARY KEY,
  request_id    uuid NOT NULL UNIQUE REFERENCES transport_requests(id),
  description   text NOT NULL,
  cargo_type    cargo_type,
  weight_kg     numeric(12, 3),
  volume_m3     numeric(12, 3),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT ck_cargo_quantities CHECK (
    (weight_kg IS NULL OR weight_kg > 0) AND
    (volume_m3 IS NULL OR volume_m3 > 0)
  )
);

CREATE TABLE driver_profiles (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL UNIQUE,
  status      driver_status NOT NULL DEFAULT 'PENDING',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- Proyección local del vehículo. El dueño maestro (User Service o Transporte)
-- debe aprobarse antes de permitir escrituras locales sobre esta tabla.
CREATE TABLE vehicles (
  id                          uuid PRIMARY KEY,
  owner_id                    text NOT NULL,
  registration_number         text NOT NULL,
  registration_number_normalized text NOT NULL,
  body_type                   vehicle_body_type NOT NULL,
  capacity_value              numeric(12, 3) NOT NULL,
  capacity_unit               capacity_unit NOT NULL,
  capacity_kg                 numeric(12, 3) NOT NULL,
  status                      vehicle_status NOT NULL DEFAULT 'PENDING',
  source_version              integer,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  deleted_at                  timestamptz,
  CONSTRAINT ck_vehicle_capacities CHECK (
    capacity_value > 0 AND capacity_kg > 0
  ),
  CONSTRAINT ck_vehicle_capacity_unit CHECK (
    (body_type = 'DUMP_TRUCK' AND capacity_unit = 'M3') OR
    (body_type = 'FLATBED' AND capacity_unit IN ('TON', 'FT')) OR
    (body_type = 'OTHER')
  )
);

CREATE UNIQUE INDEX uq_vehicle_registration_normalized
  ON vehicles (registration_number_normalized)
  WHERE deleted_at IS NULL;
CREATE INDEX ix_vehicles_owner_status ON vehicles (owner_id, status);
CREATE INDEX ix_vehicles_matching ON vehicles (status, body_type, capacity_kg);

CREATE TABLE matching_candidates (
  id                  uuid PRIMARY KEY,
  request_id          uuid NOT NULL REFERENCES transport_requests(id),
  driver_profile_id   uuid NOT NULL REFERENCES driver_profiles(id),
  vehicle_id          uuid NOT NULL REFERENCES vehicles(id),
  score               numeric(5, 4) NOT NULL,
  distance_km         numeric(12, 3),
  expires_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_candidate_score CHECK (score BETWEEN 0 AND 1),
  CONSTRAINT ck_candidate_distance CHECK (distance_km IS NULL OR distance_km >= 0)
);

-- La vigencia depende del reloj y no puede usarse en un índice parcial de PostgreSQL.
-- La aplicación debe reutilizar o reemplazar el candidato existente por solicitud/vehículo.
CREATE UNIQUE INDEX uq_matching_candidate_per_vehicle
  ON matching_candidates (request_id, vehicle_id);
CREATE INDEX ix_candidates_request_score
  ON matching_candidates (request_id, score DESC);

CREATE TABLE transport_offers (
  id              uuid PRIMARY KEY,
  request_id      uuid NOT NULL REFERENCES transport_requests(id),
  carrier_id      text NOT NULL,
  vehicle_id      uuid REFERENCES vehicles(id),
  amount          numeric(14, 2) NOT NULL,
  currency        char(3) NOT NULL,
  status          offer_status NOT NULL DEFAULT 'DRAFT',
  valid_until     timestamptz NOT NULL,
  parent_offer_id uuid REFERENCES transport_offers(id),
  proposed_by     offer_actor,
  round           integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT ck_offer_amount CHECK (amount >= 0),
  CONSTRAINT ck_offer_currency CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_offer_round CHECK (round >= 0),
  CONSTRAINT ck_offer_counter CHECK (
    (status <> 'COUNTERED' OR parent_offer_id IS NOT NULL) AND
    (round = 0 OR (parent_offer_id IS NOT NULL AND proposed_by IS NOT NULL))
  )
);

CREATE UNIQUE INDEX uq_accepted_offer_per_request
  ON transport_offers (request_id)
  WHERE status = 'ACCEPTED' AND deleted_at IS NULL;
CREATE INDEX ix_offers_request_created
  ON transport_offers (request_id, created_at DESC);
CREATE INDEX ix_offers_expiration
  ON transport_offers (status, valid_until)
  WHERE status = 'SUBMITTED' AND deleted_at IS NULL;

CREATE TABLE assignments (
  id                uuid PRIMARY KEY,
  request_id        uuid NOT NULL REFERENCES transport_requests(id),
  driver_profile_id uuid NOT NULL REFERENCES driver_profiles(id),
  vehicle_id        uuid NOT NULL REFERENCES vehicles(id),
  status            assignment_status NOT NULL DEFAULT 'ACTIVE',
  assigned_at       timestamptz NOT NULL DEFAULT now(),
  released_at       timestamptz,
  completed_at      timestamptz,
  deleted_at        timestamptz
);

CREATE UNIQUE INDEX uq_active_assignment_per_request
  ON assignments (request_id)
  WHERE status = 'ACTIVE' AND deleted_at IS NULL;

CREATE TABLE routes (
  id                       uuid PRIMARY KEY,
  origin_address           text NOT NULL,
  origin_latitude          numeric(9, 6) NOT NULL,
  origin_longitude         numeric(9, 6) NOT NULL,
  destination_address      text NOT NULL,
  destination_latitude     numeric(9, 6) NOT NULL,
  destination_longitude    numeric(9, 6) NOT NULL,
  distance_km              numeric(12, 3) NOT NULL,
  estimated_duration_minutes integer NOT NULL,
  provider                 text,
  provider_route_id        text,
  calculated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_route_coordinates CHECK (
    origin_latitude BETWEEN -90 AND 90 AND
    origin_longitude BETWEEN -180 AND 180 AND
    destination_latitude BETWEEN -90 AND 90 AND
    destination_longitude BETWEEN -180 AND 180
  ),
  CONSTRAINT ck_route_metrics CHECK (distance_km > 0 AND estimated_duration_minutes > 0)
);

CREATE TABLE trips (
  id            uuid PRIMARY KEY,
  request_id    uuid NOT NULL UNIQUE REFERENCES transport_requests(id),
  assignment_id uuid NOT NULL UNIQUE REFERENCES assignments(id),
  route_id      uuid REFERENCES routes(id),
  status        trip_status NOT NULL DEFAULT 'PLANNED',
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE UNIQUE INDEX uq_open_trip_per_assignment
  ON trips (assignment_id)
  WHERE status IN ('PLANNED', 'IN_PROGRESS') AND deleted_at IS NULL;

CREATE TABLE tracking_points (
  id                uuid PRIMARY KEY,
  trip_id           uuid NOT NULL REFERENCES trips(id),
  source            text NOT NULL,
  source_point_id   text NOT NULL,
  latitude          numeric(9, 6) NOT NULL,
  longitude         numeric(9, 6) NOT NULL,
  recorded_at       timestamptz NOT NULL,
  accuracy_meters   numeric(10, 2),
  CONSTRAINT uq_tracking_source_point UNIQUE (source, source_point_id),
  CONSTRAINT ck_tracking_coordinates CHECK (
    latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
  ),
  CONSTRAINT ck_tracking_accuracy CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0)
);

CREATE INDEX ix_tracking_trip_recorded
  ON tracking_points (trip_id, recorded_at DESC);

CREATE TABLE pricing_rules (
  id             uuid PRIMARY KEY,
  name           text NOT NULL,
  base_amount    numeric(14, 2) NOT NULL,
  price_per_km   numeric(14, 2) NOT NULL,
  currency       char(3) NOT NULL,
  active         boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_pricing_amounts CHECK (base_amount >= 0 AND price_per_km >= 0),
  CONSTRAINT ck_pricing_currency CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_pricing_period CHECK (effective_until IS NULL OR effective_from < effective_until)
);

CREATE TABLE transport_exceptions (
  id           uuid PRIMARY KEY,
  trip_id      uuid NOT NULL REFERENCES trips(id),
  type         exception_type NOT NULL,
  description  text NOT NULL,
  occurred_at  timestamptz NOT NULL,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE TABLE outbox_events (
  event_id         uuid PRIMARY KEY,
  aggregate_type   text NOT NULL,
  aggregate_id     text NOT NULL,
  event_type       text NOT NULL,
  aggregate_version integer NOT NULL,
  correlation_id   text NOT NULL,
  schema_version   integer NOT NULL DEFAULT 1,
  payload          jsonb NOT NULL,
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  published_at     timestamptz,
  attempts         integer NOT NULL DEFAULT 0,
  CONSTRAINT uq_outbox_aggregate_version
    UNIQUE (aggregate_type, aggregate_id, aggregate_version),
  CONSTRAINT ck_outbox_versions CHECK (aggregate_version > 0 AND schema_version > 0),
  CONSTRAINT ck_outbox_attempts CHECK (attempts >= 0)
);

CREATE INDEX ix_outbox_pending ON outbox_events (published_at, occurred_at)
  WHERE published_at IS NULL;

CREATE TABLE processed_events (
  consumer      text NOT NULL,
  event_id      uuid NOT NULL,
  processed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

-- La base refuerza la concurrencia, pero la aplicación debe hacer:
-- UPDATE ... SET row_version = row_version + 1
-- WHERE id = $1 AND row_version = $2;
-- Si no se actualiza ninguna fila, responder conflicto (409) o reintentar.

COMMIT;
