import { pool } from '../config/db.js';
import { ApiError } from '../utilities/ApiError.js';
import { ApiResponse } from '../utilities/ApiResponse.js';
import { asyncHandler } from '../utilities/asyncHandler.js';
import { logger } from '../utilities/logger.js';

// Get all buses
export const getAllBuses = asyncHandler(async (req, res) => {
    logger.info('Fetching all buses');
    
    try {
        const result = await pool.query('SELECT * FROM buses ORDER BY name');
        logger.info(`Found ${result.rows.length} buses`);
        
        return res
            .status(200)
            .json(new ApiResponse(200, result.rows, "Buses fetched successfully"));
    } catch (error) {
        logger.error('Error fetching buses', error);
        throw new ApiError(500, "Error fetching buses from database");
    }
});

// Get bus location
export const getBusLocation = asyncHandler(async (req, res) => {
    const busId = req.params.id;
    logger.info(`Fetching location for bus ID: ${busId}`);
    
    try {
        // Get the most recent location
        const result = await pool.query(
            'SELECT * FROM locations WHERE bus_id = $1 ORDER BY timestamp DESC LIMIT 1',
            [busId]
        );
        
        if (result.rows.length === 0) {
            logger.info(`No location found for bus ID: ${busId}`);
            return res
                .status(500)
                .json(new ApiResponse(404, null, "Bus location not found"));
        }
        
        logger.info(`Location found for bus ID: ${busId}`);
        return res
            .status(200)
            .json(new ApiResponse(200, result.rows[0], "Bus location fetched successfully"));
    } catch (error) {
        logger.error(`Error fetching location for bus ID: ${busId}`, error);
        throw new ApiError(500, "Error fetching bus location from database");
    }
});

// Get bus location only (for background updates without affecting routes)
export const getBusLocationOnly = asyncHandler(async (req, res) => {
    const busId = req.params.id;
    logger.info(`Fetching minimal location data for bus ID: ${busId}`);
    
    try {
        // Get the most recent location only
        const result = await pool.query(
            'SELECT latitude, longitude, timestamp FROM locations WHERE bus_id = $1 ORDER BY timestamp DESC LIMIT 1',
            [busId]
        );
        
        if (result.rows.length === 0) {
            logger.info(`No location found for bus ID: ${busId}`);
            return res
                .status(404)
                .json(new ApiResponse(404, null, "Bus location not found"));
        }
        
        logger.info(`Minimal location data found for bus ID: ${busId}`);
        return res
            .status(200)
            .json(new ApiResponse(200, result.rows[0], "Bus location fetched successfully"));
    } catch (error) {
        logger.error(`Error fetching minimal location for bus ID: ${busId}`, error);
        throw new ApiError(500, "Error fetching bus location from database");
    }
});

// Get bus route information with ETAs for all stops
export const getBusRoute = asyncHandler(async (req, res) => {
    const busId = req.params.id;
    logger.info(`Fetching route for bus ID: ${busId}`);
    
    try {
        // Get all stops for this bus
        const stopResult = await pool.query(
            `SELECT r.stop_order, r.time_from_start, bs.id, bs.name, bs.latitude, bs.longitude 
             FROM routes r 
             JOIN bus_stops bs ON r.bus_stop_id = bs.id 
             WHERE r.bus_id = $1 
             ORDER BY r.stop_order`,
            [busId]
        );
        
        if (stopResult.rows.length === 0) {
            logger.info(`No route found for bus ID: ${busId}`);
            return res
                .status(404)
                .json(new ApiResponse(404, null, "Bus route not found"));
        }
        
        // Get the most recent location
        const locationResult = await pool.query(
            'SELECT * FROM locations WHERE bus_id = $1 ORDER BY timestamp DESC LIMIT 1',
            [busId]
        );
        
        // Get the current trip (rep) number of the bus
        const busInfoResult = await pool.query(
            'SELECT currentRep, stops_cleared FROM buses WHERE id = $1',
            [busId]
        );
        
        const currentRep = busInfoResult.rows[0]?.currentRep || 1;
        const stopsCleared = parseInt(busInfoResult.rows[0]?.stops_cleared || 0);
        
        // // Debug logging for stops_cleared
        // console.log("BACKEND - BUS ID:", busId);
        // console.log("BACKEND - STOPS_CLEARED:", stopsCleared);
        // console.log("BACKEND - STOPS ARRAY:", stopResult.rows);
        
        // Get the start time for the current trip
        const startTimeResult = await pool.query(
            'SELECT start_time FROM bus_start_time WHERE bus_id = $1 AND rep_no = $2',
            [busId, currentRep]
        );
        
        let startTime = null;
        if (startTimeResult.rows.length > 0) {
            startTime = startTimeResult.rows[0].start_time;
        } else {
            // If no start time found for current rep, use current time as fallback
            startTime = new Date().toTimeString().split(' ')[0];
            // logger.info(`No start time found for bus ID: ${busId}, rep: ${currentRep}. Using current time.`);
        }
        
        let currentStop = null;
        let nextStop = null;
        
        if (locationResult.rows.length > 0) {
            const location = locationResult.rows[0];
            const stops = stopResult.rows;
            
            // Determine current and next stop based on location
            let minDistance = Infinity;
            let closestStopIndex = 0;
            
            for (let i = 0; i < stops.length; i++) {
                const stop = stops[i];
                const distance = calculateDistance(
                    parseFloat(location.latitude), 
                    parseFloat(location.longitude),
                    parseFloat(stop.latitude),
                    parseFloat(stop.longitude)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestStopIndex = i;
                }
            }
            
            currentStop = stops[closestStopIndex];
            
            // Next stop is the one after the closest
            nextStop = stops[(closestStopIndex + 1) % stops.length];
            
            // Calculate estimated arrival times for all stops
            const now = new Date();
            const currentTime = new Date();
            
            // Parse the start time
            const [startHours, startMinutes, startSeconds] = startTime.split(':').map(Number);
            const startTimeDate = new Date();
            startTimeDate.setHours(startHours, startMinutes, startSeconds, 0);
            
            // If start time is in the future (for next day's first trip), adjust the date
            if (startTimeDate > now) {
                startTimeDate.setDate(startTimeDate.getDate() - 1);
            }
            
            // Calculate ETAs for all stops
            stops.forEach(stop => {
                // Calculate ETA based on start time + time_from_start
                const etaDate = new Date(startTimeDate);
                const timeFromStartMinutes = parseFloat(stop.time_from_start);
                etaDate.setMinutes(etaDate.getMinutes() + timeFromStartMinutes);
                
                // Format time as HH:MM
                const hours = etaDate.getHours().toString().padStart(2, '0');
                const minutes = etaDate.getMinutes().toString().padStart(2, '0');
                const formattedTime = `${hours}:${minutes}`;
                
                // Only calculate minutes from now, but don't mark as "Passed"
                // Let the frontend handle that based on stops_cleared
                const diffInMinutes = Math.max(0, Math.round((etaDate - currentTime) / 60000));
                stop.eta_minutes = diffInMinutes;
                stop.eta_time = formattedTime;
            });
        }
        
        const routeData = {
            stops: stopResult.rows,
            currentStop,
            nextStop,
            currentRep,
            bus: {
                id: busId,
                stops_cleared: stopsCleared  // Explicitly include stops_cleared in response
            }
        };
        
        // Debug log final route data
        // console.log("BACKEND - FINAL ROUTE DATA:", {
        //     busId,
        //     stopsCleared,
        //     totalStops: stopResult.rows.length,
        //     currentStop: routeData.currentStop?.name,
        //     nextStop: routeData.nextStop?.name
        // });
        
        // logger.info(`Route found for bus ID: ${busId} with ${stopResult.rows.length} stops`);
        return res
            .status(200)
            .json(new ApiResponse(200, routeData, "Bus route fetched successfully"));
    } catch (error) {
        // logger.error(`Error fetching route for bus ID: ${busId}`, error);
        throw new ApiError(500, "Error fetching bus route from database");
    }
});

// Get bus information including driver and more accurate ETA
export const getBusInfo = asyncHandler(async (req, res) => {
    const busId = req.params.id;
    // logger.info(`Fetching info for bus ID: ${busId}`);
    
    try {
        // Get bus details with driver information
        const result = await pool.query(
            `SELECT b.id, b.name, b.currentRep, u.username as driver_name, 
                    bd.user_id as driver_id
             FROM buses b
             LEFT JOIN bus_drivers bd ON b.id = bd.bus_id
             LEFT JOIN users u ON bd.user_id = u.id
             WHERE b.id = $1`,
            [busId]
        );
        
        if (result.rows.length === 0) {
            // logger.info(`No info found for bus ID: ${busId}`);
            return res
                .status(404)
                .json(new ApiResponse(404, null, "Bus info not found"));
        }
        
        // Get current location and route info
        const locationResult = await pool.query(
            'SELECT * FROM locations WHERE bus_id = $1 ORDER BY timestamp DESC LIMIT 1',
            [busId]
        );
        
        const routeResult = await pool.query(
            `SELECT r.stop_order, r.time_from_start, bs.id, bs.name, bs.latitude, bs.longitude 
             FROM routes r 
             JOIN bus_stops bs ON r.bus_stop_id = bs.id 
             WHERE r.bus_id = $1 
             ORDER BY r.stop_order`,
            [busId]
        );
        
        // Get start time for current trip
        const currentRep = result.rows[0].currentrep || 1;
        const startTimeResult = await pool.query(
            'SELECT start_time FROM bus_start_time WHERE bus_id = $1 AND rep_no = $2',
            [busId, currentRep]
        );
        
        let startTime = null;
        if (startTimeResult.rows.length > 0) {
            startTime = startTimeResult.rows[0].start_time;
        }
        
        let estimatedArrival = null;
        let nextStopName = null;
        let nextStopId = null;
        
        if (locationResult.rows.length > 0 && routeResult.rows.length > 0 && startTime) {
            const location = locationResult.rows[0];
            const stops = routeResult.rows;
            
            // Find closest stop (likely the last stop passed)
            let minDistance = Infinity;
            let closestStopIndex = 0;
            
            for (let i = 0; i < stops.length; i++) {
                const stop = stops[i];
                const distance = calculateDistance(
                    parseFloat(location.latitude), 
                    parseFloat(location.longitude),
                    parseFloat(stop.latitude),
                    parseFloat(stop.longitude)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestStopIndex = i;
                }
            }
            
            // Get next stop
            const nextStopIndex = (closestStopIndex + 1) % stops.length;
            const nextStop = stops[nextStopIndex];
            nextStopName = nextStop.name;
            nextStopId = nextStop.id;
            
            // Calculate ETA based on start time and time_from_start
            const now = new Date();
            
            // Parse the start time
            const [startHours, startMinutes, startSeconds] = startTime.split(':').map(Number);
            const startTimeDate = new Date();
            startTimeDate.setHours(startHours, startMinutes, startSeconds, 0);
            
            // If start time is in the future (for next day's first trip), adjust the date
            if (startTimeDate > now) {
                startTimeDate.setDate(startTimeDate.getDate() - 1);
            }
            
            // Calculate ETA based on start time + time_from_start for next stop
            const etaDate = new Date(startTimeDate);
            const timeFromStartMinutes = parseFloat(nextStop.time_from_start);
            etaDate.setMinutes(etaDate.getMinutes() + timeFromStartMinutes);
            
            // Calculate minutes from now
            estimatedArrival = Math.max(1, Math.round((etaDate - now) / 60000));
            
            // If ETA is unreasonably high (e.g., over 60 minutes), fall back to distance-based calculation
            if (estimatedArrival > 60) {
                // Calculate estimated arrival time (simplified)
                // Assume average speed of 20 km/h (5.56 m/s)
                const averageSpeed = 5.56; // meters per second
                
                const distanceToNextStop = calculateDistance(
                    parseFloat(location.latitude), 
                    parseFloat(location.longitude),
                    parseFloat(nextStop.latitude),
                    parseFloat(nextStop.longitude)
                );
                
                // Convert distance (in meters) to time (in minutes)
                estimatedArrival = Math.round(distanceToNextStop / averageSpeed / 60);
            }
        }
        
        const busInfo = {
            ...result.rows[0],
            driverName: result.rows[0].driver_name,
            estimatedArrival,
            nextStopName,
            nextStopId
        };
        
        // logger.info(`Info found for bus ID: ${busId}`);
        return res
            .status(200)
            .json(new ApiResponse(200, busInfo, "Bus info fetched successfully"));
    } catch (error) {
        // logger.error(`Error fetching info for bus ID: ${busId}`, error);
        throw new ApiError(500, "Error fetching bus info from database");
    }
});

// Helper function to calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
}
