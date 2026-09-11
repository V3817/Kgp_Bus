import { pool } from '../config/db.js';
import { ApiError } from '../utilities/ApiError.js';
import { ApiResponse } from '../utilities/ApiResponse.js';
import { asyncHandler } from '../utilities/asyncHandler.js';
import { logger } from '../utilities/logger.js';

// Haversine formula to calculate distance between two lat/lon points
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

// Get bus route with stops, marking each stop as cleared or not based on stops_cleared from buses table
export const getBusRouteWithStops = asyncHandler(async (req, res) => {
  const busId = req.params.id;
  logger.info(`Fetching route with stops for bus ID: ${busId}`);

  try {
    // 1. Fetch all stops for this bus ordered by stop_order along with time_from_start
    const stopsResult = await pool.query(
      `SELECT r.stop_order, r.time_from_start, bs.id, bs.name, bs.latitude, bs.longitude 
       FROM routes r 
       JOIN bus_stops bs ON r.bus_stop_id = bs.id 
       WHERE r.bus_id = $1 
       ORDER BY r.stop_order`,
      [busId]
    );

    if (stopsResult.rows.length === 0) {
      logger.info(`No route found for bus ID: ${busId}`);
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Bus route not found"));
    }

    // 2. Fetch current repetition and stops_cleared from the buses table
    const busResult = await pool.query(
      `SELECT stops_cleared, currentRep FROM buses WHERE id = $1`,
      [busId]
    );

    let stopsCleared = 0;
    let currentRep = 1;
    if (busResult.rows.length > 0) {
      stopsCleared = parseInt(busResult.rows[0].stops_cleared || 0);
      currentRep = parseInt(busResult.rows[0].currentrep || 1);
    }

    // 3. Get the start time for this bus and repetition
    const startTimeResult = await pool.query(
      `SELECT start_time FROM bus_start_time 
       WHERE bus_id = $1 AND rep_no = $2 
       ORDER BY start_time DESC LIMIT 1`,
      [busId, currentRep]
    );

    let startTime = null;
    if (startTimeResult.rows.length > 0) {
      startTime = startTimeResult.rows[0].start_time;
    }

    // 4. Fetch the most recent location 
    const locationResult = await pool.query(
      `SELECT latitude, longitude, timestamp 
       FROM locations 
       WHERE bus_id = $1 
       ORDER BY timestamp DESC LIMIT 1`,
      [busId]
    );

    let currentStop = null;
    let nextStop = null;
    let estimatedArrival = null;

    const stops = stopsResult.rows;

    // Use stopsCleared as array index
    if (stops.length > 0) {
      if (stopsCleared === 0) {
        currentStop = null;
        nextStop = stops[0];
      } else {
        currentStop = stops[stopsCleared - 1] || null;
        nextStop = stops[stopsCleared % stops.length] || null;
      }
    }

    // If next stop exists, calculate estimated arrival using distance and average speed
    if (nextStop && locationResult.rows.length > 0) {
      const location = locationResult.rows[0];
      const avgSpeed = 5.56;  // average speed in meters per second (approx. 20 km/h)
      const distanceToNextStop = calculateDistance(
        parseFloat(location.latitude),
        parseFloat(location.longitude),
        parseFloat(nextStop.latitude),
        parseFloat(nextStop.longitude)
      );
      estimatedArrival = Math.round(distanceToNextStop / avgSpeed / 60); // ETA in minutes
    }

    // 5. Annotate each stop with a "cleared" property and estimated_time
    const stopsWithStatus = stops.map((stop, idx) => {
      const isCleared = idx < stopsCleared;
      let estimated_time = "Schedule pending";

      // If we have a start time, calculate the scheduled time for this stop
      if (startTime) {
        // Parse the start_time which is in HH:MM:SS format
        const [hours, minutes, seconds] = startTime.split(':').map(Number);

        // Create a Date object with today's date and the start time
        const stopDateTime = new Date();
        stopDateTime.setHours(hours, minutes, seconds);

        // Add the time_from_start (in minutes) to get the scheduled arrival time
        stopDateTime.setMinutes(stopDateTime.getMinutes() + parseFloat(stop.time_from_start));

        // Format the time as HH:MM
        const formattedTime = stopDateTime.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });

        if (isCleared) {
          estimated_time = `Cleared (${formattedTime})`;
        } else if (nextStop && stop.id === nextStop.id && estimatedArrival !== null) {
          estimated_time = `${estimatedArrival} min (${formattedTime})`;
        } else {
          estimated_time = formattedTime;
        }
      } else {
        // No start time available
        if (isCleared) {
          estimated_time = "Cleared";
        } else if (nextStop && stop.id === nextStop.id && estimatedArrival !== null) {
          estimated_time = `${estimatedArrival} min`;
        }
      }

      return {
        ...stop,
        cleared: isCleared,
        estimated_time: estimated_time
      };
    });

    // Update current and next stop references to include the new properties
    if (currentStop) {
      currentStop = stopsWithStatus.find(s => s.id === currentStop.id);
    }
    if (nextStop) {
      nextStop = stopsWithStatus.find(s => s.id === nextStop.id);
    }

    const routeData = {
      stops: stopsWithStatus,
      currentStop,
      nextStop,
      estimatedArrival: estimatedArrival ? `${estimatedArrival} min` : null
    };

    logger.info(`Route with stops fetched for bus ID: ${busId}`);
    return res
      .status(200)
      .json(new ApiResponse(200, routeData, "Route fetched successfully"));
  } catch (error) {
    logger.error(`Error fetching route with stops for bus ID: ${busId}`, error);
    throw new ApiError(500, "Error fetching bus route from database");
  }
});