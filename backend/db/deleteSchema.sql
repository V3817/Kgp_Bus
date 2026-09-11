-- Set search path
SET search_path
TO kgp_bus_track;

-- Drop tables in reverse order (considering dependencies)
DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS user_locations;
DROP TABLE IF EXISTS bus_drivers;
DROP TABLE IF EXISTS bus_start_time;
DROP TABLE IF EXISTS routes;
DROP TABLE IF EXISTS buses;
DROP TABLE IF EXISTS bus_stops;
DROP TABLE IF EXISTS users;
DROP FUNCTION IF EXISTS clean_old_location_data;
DROP INDEX IF EXISTS idx_locations_timestamp;

-- Set search path
SET search_path TO kgp_bus_track;

-- Clear data from all tables in proper order (considering dependencies)
TRUNCATE TABLE locations CASCADE;
TRUNCATE TABLE user_locations CASCADE;
TRUNCATE TABLE bus_drivers CASCADE;
TRUNCATE TABLE bus_start_time CASCADE;
TRUNCATE TABLE routes CASCADE;
TRUNCATE TABLE buses CASCADE;
TRUNCATE TABLE bus_stops CASCADE;
TRUNCATE TABLE users CASCADE;

-- Optionally reset sequences if you have any
-- ALTER SEQUENCE [sequence_name] RESTART WITH 1;