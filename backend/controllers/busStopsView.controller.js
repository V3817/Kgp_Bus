// backend/controllers/busStopsView.controller.js

import { pool } from '../config/db.js';
import { ApiError } from '../utilities/ApiError.js';
import { ApiResponse } from '../utilities/ApiResponse.js';
import { asyncHandler } from '../utilities/asyncHandler.js';
import { logger } from '../utilities/logger.js';

// Get buses by From and To stops
export const getBusesByStops = asyncHandler(async (req, res) => {
    const { fromStopId, toStopId } = req.query;

    if (!fromStopId || !toStopId) {
        throw new ApiError(400, "Missing 'from' or 'to' stop ID");
    }

    logger.info(`Fetching buses between stops ${fromStopId} and ${toStopId}`);

    try {
        // Get buses with routes that include both stops, handling circular routes
        const result = await pool.query(`
            WITH BusRoutes AS (
                -- Get all buses that have both stops
                SELECT DISTINCT r1.bus_id
                FROM routes r1
                JOIN routes r2 ON r1.bus_id = r2.bus_id
                WHERE r1.bus_stop_id = $1 AND r2.bus_stop_id = $2
            ),
            FromStops AS (
                -- All occurrences of stop A for each qualifying bus
                SELECT r.bus_id, r.stop_order, r.time_from_start
                FROM routes r
                JOIN BusRoutes br ON r.bus_id = br.bus_id
                WHERE r.bus_stop_id = $1
            ),
            RouteSegments AS (
                -- For each occurrence of stop A, find all valid stop B's that follow
                SELECT 
                    fs.bus_id,
                    fs.stop_order AS from_order,
                    fs.time_from_start AS from_time,
                    r.stop_order AS to_order,
                    r.time_from_start AS to_time
                FROM FromStops fs
                JOIN routes r ON fs.bus_id = r.bus_id AND r.bus_stop_id = $2
                -- This finds B stops that come after the current A
                WHERE r.stop_order > fs.stop_order
                -- This handles circular routes by stopping at next A
                AND NOT EXISTS (
                    SELECT 1 FROM routes r2
                    WHERE r2.bus_id = fs.bus_id
                    AND r2.bus_stop_id = $1
                    AND r2.stop_order > fs.stop_order
                    AND r2.stop_order < r.stop_order
                )
            )
            -- Final SELECT that joins all needed data
            SELECT 
                b.id AS bus_id, 
                b.name AS bus_name,
                b.currentRep,
                b.totalRep,
                bst.start_time,
                bst.rep_no,
                fs.name AS from_stop_name,
                ts.name AS to_stop_name,
                fs.id AS from_stop_id,
                ts.id AS to_stop_id,
                rs.from_order,
                rs.to_order,
                rs.from_time,
                rs.to_time
            FROM RouteSegments rs
            JOIN buses b ON rs.bus_id = b.id
            JOIN bus_start_time bst ON b.id = bst.bus_id AND bst.rep_no = b.currentRep
            JOIN routes r1 ON rs.bus_id = r1.bus_id AND rs.from_order = r1.stop_order
            JOIN routes r2 ON rs.bus_id = r2.bus_id AND rs.to_order = r2.stop_order
            JOIN bus_stops fs ON r1.bus_stop_id = fs.id
            JOIN bus_stops ts ON r2.bus_stop_id = ts.id
            ORDER BY b.name, rs.from_order, rs.to_order
        `, [fromStopId, toStopId]);

        const buses = result.rows;

        if (buses.length === 0) {
            return res.status(404).json(new ApiResponse(404, null, "No buses found for this route"));
        }

        // Process the data for the frontend, with unique IDs for multiple segments per bus
        const busesWithTimes = buses.map((bus, index) => {
            // Calculate the actual times based on start_time and time_from_start
            const startTime = new Date(`1970-01-01T${bus.start_time}`);
            
            // Calculate from time
            const fromMinutes = parseFloat(bus.from_time || 0);
            const fromTime = new Date(startTime.getTime() + fromMinutes * 60000);
            
            // Calculate to time
            const toMinutes = parseFloat(bus.to_time || 0);
            const toTime = new Date(startTime.getTime() + toMinutes * 60000);
            
            return {
                id: bus.bus_id,
                displayId: `${bus.bus_id}-${bus.from_order}-${bus.to_order}`, // Unique ID for UI
                name: bus.bus_name,
                currentTrip: bus.currentrep,
                totalTrips: bus.totalrep,
                tripNumber: bus.rep_no,
                route: {
                    fromStop: {
                        id: bus.from_stop_id,
                        name: bus.from_stop_name,
                        order: bus.from_order
                    },
                    toStop: {
                        id: bus.to_stop_id,
                        name: bus.to_stop_name,
                        order: bus.to_order
                    }
                },
                times: {
                    busStart: bus.start_time,
                    departureTime: fromTime.toTimeString().substring(0, 5),
                    arrivalTime: toTime.toTimeString().substring(0, 5),
                    durationMinutes: Math.round((toTime - fromTime) / 60000)
                }
            };
        });

        logger.info(`Found ${busesWithTimes.length} route segments between stops ${fromStopId} and ${toStopId}`);
        return res.status(200).json(new ApiResponse(200, busesWithTimes, "Buses fetched successfully"));

    } catch (error) {
        logger.error("Error fetching buses by stops", error);
        throw new ApiError(500, "Error fetching buses from database");
    }
});

// Retrieve all bus stops from the database
export const getBusStops = asyncHandler(async (req, res) => {
    try {
        logger.info("Fetching all bus stops from database");
        
        // Make sure we're using the correct schema and table
        const result = await pool.query(`
            SELECT id, name, latitude, longitude 
            FROM kgp_bus_track.bus_stops 
            ORDER BY name;
        `);
        
        const stops = result.rows;
        
        logger.info(`Successfully fetched ${stops.length} bus stops`);
        
        // Add some sample data if no bus stops are found (for testing)
        if (stops.length === 0) {
            logger.warn("No bus stops found in database, adding sample data for testing");
            
            // Insert sample bus stops
            await pool.query(`
                INSERT INTO kgp_bus_track.bus_stops (name, latitude, longitude)
                VALUES 
                ('Main Gate', 22.3190, 87.3091),
                ('Technology Guest House', 22.3156, 87.3103),
                ('Hijli Hostel', 22.3312, 87.3072),
                ('Vikramshila', 22.3195, 87.3098),
                ('Library', 22.3177, 87.3055)
                ON CONFLICT DO NOTHING;
            `);
            
            // Fetch the newly inserted stops
            const newResult = await pool.query(`
                SELECT id, name, latitude, longitude 
                FROM kgp_bus_track.bus_stops 
                ORDER BY name;
            `);
            
            const newStops = newResult.rows;
            logger.info(`Added sample bus stops, now returning ${newStops.length} stops`);
            
            return res.status(200).json(new ApiResponse(200, newStops, "Sample bus stops created and fetched successfully"));
        }
        
        return res.status(200).json(new ApiResponse(200, stops, "Bus stops fetched successfully"));
    } catch (error) {
        logger.error("Error fetching bus stops:", error);
        throw new ApiError(500, "Error fetching bus stops from database");
    }
});