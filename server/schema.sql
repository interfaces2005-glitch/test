CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE IF NOT EXISTS staff (id integer PRIMARY KEY, name text NOT NULL, role text NOT NULL, image text NOT NULL);
CREATE TABLE IF NOT EXISTS services (id integer PRIMARY KEY, title text NOT NULL, category text NOT NULL CHECK(category IN ('lashes','nails')), duration integer NOT NULL CHECK(duration BETWEEN 15 AND 600 AND duration % 15=0), price numeric(10,2) NOT NULL CHECK(price>=0), description text NOT NULL DEFAULT '', tag text NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS staff_services (staff_id integer REFERENCES staff(id), service_id integer REFERENCES services(id), PRIMARY KEY(staff_id,service_id));
CREATE TABLE IF NOT EXISTS schedules (staff_id integer REFERENCES staff(id), date date NOT NULL, start integer NOT NULL DEFAULT 600, "end" integer NOT NULL DEFAULT 1200, off boolean NOT NULL DEFAULT false, breaks jsonb NOT NULL DEFAULT '[{"start":840,"end":870}]', PRIMARY KEY(staff_id,date), CHECK(start>=600 AND "end"<=1200 AND start<"end"));
CREATE TABLE IF NOT EXISTS appointments (
 id uuid PRIMARY KEY, token_hash text NOT NULL, staff_id integer REFERENCES staff(id) NOT NULL,
 date date NOT NULL, start integer NOT NULL, "end" integer NOT NULL, service_ids integer[] NOT NULL, titles jsonb NOT NULL,
 price numeric(10,2) NOT NULL, status text NOT NULL CHECK(status IN ('held','expired','new','confirmed','completed','cancelled','no_show')),
 expires_at timestamptz, name text, phone text, comment text, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(start>=600 AND "end"<=1200 AND start<"end"),
 EXCLUDE USING gist (staff_id WITH =, date WITH =, int4range(start,"end",'[)') WITH &&) WHERE(status NOT IN ('expired','cancelled'))
);
CREATE INDEX IF NOT EXISTS appointments_date ON appointments(date,staff_id);
CREATE TABLE IF NOT EXISTS admin_sessions (token_hash text PRIMARY KEY, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (id uuid PRIMARY KEY, appointment_id uuid REFERENCES appointments(id), channel text NOT NULL, kind text NOT NULL, due_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, attempts integer NOT NULL DEFAULT 0, locked_until timestamptz, last_error text, UNIQUE(appointment_id,channel,kind));
