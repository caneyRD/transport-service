-- The standalone base schema predates the fleet availability endpoints.
-- Shared legacy schemas already have this table; preserve their data.
CREATE TABLE IF NOT EXISTS transport.driver_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_profile_id uuid NOT NULL REFERENCES transport.driver_profiles(id),
  vehicle_id uuid REFERENCES transport.vehicles(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('AVAILABLE', 'UNAVAILABLE')),
  CONSTRAINT ck_driver_availability_window CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS ix_driver_availability_window
  ON transport.driver_availability (driver_profile_id, starts_at, ends_at);
