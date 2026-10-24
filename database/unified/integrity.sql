-- Integrity corrections identified while consolidating the sources.
SET search_path TO public;
ALTER TABLE transport.assignments ADD CONSTRAINT uq_assignment_request UNIQUE(id,request_id);
ALTER TABLE transport.transport_requests ADD CONSTRAINT fk_active_assignment
 FOREIGN KEY(active_assignment_id,id) REFERENCES transport.assignments(id,request_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE transport.trips ADD CONSTRAINT fk_trip_assignment_request
 FOREIGN KEY(assignment_id,request_id) REFERENCES transport.assignments(id,request_id);
ALTER TABLE transport.trips ADD CONSTRAINT uq_trip_route UNIQUE(route_id);
ALTER TABLE transport.trips ADD CONSTRAINT ck_trip_dates CHECK (
 (status NOT IN ('IN_PROGRESS','COMPLETED') OR started_at IS NOT NULL) AND
 (status <> 'COMPLETED' OR completed_at IS NOT NULL) AND
 (completed_at IS NULL OR completed_at>=started_at));
ALTER TABLE transport.assignments ADD COLUMN accepted_offer_id uuid REFERENCES transport.transport_offers(id);
ALTER TABLE transport.transport_offers ADD CONSTRAINT uq_offer_context UNIQUE(id,request_id,carrier_id);
ALTER TABLE transport.transport_offers ADD CONSTRAINT fk_counteroffer_context
 FOREIGN KEY(parent_offer_id,request_id,carrier_id) REFERENCES transport.transport_offers(id,request_id,carrier_id);
ALTER TABLE transport.transport_offers ADD CONSTRAINT ck_offer_not_self CHECK(parent_offer_id<>id);
ALTER TABLE transport.transport_exceptions ADD CONSTRAINT ck_exception_resolution CHECK(resolved_at IS NULL OR resolved_at>=occurred_at);
ALTER TABLE transport.vehicles ADD CONSTRAINT ck_normalized_plate
 CHECK(registration_number_normalized=upper(regexp_replace(registration_number,'[[:space:]-]','','g')) AND length(registration_number_normalized)>0);
ALTER TABLE transport.transport_requests ADD COLUMN pricing_rule_id uuid REFERENCES transport.pricing_rules(id);
ALTER TABLE baney_catalog.resena DROP CONSTRAINT uq_resena_una_por_compra;
ALTER TABLE baney_catalog.resena ADD CONSTRAINT uq_resena_una_por_compra
 UNIQUE NULLS NOT DISTINCT(tipo,pedido_uid,producto_id,vendedor_id);
ALTER TABLE baney_catalog.resena DROP CONSTRAINT ck_resena_destino;
ALTER TABLE baney_catalog.resena ADD CONSTRAINT ck_resena_destino CHECK(
 (tipo='producto' AND producto_id IS NOT NULL AND vendedor_id IS NULL) OR
 (tipo='vendedor' AND vendedor_id IS NOT NULL AND producto_id IS NULL));
ALTER TABLE baney_caja.cuenta DROP CONSTRAINT uq_cuenta_titular;
ALTER TABLE baney_caja.cuenta ADD CONSTRAINT uq_cuenta_titular UNIQUE NULLS NOT DISTINCT(titular_tipo,titular_uid,moneda);
ALTER TABLE baney_caja.cuenta ADD CONSTRAINT ck_account_holder CHECK((titular_tipo='plataforma')=(titular_uid IS NULL));
ALTER TABLE baney_caja.cuenta_bancaria ADD CONSTRAINT uq_bank_account_owner UNIQUE(id,cuenta_id);
ALTER TABLE baney_caja.payout ADD CONSTRAINT fk_payout_bank_owner FOREIGN KEY(cuenta_bancaria_id,cuenta_id)
 REFERENCES baney_caja.cuenta_bancaria(id,cuenta_id);
ALTER TABLE baney_caja.payout ADD CONSTRAINT ck_payout_net CHECK(comision_retiro>=0 AND monto_neto=monto-comision_retiro);
ALTER TABLE baney_order.suborden_item ADD CONSTRAINT ck_dispatched_quantity CHECK(cantidad_despachada<=cantidad AND cantidad_devuelta<=cantidad_despachada);
ALTER TABLE baney_catalog.descuento ADD CONSTRAINT ck_discount_percent CHECK(tipo<>'porcentaje' OR valor<=100);
ALTER TABLE baney_catalog.cupon ADD CONSTRAINT ck_coupon_limits CHECK(usos_max IS NULL OR usos_actuales<=usos_max);
ALTER TABLE baney_catalog.cupon ADD CONSTRAINT ck_coupon_value CHECK(valor>=0 AND (tipo<>'porcentaje' OR valor<=100));

CREATE FUNCTION platform.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_ARGV[0]='actualizado_en' THEN NEW.actualizado_en=clock_timestamp();
 ELSE NEW.updated_at=clock_timestamp(); END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT table_schema,table_name,column_name FROM information_schema.columns
 WHERE table_schema NOT IN ('public','pg_catalog','information_schema')
 AND column_name IN ('updated_at','actualizado_en') LOOP
 EXECUTE format('CREATE TRIGGER touch_updated BEFORE UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at(%L)',
 r.table_schema,r.table_name,r.column_name);
 END LOOP;
END $$;

CREATE FUNCTION transport.guard_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d transport.driver_profiles; v transport.vehicles; o transport.transport_offers;
BEGIN
 IF NEW.status='ACTIVE' AND NEW.deleted_at IS NULL THEN
  SELECT * INTO d FROM transport.driver_profiles WHERE id=NEW.driver_profile_id FOR UPDATE;
  SELECT * INTO v FROM transport.vehicles WHERE id=NEW.vehicle_id FOR UPDATE;
  IF d.id IS NULL OR v.id IS NULL OR d.status<>'ENABLED' OR v.status<>'ENABLED' OR d.deleted_at IS NOT NULL OR v.deleted_at IS NOT NULL THEN
   RAISE EXCEPTION 'Assignment requires enabled driver and vehicle' USING ERRCODE='23514';
  END IF;
  IF NEW.accepted_offer_id IS NOT NULL THEN
   SELECT * INTO o FROM transport.transport_offers WHERE id=NEW.accepted_offer_id FOR UPDATE;
   IF o.id IS NULL OR o.request_id<>NEW.request_id OR o.carrier_id<>d.user_id OR o.status<>'ACCEPTED'
     OR o.deleted_at IS NOT NULL OR (o.vehicle_id IS NOT NULL AND o.vehicle_id<>NEW.vehicle_id) THEN
    RAISE EXCEPTION 'Assignment and accepted offer must agree' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_assignment BEFORE INSERT OR UPDATE ON transport.assignments FOR EACH ROW EXECUTE FUNCTION transport.guard_assignment();
CREATE FUNCTION transport.guard_trip() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a transport.assignments;
BEGIN
 IF NEW.status IN ('PLANNED','IN_PROGRESS') THEN
  SELECT * INTO a FROM transport.assignments WHERE id=NEW.assignment_id FOR SHARE;
  IF a.id IS NULL OR a.request_id<>NEW.request_id OR a.status<>'ACTIVE' OR a.deleted_at IS NOT NULL THEN
   RAISE EXCEPTION 'Planned/running trip requires an active assignment of the same request' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_trip BEFORE INSERT OR UPDATE ON transport.trips FOR EACH ROW EXECUTE FUNCTION transport.guard_trip();
CREATE FUNCTION transport.check_active_pointer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid; r transport.transport_requests; aid uuid;
BEGIN
 IF TG_TABLE_NAME='transport_requests' THEN rid=NEW.id; ELSE rid=NEW.request_id; END IF;
 SELECT * INTO r FROM transport.transport_requests WHERE id=rid FOR UPDATE;
 SELECT id INTO aid FROM transport.assignments WHERE request_id=rid AND status='ACTIVE' AND deleted_at IS NULL;
 IF r.active_assignment_id IS DISTINCT FROM aid THEN
  RAISE EXCEPTION 'Set active_assignment_id and assignment status in the same transaction' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER active_pointer_request AFTER INSERT OR UPDATE ON transport.transport_requests
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION transport.check_active_pointer();
CREATE CONSTRAINT TRIGGER active_pointer_assignment AFTER INSERT OR UPDATE ON transport.assignments
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION transport.check_active_pointer();
CREATE FUNCTION transport.record_request_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
 INSERT INTO transport.request_status_history(request_id,new_status) VALUES(NEW.id,NEW.status);
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
 INSERT INTO transport.request_status_history(request_id,previous_status,new_status) VALUES(NEW.id,OLD.status,NEW.status);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER record_status AFTER INSERT OR UPDATE ON transport.transport_requests FOR EACH ROW EXECUTE FUNCTION transport.record_request_status();

CREATE FUNCTION platform.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Append-only table: use a compensating record' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_movements BEFORE UPDATE OR DELETE ON baney_caja.movimiento FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON governance.audit_entries FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
CREATE TRIGGER immutable_cash_audit BEFORE UPDATE OR DELETE ON baney_caja.auditoria FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
CREATE FUNCTION baney_caja.post_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c baney_caja.cuenta; s baney_caja.saldo_cuenta;
BEGIN
 SELECT * INTO c FROM baney_caja.cuenta WHERE id=NEW.cuenta_id FOR UPDATE;
 IF c.id IS NULL OR c.estado<>'activa' OR c.moneda<>NEW.moneda THEN
  RAISE EXCEPTION 'Active account and matching currency required' USING ERRCODE='23514';
 END IF;
 INSERT INTO baney_caja.saldo_cuenta(cuenta_id) VALUES(NEW.cuenta_id) ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM baney_caja.saldo_cuenta WHERE cuenta_id=NEW.cuenta_id FOR UPDATE;
 NEW.saldo_despues=s.total+NEW.monto;
 RETURN NEW;
END $$;
CREATE FUNCTION baney_caja.update_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE baney_caja.saldo_cuenta SET
 disponible=disponible+CASE WHEN NEW.estado_fondos='disponible' THEN NEW.monto ELSE 0 END,
 pendiente=pendiente+CASE WHEN NEW.estado_fondos='pendiente' THEN NEW.monto ELSE 0 END,
 retenido=retenido+CASE WHEN NEW.estado_fondos='retenido' THEN NEW.monto ELSE 0 END,
 ultimo_movimiento_id=NEW.id WHERE cuenta_id=NEW.cuenta_id;
 RETURN NEW;
END $$;
CREATE TRIGGER post_movement BEFORE INSERT ON baney_caja.movimiento FOR EACH ROW EXECUTE FUNCTION baney_caja.post_movement();
CREATE TRIGGER update_balance AFTER INSERT ON baney_caja.movimiento FOR EACH ROW EXECUTE FUNCTION baney_caja.update_balance();

CREATE FUNCTION baney_catalog.guard_bid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a baney_catalog.auctions; highest numeric;
BEGIN
 SELECT * INTO a FROM baney_catalog.auctions WHERE id=NEW.auction_id FOR UPDATE;
 IF a.id IS NULL OR a.status<>'OPEN' OR clock_timestamp()<a.starts_at OR clock_timestamp()>=a.ends_at THEN
  RAISE EXCEPTION 'Auction is not open' USING ERRCODE='23514';
 END IF;
 SELECT max(amount) INTO highest FROM baney_catalog.bids WHERE auction_id=NEW.auction_id;
 IF NEW.amount<coalesce(highest+a.minimum_increment,a.opening_amount) THEN
  RAISE EXCEPTION 'Bid is below the required amount' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_bid BEFORE INSERT ON baney_catalog.bids FOR EACH ROW EXECUTE FUNCTION baney_catalog.guard_bid();
CREATE TRIGGER immutable_bid BEFORE UPDATE OR DELETE ON baney_catalog.bids FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

-- Every FK gets an index when no existing index has the same leading columns.
DO $$ DECLARE r record; fields text; BEGIN
 FOR r IN SELECT c.oid,c.conrelid,c.conkey,n.nspname,t.relname FROM pg_constraint c
 JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
 WHERE c.contype='f' LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=r.conrelid AND i.indpred IS NULL
 AND (i.indkey::smallint[])[0:array_length(r.conkey,1)-1]=r.conkey) THEN
  SELECT string_agg(quote_ident(a.attname),',' ORDER BY k.ord) INTO fields
  FROM unnest(r.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=r.conrelid AND a.attnum=k.num;
  EXECUTE format('CREATE INDEX %I ON %I.%I (%s)','ix_fk_'||r.oid,r.nspname,r.relname,fields);
 END IF;
 END LOOP;
END $$;

INSERT INTO identity.roles(code,description) VALUES
 ('CLIENT','Solicitante o comprador'),('CARRIER','Transportista'),('SELLER','Vendedor'),('ADMIN','Administración'),('SUPPORT','Soporte');
-- No passwords, demo users, tax authorizations or provider credentials are seeded.
