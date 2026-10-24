-- Run against a newly initialized database with psql -v ON_ERROR_STOP=1.
-- All fixtures and helper functions are rolled back.
BEGIN;
CREATE FUNCTION pg_temp.rejects(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE=expected THEN RETURN; END IF;
  RAISE EXCEPTION 'Expected SQLSTATE %, received %: %; query: %',expected,SQLSTATE,SQLERRM,statement;
 END;
 RAISE EXCEPTION 'Expected rejection but statement succeeded: %',statement;
END $$;
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO identity.users(id,email,status) VALUES('test-buyer','buyer@example.test','ACTIVE'),('test-carrier','carrier@example.test','ACTIVE');
SELECT pg_temp.rejects($q$INSERT INTO identity.users(id,email) VALUES('duplicate','buyer@example.test')$q$,'23505');
SELECT pg_temp.rejects($q$INSERT INTO identity.users(id,email) VALUES('uppercase','BUYER@example.test')$q$,'23514');
INSERT INTO transport.driver_profiles(id,user_id,status) VALUES('10000000-0000-4000-8000-000000000001','test-carrier','ENABLED');
INSERT INTO transport.vehicles(id,owner_id,registration_number,registration_number_normalized,body_type,capacity_value,capacity_unit,capacity_kg,status)
 VALUES('20000000-0000-4000-8000-000000000001','test-carrier','L-123','L123','DUMP_TRUCK',20,'M3',10000,'ENABLED');
SELECT pg_temp.rejects($q$UPDATE transport.vehicles SET capacity_unit='FT'$q$,'23514');
SELECT pg_temp.rejects($q$UPDATE transport.vehicles SET owner_id='missing-user'$q$,'23503');
SELECT pg_temp.rejects($q$UPDATE transport.vehicles SET registration_number_normalized='L-123'$q$,'23514');
INSERT INTO transport.transport_requests(id,requester_id,idempotency_key,origin_address,origin_latitude,origin_longitude,
 destination_address,destination_latitude,destination_longitude,window_starts_at,window_ends_at)
 SELECT ('30000000-0000-4000-8000-00000000000'||n)::uuid,'test-buyer','key-'||n,'Origin',18,-69,'Destination',19,-70,now(),now()+interval '1 day'
 FROM generate_series(1,2) n;
SELECT pg_temp.rejects($q$UPDATE transport.transport_requests SET origin_latitude=100$q$,'23514');
SELECT pg_temp.rejects($q$UPDATE transport.transport_requests SET window_ends_at=window_starts_at$q$,'23514');
SELECT pg_temp.rejects($q$UPDATE transport.transport_requests SET idempotency_key='key-1' WHERE id='30000000-0000-4000-8000-000000000002'$q$,'23505');
INSERT INTO transport.transport_cargos(request_id,description,weight_kg) VALUES('30000000-0000-4000-8000-000000000001','Materials',100);
SELECT pg_temp.rejects($q$INSERT INTO transport.transport_cargos(request_id,description) VALUES('30000000-0000-4000-8000-000000000001','Duplicate')$q$,'23505');
INSERT INTO transport.transport_offers(id,request_id,carrier_id,vehicle_id,amount,currency,status,valid_until)
 VALUES('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','test-carrier','20000000-0000-4000-8000-000000000001',100,'DOP','SUBMITTED',now()+interval '1 day');
-- Regression: the original offer can become COUNTERED without a parent.
UPDATE transport.transport_offers SET status='COUNTERED' WHERE id='40000000-0000-4000-8000-000000000001';
INSERT INTO transport.transport_offers(id,request_id,carrier_id,amount,currency,status,valid_until,parent_offer_id,proposed_by,round)
 VALUES('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','test-carrier',110,'DOP','ACCEPTED',now()+interval '1 day','40000000-0000-4000-8000-000000000001','CLIENT',1);
SELECT pg_temp.rejects($q$UPDATE transport.transport_offers SET status='ACCEPTED' WHERE id='40000000-0000-4000-8000-000000000001'$q$,'23505');
SELECT pg_temp.rejects($q$UPDATE transport.transport_offers SET request_id='30000000-0000-4000-8000-000000000002' WHERE id='40000000-0000-4000-8000-000000000002'$q$,'23503');
UPDATE transport.driver_profiles SET status='SUSPENDED';
SELECT pg_temp.rejects($q$INSERT INTO transport.assignments(request_id,driver_profile_id,vehicle_id)
 VALUES('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001')$q$,'23514');
UPDATE transport.driver_profiles SET status='ENABLED';
INSERT INTO transport.assignments(id,request_id,driver_profile_id,vehicle_id,accepted_offer_id)
 VALUES('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002');
SELECT pg_temp.rejects($q$INSERT INTO transport.assignments(request_id,driver_profile_id,vehicle_id)
 VALUES('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001')$q$,'23505');
SELECT pg_temp.rejects('SET CONSTRAINTS ALL IMMEDIATE','23514');
UPDATE transport.transport_requests SET active_assignment_id='50000000-0000-4000-8000-000000000001',status='ASSIGNED'
 WHERE id='30000000-0000-4000-8000-000000000001';
SET CONSTRAINTS ALL IMMEDIATE;
INSERT INTO transport.trips(id,request_id,assignment_id) VALUES('60000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');
SELECT pg_temp.rejects($q$UPDATE transport.trips SET request_id='30000000-0000-4000-8000-000000000002'$q$,'23514');
SELECT pg_temp.rejects($q$UPDATE transport.trips SET status='IN_PROGRESS'$q$,'23514');
INSERT INTO transport.tracking_points(trip_id,source,source_point_id,latitude,longitude,recorded_at)
 VALUES('60000000-0000-4000-8000-000000000001','device-1','point-1',18,-69,now()),
 ('60000000-0000-4000-8000-000000000001','device-1','point-2',18,-69,now());
SELECT pg_temp.rejects($q$INSERT INTO transport.tracking_points(trip_id,source,source_point_id,latitude,longitude,recorded_at)
 VALUES('60000000-0000-4000-8000-000000000001','device-1','point-1',18,-69,now())$q$,'23505');

INSERT INTO baney_catalog.vendedor(uid,nombre_negocio,slug) VALUES('test-carrier','Test Seller','test-seller');
INSERT INTO baney_catalog.categoria(slug,nombre,ruta) VALUES('test','Test','/test/');
INSERT INTO baney_catalog.producto(uid,vendedor_id,categoria_id,nombre,slug)
 SELECT 'test-product',v.id,c.id,'Test product','test-product' FROM baney_catalog.vendedor v CROSS JOIN baney_catalog.categoria c;
INSERT INTO baney_catalog.variante(uid,producto_id,sku,precio) SELECT 'test-variant',id,'SKU-TEST',10 FROM baney_catalog.producto;
INSERT INTO baney_inventory.existencia(variante_uid,producto_uid,vendedor_uid,sku,disponible)
 VALUES('test-variant','test-product','test-carrier','SKU-TEST',5);
SELECT pg_temp.rejects('UPDATE baney_inventory.existencia SET disponible=-1','23514');
SELECT pg_temp.rejects($q$UPDATE baney_inventory.existencia SET variante_uid='missing'$q$,'23503');
INSERT INTO baney_catalog.auctions(id,product_id,opening_amount,minimum_increment,currency,starts_at,ends_at,status)
 SELECT 'test-auction',id,10,1,'DOP',now()-interval '1 hour',now()+interval '1 hour','OPEN' FROM baney_catalog.producto;
INSERT INTO baney_catalog.bids(auction_id,bidder_id,amount) VALUES('test-auction','test-buyer',10);
SELECT pg_temp.rejects($q$INSERT INTO baney_catalog.bids(auction_id,bidder_id,amount) VALUES('test-auction','test-buyer',10)$q$,'23514');
UPDATE baney_catalog.auctions SET status='CLOSED';
SELECT pg_temp.rejects($q$INSERT INTO baney_catalog.bids(auction_id,bidder_id,amount) VALUES('test-auction','test-buyer',20)$q$,'23514');
INSERT INTO baney_caja.cuenta(uid,titular_tipo,titular_uid,titular_nombre) VALUES('test-account','transportista','test-carrier','Carrier');
INSERT INTO baney_caja.movimiento(uid,cuenta_id,tipo,monto,saldo_despues,estado_fondos,fecha_valor,referencia_tipo,referencia_uid,descripcion)
 SELECT 'test-move',id,'flete',100,0,'disponible',current_date,'viaje','60000000-0000-4000-8000-000000000001','Test trip' FROM baney_caja.cuenta;
SELECT pg_temp.assert_true((SELECT total=100 AND disponible=100 FROM baney_caja.saldo_cuenta),'Ledger balance must be computed');
SELECT pg_temp.assert_true((SELECT saldo_despues=100 FROM baney_caja.movimiento),'Movement snapshot must be computed');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM baney_caja.v_descuadre_saldos),'Ledger must reconcile');
SELECT pg_temp.rejects('UPDATE baney_caja.movimiento SET monto=200','23514');
SELECT pg_temp.rejects('DELETE FROM baney_caja.movimiento','23514');
SELECT pg_temp.rejects($q$INSERT INTO baney_caja.movimiento(uid,cuenta_id,tipo,monto,saldo_despues,fecha_valor,referencia_tipo,referencia_uid,descripcion)
 SELECT 'duplicate-move',id,'flete',100,0,current_date,'viaje','60000000-0000-4000-8000-000000000001','Duplicate' FROM baney_caja.cuenta$q$,'23505');
SELECT pg_temp.assert_true((SELECT total=100 FROM baney_caja.saldo_cuenta),'Rejected movement must not change balance');
INSERT INTO payments.payment_intents(id,user_id,request_id,amount,currency,idempotency_key)
 VALUES('test-intent','test-buyer','30000000-0000-4000-8000-000000000001',100,'DOP','payment-key');
SELECT pg_temp.rejects($q$INSERT INTO payments.payment_intents(user_id,amount,currency,idempotency_key) VALUES('test-buyer',100,'DOP','no-obligation')$q$,'23514');
SELECT pg_temp.assert_true((SELECT count(*)>=3 FROM transport.request_status_history),'Request history must be recorded');
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
