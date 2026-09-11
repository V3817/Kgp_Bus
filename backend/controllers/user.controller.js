import { pool } from '../config/db.js';
import { ApiError } from '../utilities/ApiError.js';
import { ApiResponse } from '../utilities/ApiResponse.js';
import { asyncHandler } from '../utilities/asyncHandler.js';
import { logger } from '../utilities/logger.js';

// Get all bus stops
export const getAllBusStops = asyncHandler(async (req, res) => {
    logger.info('Fetching all bus stops');
    
    try {
        const result = await pool.query('SELECT * FROM bus_stops ORDER BY name');
        logger.info(`Found ${result.rows.length} bus stops`);
        
        // Log each bus stop for debugging
        result.rows.forEach((stop, index) => {
            logger.debug(`Bus stop ${index + 1}:`, { id: stop.id, name: stop.name });
        });
        
        return res
            .status(200)
            .json(new ApiResponse(200, result.rows, "Bus stops fetched successfully"));
    } catch (error) {
        logger.error('Error fetching bus stops', error);
        throw new ApiError(500, "Error fetching bus stops from database");
    }
});

// Update the current user's location
export const updateLocation = asyncHandler(async (req, res) => {
    const { latitude, longitude } = req.body;
    const userId = req.userData.userId;

    // Validate coordinates
    if (!latitude || !longitude) {
        return res.status(400).json({ message: 'Latitude and longitude are required' });
    }

    logger.info('Updating user location', { userId });

    try {
        // Check if the user already has a location record
        const checkResult = await pool.query(
            `SELECT id FROM user_locations WHERE user_id = $1 LIMIT 1`,
            [userId]
        );

        let result;
        if (checkResult.rows.length > 0) {
            // Update existing record
            result = await pool.query(
                `UPDATE user_locations 
                 SET latitude = $2, longitude = $3, timestamp = NOW() 
                 WHERE user_id = $1
                 RETURNING id, latitude, longitude, timestamp`,
                [userId, latitude, longitude]
            );
            logger.info('Updated existing location record for user', { userId });
        } else {
            // Insert new record
            result = await pool.query(
                `INSERT INTO user_locations (user_id, latitude, longitude) 
                 VALUES ($1, $2, $3)
                 RETURNING id, latitude, longitude, timestamp`,
                [userId, latitude, longitude]
            );
            logger.info('Created new location record for user', { userId });
        }

        logger.info('User location updated successfully', { userId });
        
        return res
            .status(200)
            .json(new ApiResponse(200, result.rows[0], "Location updated successfully"));
    } catch (error) {
        logger.error('Error updating location:', error);
        throw new ApiError(500, "Error updating location");
    }
});