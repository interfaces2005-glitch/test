ALTER TABLE staff ADD COLUMN IF NOT EXISTS whatsapp_phone text NOT NULL DEFAULT '';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS phone_key text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS notify_whatsapp boolean NOT NULL DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_amount numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_paid numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_required';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_deadline timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_note text NOT NULL DEFAULT '';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS has_receipt boolean NOT NULL DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS receipt_mime text;
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_deposit_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_deposit_check CHECK(deposit_amount>=0 AND deposit_amount<=price AND deposit_paid>=0 AND deposit_paid<=deposit_amount);
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_payment_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_payment_status_check CHECK(payment_status IN ('not_required','awaiting_transfer','review','paid','rejected','expired'));
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check CHECK(status IN ('held','expired','new','confirmed','completed','cancelled','no_show','pending_payment','payment_review'));
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_check CHECK(start>=540 AND "end"<=1200 AND start<"end");
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_check;
ALTER TABLE schedules ADD CONSTRAINT schedules_check CHECK(start>=540 AND "end"<=1200 AND start<"end");
ALTER TABLE schedules ALTER COLUMN start SET DEFAULT 540;
CREATE TABLE IF NOT EXISTS clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,phone text NOT NULL UNIQUE CHECK(phone ~ '^996[0-9]{9}$'),source text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS payment_receipts(appointment_id uuid PRIMARY KEY REFERENCES appointments(id),mime text NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp','application/pdf')),data bytea NOT NULL CHECK(octet_length(data)<=6291456),created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_payment_per_phone ON appointments(phone_key) WHERE status IN ('pending_payment','payment_review');
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS audience text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS provider_message_id text;
CREATE TABLE IF NOT EXISTS app_migrations(key text PRIMARY KEY);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_migrations WHERE key='payments-nine-am-v1') THEN
  UPDATE schedules SET start=540 WHERE start=600;
  UPDATE appointments SET phone_key=regexp_replace(phone,'[^0-9]','','g') WHERE phone IS NOT NULL;
  INSERT INTO clients(name,phone,source) SELECT DISTINCT ON (phone_key) name,phone_key,'legacy' FROM appointments WHERE status IN ('confirmed','completed') AND phone_key ~ '^996[0-9]{9}$' AND name IS NOT NULL ORDER BY phone_key,created_at DESC ON CONFLICT(phone) DO NOTHING;
  UPDATE site_content SET content=jsonb_set(content,'{hours}','"Ежедневно, 09:00–20:00"'::jsonb) WHERE content->>'hours'='Ежедневно, 10:00–20:00';
  INSERT INTO app_migrations VALUES('payments-nine-am-v1');
 END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_migrations WHERE key='studio-prices-1800-2000-v1') THEN
  UPDATE services SET price=CASE id WHEN 1 THEN 1800 WHEN 2 THEN 2000 END WHERE id IN (1,2);
  INSERT INTO app_migrations VALUES('studio-prices-1800-2000-v1');
 END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_migrations WHERE key='studio-hero-madina-20261113-v1') THEN
  UPDATE site_content SET revision=revision+1,updated_at=now(),content=jsonb_set(content,'{hero,image}','"/images/hero-madina-reference.svg"'::jsonb) WHERE content#>>'{hero,image}' IN ('/images/beauty.jpg','/images/hero.jpg');
  INSERT INTO app_migrations VALUES('studio-hero-madina-20261113-v1');
 END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_migrations WHERE key='studio-team-20261113-v1') THEN
  UPDATE staff SET name='Мадина' WHERE id=1 AND name IN ('Анна','Мадина');
  UPDATE staff SET name='Мия' WHERE id=2 AND name IN ('Мария','Мия демо','Мия');
  UPDATE staff SET image='/images/master-madina-reference.svg' WHERE id=1 AND image='/images/anna.jpg';
  UPDATE staff SET image='/images/master-mia-reference.svg' WHERE id=2 AND image='/images/maria.jpg';
  INSERT INTO app_migrations VALUES('studio-team-20261113-v1');
 END IF;
END $$;
DO $$ DECLARE photo jsonb; BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_migrations WHERE key='studio-portfolio-20261113-v2') THEN
  FOR photo IN SELECT value FROM jsonb_array_elements('[{"id":"madinlashes-20261113-01","image":"/images/portfolio-reference-01.svg","title":"Наращивание","category":"extensions","visible":true},{"id":"madinlashes-20261113-02","image":"/images/portfolio-reference-02.svg","title":"Наращивание","category":"extensions","visible":true},{"id":"madinlashes-20261113-03","image":"/images/work-20261113-03.jpg","title":"Наращивание","category":"extensions","visible":true},{"id":"madinlashes-20261113-04","image":"/images/portfolio-reference-04.svg","title":"Наращивание","category":"extensions","visible":true}]'::jsonb) LOOP
   UPDATE site_content AS s SET revision=revision+1,updated_at=now(),content=jsonb_set(s.content,'{portfolio}',(SELECT jsonb_agg(CASE WHEN entry->>'id'=photo->>'id' THEN entry||jsonb_build_object('image',CASE WHEN entry->>'image'='/images/work-20261113-'||right(photo->>'id',2)||'.jpg' THEN photo->>'image' ELSE entry->>'image' END,'title',CASE WHEN entry->>'title' LIKE 'Работа MADINLASHES ·%' THEN photo->>'title' ELSE entry->>'title' END) ELSE entry END ORDER BY ord) FROM jsonb_array_elements(COALESCE(s.content->'portfolio','[]'::jsonb)) WITH ORDINALITY AS items(entry,ord))) WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(s.content->'portfolio','[]'::jsonb)) AS existing WHERE existing->>'id'=photo->>'id' AND (existing->>'title' LIKE 'Работа MADINLASHES ·%' OR existing->>'image'='/images/work-20261113-'||right(photo->>'id',2)||'.jpg' AND existing->>'image'<>photo->>'image'));
   UPDATE site_content SET revision=revision+1,updated_at=now(),content=jsonb_set(content,'{portfolio}',COALESCE(content->'portfolio','[]'::jsonb)||jsonb_build_array(photo)) WHERE jsonb_array_length(COALESCE(content->'portfolio','[]'::jsonb))<24 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(content->'portfolio','[]'::jsonb)) AS existing WHERE existing->>'id'=photo->>'id' OR existing->>'image'=photo->>'image');
  END LOOP;
  INSERT INTO app_migrations VALUES('studio-portfolio-20261113-v2');
 END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_migrations WHERE key='studio-address-105-3-v1') THEN
  UPDATE site_content SET revision=revision+1,updated_at=now(),content=jsonb_set(jsonb_set(content,'{address}','"ул. Исанова, 105/3"'::jsonb),'{addressNote}',to_jsonb(CASE WHEN content->>'addressNote'='Ориентировочный адрес · расположение уточняется' THEN '' ELSE COALESCE(content->>'addressNote','') END)) WHERE content->>'address'='ул. Исанова, 172';
  UPDATE notifications SET payload=replace(payload::text,'ул. Исанова, 172','ул. Исанова, 105/3')::jsonb WHERE sent_at IS NULL AND payload::text LIKE '%ул. Исанова, 172%' AND EXISTS(SELECT 1 FROM site_content WHERE content->>'address'='ул. Исанова, 105/3');
  INSERT INTO app_migrations VALUES('studio-address-105-3-v1');
 END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_migrations WHERE key='studio-owner-whatsapp-v1') THEN
  UPDATE site_content SET revision=revision+1,updated_at=now(),content=jsonb_set(content,'{booking}',COALESCE(content->'booking','{}'::jsonb)||'{"ownerWhatsapp":"+996 (999) 019-454","whatsappOwnerEnabled":true}'::jsonb) WHERE NOT(COALESCE(content->'booking','{}'::jsonb)?'ownerWhatsapp');
  INSERT INTO app_migrations VALUES('studio-owner-whatsapp-v1');
 END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_migrations WHERE key='studio-payment-qr-v1') THEN
  UPDATE site_content SET revision=revision+1,updated_at=now(),content=jsonb_set(content,'{booking}',COALESCE(content->'booking','{}'::jsonb)||'{"qrImage":"/images/payment-qr.jpg","recipient":"Мадина К. · +996 (999) 019-454","paymentNote":"Сохраните QR и откройте его из галереи в банковском приложении. Проверьте получателя: Мадина К. Переведите предоплату и загрузите чек ниже. Мастер подтвердит запись после проверки поступления."}'::jsonb) WHERE COALESCE(content->'booking'->>'qrImage','')='' AND COALESCE(content->'booking'->>'recipient','')='';
  INSERT INTO app_migrations VALUES('studio-payment-qr-v1');
 END IF;
END $$;
