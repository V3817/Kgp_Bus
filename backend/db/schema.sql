-- Create schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS kgp_bus_track;

-- Set search path
SET search_path TO kgp_bus_track;

-- Create users table (renamed from user to avoid reserved keyword)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    password VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    rollno VARCHAR(20),
    role VARCHAR(100) NOT NULL DEFAULT 'user',
    check(role in ('user', 'admin', 'driver')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create bus stops table
CREATE TABLE IF NOT EXISTS bus_stops (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 6) NOT NULL,
    longitude DECIMAL(10, 6) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create buses table
CREATE TABLE IF NOT EXISTS buses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    stops_cleared INT DEFAULT 0,
    totalRep integer DEFAULT 1,
    currentRep integer DEFAULT 1
);

-- Create routes table (connecting buses and stops)
CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    bus_id INTEGER REFERENCES buses(id),
    bus_stop_id INTEGER REFERENCES bus_stops(id),
    stop_order INTEGER NOT NULL,
    UNIQUE(bus_id, bus_stop_id, stop_order),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_from_start DECIMAL(10, 2) NOT NULL DEFAULT 0
);

-- Create bus start time table
CREATE TABLE IF NOT EXISTS bus_start_time (
    bus_id INTEGER REFERENCES buses(id),
    start_time TIME DEFAULT CURRENT_TIME,
    rep_no INTEGER DEFAULT 1
);

-- Create bus drivers table
CREATE TABLE IF NOT EXISTS bus_drivers (
    user_id INTEGER REFERENCES users(id),
    bus_id INTEGER REFERENCES buses(id),
    UNIQUE (user_id, bus_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create user locations table
CREATE TABLE IF NOT EXISTS user_locations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    latitude DECIMAL(10, 6) NOT NULL,
    longitude DECIMAL(10, 6) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create locations table
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    bus_id INTEGER REFERENCES buses(id),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    latitude DECIMAL(10, 6) NOT NULL,
    longitude DECIMAL(10, 6) NOT NULL
);

-- Create index on timestamp for better performance
CREATE INDEX IF NOT EXISTS idx_locations_timestamp 
ON locations(timestamp);
