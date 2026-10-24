-- New relational design for the candidate entities in the domain PDF.
-- These are proposed contracts, not reverse-engineered production tables.
CREATE SCHEMA identity;
CREATE SCHEMA profiles;
CREATE SCHEMA payments;
CREATE SCHEMA communications;
CREATE SCHEMA support;
CREATE SCHEMA governance;
CREATE SCHEMA education;
CREATE SCHEMA analytics;
CREATE SCHEMA platform;

CREATE TABLE identity.users (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 email text NOT NULL CHECK (email = lower(btrim(email)) AND position('@' in email)>1),
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','DISABLED')),
 email_verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 UNIQUE(email), CHECK(length(btrim(id))>0)
);
CREATE TABLE identity.credentials (
 user_id text PRIMARY KEY REFERENCES identity.users(id), password_hash text NOT NULL,
 password_changed_at timestamptz NOT NULL DEFAULT now(), must_change boolean NOT NULL DEFAULT false
);
CREATE TABLE identity.oauth_identities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES identity.users(id),
 provider text NOT NULL, provider_subject text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,provider_subject)
);
CREATE TABLE identity.sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES identity.users(id),
 device_fingerprint_hash text, user_agent text, ip inet,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 revoked_at timestamptz, CHECK(expires_at > created_at)
);
CREATE TABLE identity.refresh_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES identity.sessions(id),
 token_hash text NOT NULL UNIQUE, parent_token_id uuid UNIQUE REFERENCES identity.refresh_tokens(id),
 expires_at timestamptz NOT NULL, consumed_at timestamptz, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(expires_at > created_at)
);
CREATE TABLE identity.email_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES identity.users(id),
 email text NOT NULL, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), CHECK(expires_at > created_at)
);
CREATE TABLE identity.password_resets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES identity.users(id),
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(expires_at > created_at)
);
CREATE TABLE identity.two_factor_configurations (
 user_id text PRIMARY KEY REFERENCES identity.users(id), secret_ciphertext bytea NOT NULL,
 key_version text NOT NULL, enabled_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE identity.recovery_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES identity.two_factor_configurations(user_id),
 code_hash text NOT NULL UNIQUE, used_at timestamptz
);
CREATE TABLE identity.roles (code text PRIMARY KEY, description text NOT NULL);
CREATE TABLE identity.permissions (code text PRIMARY KEY, description text NOT NULL);
CREATE TABLE identity.role_permissions (
 role_code text REFERENCES identity.roles(code), permission_code text REFERENCES identity.permissions(code),
 PRIMARY KEY(role_code,permission_code)
);
CREATE TABLE identity.role_assignments (
 user_id text REFERENCES identity.users(id), role_code text REFERENCES identity.roles(code),
 granted_by text REFERENCES identity.users(id), granted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,role_code)
);
CREATE TABLE profiles.user_profiles (
 user_id text PRIMARY KEY REFERENCES identity.users(id), display_name text NOT NULL,
 avatar_url text, bio text, metadata jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE profiles.addresses (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text NOT NULL REFERENCES identity.users(id),
 label text NOT NULL, address text NOT NULL, province text, municipality text,
 latitude numeric(9,6) CHECK(latitude BETWEEN -90 AND 90), longitude numeric(9,6) CHECK(longitude BETWEEN -180 AND 180),
 is_default boolean NOT NULL DEFAULT false, deleted_at timestamptz,
 CHECK((latitude IS NULL)=(longitude IS NULL))
);
CREATE UNIQUE INDEX uq_default_address ON profiles.addresses(user_id) WHERE is_default AND deleted_at IS NULL;
CREATE TABLE profiles.contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES identity.users(id),
 type text NOT NULL CHECK(type IN ('EMAIL','PHONE')), value text NOT NULL, verified_at timestamptz,
 UNIQUE(user_id,type,value)
);
CREATE TABLE profiles.onboarding (
 user_id text PRIMARY KEY REFERENCES identity.users(id), stage text NOT NULL,
 status text NOT NULL CHECK(status IN ('PENDING','IN_PROGRESS','COMPLETED','REJECTED')),
 completed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE profiles.preferences (
 user_id text REFERENCES identity.users(id), key text NOT NULL, value jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,key)
);
CREATE TABLE profiles.account_status_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES identity.users(id),
 actor_id text REFERENCES identity.users(id), previous_status text NOT NULL, new_status text NOT NULL,
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE profiles.account_activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES identity.users(id),
 activity_type text NOT NULL, description text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE VIEW profiles.account_summaries AS
 SELECT u.id AS user_id,u.email,u.status,p.display_name,
 (SELECT count(*) FROM transport.transport_requests r WHERE r.requester_id=u.id) AS transport_requests,
 (SELECT count(*) FROM baney_order.pedido o WHERE o.comprador_uid=u.id) AS orders
 FROM identity.users u LEFT JOIN profiles.user_profiles p ON p.user_id=u.id;

CREATE TABLE transport.vehicle_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vehicle_id uuid NOT NULL REFERENCES transport.vehicles(id),
 document_type text NOT NULL, file_url text NOT NULL, expires_at timestamptz,
 verification_status text NOT NULL DEFAULT 'PENDING' CHECK(verification_status IN ('PENDING','VERIFIED','REJECTED')),
 verified_by text REFERENCES identity.users(id), verified_at timestamptz
);
CREATE TABLE transport.driver_availability (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), driver_profile_id uuid NOT NULL REFERENCES transport.driver_profiles(id),
 vehicle_id uuid REFERENCES transport.vehicles(id), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 status text NOT NULL CHECK(status IN ('AVAILABLE','UNAVAILABLE')), CHECK(ends_at>starts_at)
);
CREATE TABLE transport.dispatch_boards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, region text,
 manager_id text REFERENCES identity.users(id)
);
CREATE TABLE transport.dispatch_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), board_id uuid NOT NULL REFERENCES transport.dispatch_boards(id),
 request_id uuid NOT NULL REFERENCES transport.transport_requests(id),
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','ASSIGNED','COMPLETED','CANCELLED')),
 priority integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE transport.dispatch_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES transport.dispatch_jobs(id),
 assignment_id uuid REFERENCES transport.assignments(id), actor_id text REFERENCES identity.users(id),
 decision text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE transport.map_locations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text REFERENCES identity.users(id), label text NOT NULL,
 latitude numeric(9,6) NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude numeric(9,6) NOT NULL CHECK(longitude BETWEEN -180 AND 180)
);
CREATE TABLE transport.geofences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, center_id uuid NOT NULL REFERENCES transport.map_locations(id),
 radius_meters numeric(12,2) NOT NULL CHECK(radius_meters>0), active boolean NOT NULL DEFAULT true
);
CREATE TABLE transport.eta_estimates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES transport.trips(id),
 estimated_arrival_at timestamptz NOT NULL, calculated_at timestamptz NOT NULL DEFAULT now(), provider text NOT NULL
);
CREATE TABLE transport.request_status_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES transport.transport_requests(id),
 previous_status transport.transport_request_status, new_status transport.transport_request_status NOT NULL,
 actor_id text REFERENCES identity.users(id), occurred_at timestamptz NOT NULL DEFAULT now()
);

-- Publication and PublicationImage map to producto and producto_foto: no second catalog.
CREATE TABLE baney_catalog.auctions (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, product_id bigint NOT NULL REFERENCES baney_catalog.producto(id),
 opening_amount numeric(14,2) NOT NULL CHECK(opening_amount>=0), minimum_increment numeric(14,2) NOT NULL CHECK(minimum_increment>0),
 currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','OPEN','CLOSED','CANCELLED')),
 winner_bid_id uuid, CHECK(ends_at>starts_at)
);
CREATE TABLE baney_catalog.bids (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auction_id text NOT NULL REFERENCES baney_catalog.auctions(id),
 bidder_id text NOT NULL REFERENCES identity.users(id), amount numeric(14,2) NOT NULL CHECK(amount>0),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(auction_id,id)
);
ALTER TABLE baney_catalog.auctions ADD CONSTRAINT fk_auction_winner FOREIGN KEY(id,winner_bid_id)
 REFERENCES baney_catalog.bids(auction_id,id) DEFERRABLE INITIALLY IMMEDIATE;
CREATE TABLE baney_catalog.urgent_requests (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, requester_id text NOT NULL REFERENCES identity.users(id),
 category_id bigint REFERENCES baney_catalog.categoria(id), description text NOT NULL,
 budget numeric(14,2) NOT NULL CHECK(budget>=0), currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 required_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','FULFILLED','EXPIRED','CANCELLED'))
);
CREATE TABLE payments.payment_methods (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text NOT NULL REFERENCES identity.users(id),
 provider text NOT NULL, provider_token text NOT NULL, type text NOT NULL, last_four char(4),
 active boolean NOT NULL DEFAULT true, UNIQUE(provider,provider_token)
);
CREATE TABLE payments.payment_intents (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text NOT NULL REFERENCES identity.users(id),
 order_id bigint REFERENCES baney_order.pedido(id), request_id uuid REFERENCES transport.transport_requests(id),
 payment_method_id text REFERENCES payments.payment_methods(id), amount numeric(14,2) NOT NULL CHECK(amount>0),
 currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','AUTHORIZED','CAPTURED','FAILED','CANCELLED','REFUNDED','PARTIALLY_REFUNDED')),
 idempotency_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(order_id,request_id)=1)
);
CREATE TABLE payments.payment_transactions (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, intent_id text NOT NULL REFERENCES payments.payment_intents(id),
 provider text NOT NULL, provider_reference text NOT NULL, type text NOT NULL CHECK(type IN ('AUTHORIZE','CAPTURE','VOID','REFUND')),
 status text NOT NULL CHECK(status IN ('PENDING','SUCCEEDED','FAILED')), amount numeric(14,2) NOT NULL CHECK(amount>0),
 currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,provider_reference)
);
CREATE TABLE payments.refunds (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, intent_id text NOT NULL REFERENCES payments.payment_intents(id),
 transaction_id text UNIQUE REFERENCES payments.payment_transactions(id),
 amount numeric(14,2) NOT NULL CHECK(amount>0), reason text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SUCCEEDED','FAILED')),
 idempotency_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE baney_billing.billing_accounts (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text NOT NULL REFERENCES identity.users(id),
 legal_name text NOT NULL, tax_identifier text, billing_address text NOT NULL, currency char(3) NOT NULL,
 UNIQUE(user_id,currency), CHECK(currency ~ '^[A-Z]{3}$')
);
CREATE TABLE baney_caja.cash_registers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id bigint NOT NULL REFERENCES baney_caja.cuenta(id),
 name text NOT NULL, location text NOT NULL, active boolean NOT NULL DEFAULT true
);
CREATE TABLE baney_caja.cash_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), register_id uuid NOT NULL REFERENCES baney_caja.cash_registers(id),
 opened_by text NOT NULL REFERENCES identity.users(id), closed_by text REFERENCES identity.users(id),
 opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, opening_amount numeric(14,2) NOT NULL CHECK(opening_amount>=0),
 closing_amount numeric(14,2) CHECK(closing_amount>=0), CHECK(closed_at IS NULL OR closed_at>=opened_at)
);
CREATE UNIQUE INDEX uq_open_cash_session ON baney_caja.cash_sessions(register_id) WHERE closed_at IS NULL;
ALTER TABLE baney_caja.movimiento ADD COLUMN cash_session_id uuid REFERENCES baney_caja.cash_sessions(id);

CREATE TABLE communications.notification_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL, channel text NOT NULL CHECK(channel IN ('EMAIL','SMS','PUSH','IN_APP')),
 locale text NOT NULL DEFAULT 'es-DO', subject text, body text NOT NULL, version integer NOT NULL CHECK(version>0),
 UNIQUE(code,channel,locale,version)
);
CREATE TABLE communications.notification_preferences (
 user_id text REFERENCES identity.users(id), channel text CHECK(channel IN ('EMAIL','SMS','PUSH','IN_APP')),
 topic text, enabled boolean NOT NULL DEFAULT true, PRIMARY KEY(user_id,channel,topic)
);
CREATE TABLE communications.notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES identity.users(id),
 template_id uuid REFERENCES communications.notification_templates(id), channel text NOT NULL CHECK(channel IN ('EMAIL','SMS','PUSH','IN_APP')),
 payload jsonb NOT NULL, status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SENT','FAILED','READ')),
 idempotency_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
);
CREATE TABLE communications.delivery_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notification_id uuid NOT NULL REFERENCES communications.notifications(id),
 attempt integer NOT NULL CHECK(attempt>0), provider text NOT NULL, provider_reference text,
 status text NOT NULL CHECK(status IN ('SENT','FAILED')), error text, attempted_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(notification_id,attempt)
);
CREATE TABLE communications.conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid REFERENCES transport.transport_requests(id),
 order_id bigint REFERENCES baney_order.pedido(id), subject text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE communications.participants (
 conversation_id uuid REFERENCES communications.conversations(id), user_id text REFERENCES identity.users(id),
 joined_at timestamptz NOT NULL DEFAULT now(), left_at timestamptz, PRIMARY KEY(conversation_id,user_id)
);
CREATE TABLE communications.messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL, sender_id text NOT NULL,
 body text NOT NULL, sent_at timestamptz NOT NULL DEFAULT now(), edited_at timestamptz, deleted_at timestamptz,
 FOREIGN KEY(conversation_id,sender_id) REFERENCES communications.participants(conversation_id,user_id)
);
CREATE TABLE communications.attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES communications.messages(id),
 file_url text NOT NULL, mime_type text NOT NULL, bytes bigint NOT NULL CHECK(bytes>=0), sha256 char(64)
);

CREATE TABLE support.disputes (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, opened_by text NOT NULL REFERENCES identity.users(id),
 order_id bigint REFERENCES baney_order.pedido(id), request_id uuid REFERENCES transport.transport_requests(id),
 reason text NOT NULL, status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_REVIEW','RESOLVED','CLOSED','ESCALATED')),
 created_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, CHECK(num_nonnulls(order_id,request_id)=1)
);
CREATE TABLE support.claims (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dispute_id text NOT NULL REFERENCES support.disputes(id),
 claimant_id text NOT NULL REFERENCES identity.users(id), description text NOT NULL,
 requested_amount numeric(14,2) CHECK(requested_amount>=0), currency char(3) CHECK(currency ~ '^[A-Z]{3}$'),
 CHECK((requested_amount IS NULL)=(currency IS NULL))
);
CREATE TABLE support.evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dispute_id text NOT NULL REFERENCES support.disputes(id),
 uploaded_by text NOT NULL REFERENCES identity.users(id), file_url text NOT NULL, description text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE support.resolutions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dispute_id text NOT NULL UNIQUE REFERENCES support.disputes(id),
 resolved_by text NOT NULL REFERENCES identity.users(id), decision text NOT NULL, reasoning text NOT NULL,
 refund_id text REFERENCES payments.refunds(id), resolved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE support.slas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE,
 first_response_minutes integer NOT NULL CHECK(first_response_minutes>0), resolution_minutes integer NOT NULL CHECK(resolution_minutes>0)
);
CREATE TABLE support.tickets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requester_id text NOT NULL REFERENCES identity.users(id),
 dispute_id text REFERENCES support.disputes(id), sla_id uuid REFERENCES support.slas(id), subject text NOT NULL,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ASSIGNED','WAITING','RESOLVED','CLOSED')),
 created_at timestamptz NOT NULL DEFAULT now(), due_at timestamptz, closed_at timestamptz
);
CREATE TABLE support.ticket_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES support.tickets(id),
 agent_id text NOT NULL REFERENCES identity.users(id), assigned_at timestamptz NOT NULL DEFAULT now(), released_at timestamptz
);
CREATE UNIQUE INDEX uq_active_ticket_agent ON support.ticket_assignments(ticket_id) WHERE released_at IS NULL;
CREATE TABLE support.interactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES support.tickets(id),
 author_id text NOT NULL REFERENCES identity.users(id), body text NOT NULL, internal boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE governance.risk_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL, version integer NOT NULL CHECK(version>0),
 definition jsonb NOT NULL, active boolean NOT NULL DEFAULT false, UNIQUE(code,version)
);
CREATE TABLE governance.risk_assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES identity.users(id),
 payment_intent_id text REFERENCES payments.payment_intents(id), rule_id uuid REFERENCES governance.risk_rules(id),
 score numeric(5,4) NOT NULL CHECK(score BETWEEN 0 AND 1), findings jsonb NOT NULL,
 assessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE governance.fraud_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assessment_id uuid NOT NULL REFERENCES governance.risk_assessments(id),
 assigned_to text REFERENCES identity.users(id), status text NOT NULL CHECK(status IN ('OPEN','INVESTIGATING','CONFIRMED','DISMISSED')),
 opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz
);
CREATE TABLE governance.risk_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assessment_id uuid NOT NULL REFERENCES governance.risk_assessments(id),
 fraud_case_id uuid REFERENCES governance.fraud_cases(id), actor_id text REFERENCES identity.users(id),
 decision text NOT NULL CHECK(decision IN ('ALLOW','REVIEW','BLOCK')), reason text NOT NULL, decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE governance.audit_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id text REFERENCES identity.users(id), action text NOT NULL,
 entity_type text NOT NULL, entity_id text, correlation_id text, details jsonb NOT NULL DEFAULT '{}',
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE governance.access_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text REFERENCES identity.users(id), resource text NOT NULL,
 action text NOT NULL, allowed boolean NOT NULL, ip inet, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE governance.data_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), audit_entry_id uuid NOT NULL REFERENCES governance.audit_entries(id),
 field_name text NOT NULL, before_value jsonb, after_value jsonb
);
CREATE TABLE governance.consents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES identity.users(id),
 purpose text NOT NULL, policy_version text NOT NULL, granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 CHECK(revoked_at IS NULL OR revoked_at>=granted_at)
);
CREATE TABLE governance.data_subject_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES identity.users(id),
 type text NOT NULL CHECK(type IN ('ACCESS','EXPORT','RECTIFY','DELETE','RESTRICT')),
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','COMPLETED','REJECTED')),
 requested_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, resolution text
);
CREATE TABLE governance.retention_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_type text NOT NULL, version integer NOT NULL CHECK(version>0),
 retention_days integer NOT NULL CHECK(retention_days>0), action text NOT NULL CHECK(action IN ('DELETE','ANONYMIZE','ARCHIVE')),
 active boolean NOT NULL DEFAULT false, UNIQUE(entity_type,version)
);
CREATE TABLE governance.data_access_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject_id text NOT NULL REFERENCES identity.users(id),
 grantee_id text NOT NULL REFERENCES identity.users(id), scope text NOT NULL, purpose text NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, granted_at timestamptz NOT NULL DEFAULT now(), CHECK(expires_at>granted_at)
);
CREATE TABLE governance.taxpayers (
 rnc text PRIMARY KEY, user_id text UNIQUE REFERENCES identity.users(id), legal_name text NOT NULL,
 verification_status text NOT NULL DEFAULT 'PENDING' CHECK(verification_status IN ('PENDING','VERIFIED','REJECTED')),
 verified_at timestamptz
);
-- FiscalSequence, TaxDocument, FiscalSubmission already exist in billing.

CREATE TABLE education.courses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, description text,
 instructor_id text REFERENCES identity.users(id), status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','ARCHIVED'))
);
CREATE TABLE education.lessons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid NOT NULL REFERENCES education.courses(id),
 title text NOT NULL, position integer NOT NULL CHECK(position>0), content_url text NOT NULL, UNIQUE(course_id,position)
);
CREATE TABLE education.enrollments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid NOT NULL REFERENCES education.courses(id),
 user_id text NOT NULL REFERENCES identity.users(id), enrolled_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(course_id,user_id), UNIQUE(id,course_id)
);
CREATE TABLE education.assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid NOT NULL REFERENCES education.courses(id),
 title text NOT NULL, pass_score numeric(5,2) NOT NULL CHECK(pass_score BETWEEN 0 AND 100), UNIQUE(id,course_id)
);
CREATE TABLE education.assessment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assessment_id uuid NOT NULL, enrollment_id uuid NOT NULL, course_id uuid NOT NULL,
 score numeric(5,2) NOT NULL CHECK(score BETWEEN 0 AND 100), attempted_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(assessment_id,course_id) REFERENCES education.assessments(id,course_id),
 FOREIGN KEY(enrollment_id,course_id) REFERENCES education.enrollments(id,course_id)
);
CREATE TABLE education.certifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), enrollment_id uuid NOT NULL UNIQUE REFERENCES education.enrollments(id),
 certificate_number text NOT NULL UNIQUE, issued_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz, file_url text
);
CREATE TABLE analytics.metric_definitions (
 code text PRIMARY KEY, name text NOT NULL, unit text NOT NULL, description text NOT NULL
);
CREATE TABLE analytics.metric_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), metric_code text NOT NULL REFERENCES analytics.metric_definitions(code),
 value numeric NOT NULL, dimensions jsonb NOT NULL DEFAULT '{}', source_event_id text UNIQUE,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE analytics.dashboards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES identity.users(id),
 name text NOT NULL, layout jsonb NOT NULL
);
CREATE TABLE analytics.dashboard_metrics (
 dashboard_id uuid REFERENCES analytics.dashboards(id), metric_code text REFERENCES analytics.metric_definitions(code),
 PRIMARY KEY(dashboard_id,metric_code)
);
CREATE TABLE analytics.reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES identity.users(id),
 name text NOT NULL, definition jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE analytics.export_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid NOT NULL REFERENCES analytics.reports(id),
 requested_by text NOT NULL REFERENCES identity.users(id), format text NOT NULL CHECK(format IN ('CSV','XLSX','PDF')),
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','COMPLETED','FAILED','EXPIRED')),
 file_url text, expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform.configurations (key text PRIMARY KEY, description text NOT NULL);
CREATE TABLE platform.configuration_versions (
 configuration_key text REFERENCES platform.configurations(key), version integer CHECK(version>0), value jsonb NOT NULL,
 changed_by text NOT NULL REFERENCES identity.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(configuration_key,version)
);
CREATE TABLE platform.feature_flags (
 key text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, rules jsonb NOT NULL DEFAULT '{}',
 updated_by text REFERENCES identity.users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform.admin_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id text NOT NULL REFERENCES identity.users(id),
 audit_entry_id uuid REFERENCES governance.audit_entries(id), action text NOT NULL, reason text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform.schema_versions (
 version text PRIMARY KEY, description text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
);
