import { pool } from '../config/db.js';
import { ApiError } from '../utilities/ApiError.js';
import { ApiResponse } from '../utilities/ApiResponse.js';
import { asyncHandler } from '../utilities/asyncHandler.js';
import { logger } from '../utilities/logger.js';

// Get start times for a specific bus
export const getBusStartTimes = asyncHandler(async (req, res) => {
    const busId = req.params.id;
    logger.info(`Fetching start times for bus ID: ${busId}`);
    
    try {
        //console.log(`Executing query for bus_start_time with bus_id=${busId}`);
        const result = await pool.query(
            `SELECT * FROM bus_start_time 
             WHERE bus_id = $1 
             ORDER BY rep_no ASC`,
            [busId]
        );
        
        //console.log(`Found ${result.rows.length} start times for bus ID: ${busId}`);
        logger.info(`Found ${result.rows.length} start times for bus ID: ${busId}`);
        
        // Return plain array for consistency with frontend expectations
        return res.status(200).json(result.rows);
    } catch (error) {
        console.error(`Error in getBusStartTimes for bus ID ${busId}:`, error);
        logger.error(`Error fetching start times for bus ID: ${busId}`, error);
        return res.status(500).json({ message: "Error fetching bus start times" });
    }
});

// Add a new start time for a bus
export const addBusStartTime = asyncHandler(async (req, res) => {
    const busId = req.params.id;
    const { start_time, rep_no } = req.body;
    
    //console.log(`Adding start time for bus ${busId}:`, { start_time, rep_no });
    
    if (!start_time) {
        return res.status(400).json({ message: "Start time is required" });
    }
    
    if (!rep_no) {
        //console.log("No rep_no provided, using default value of 1");
    }
    
    logger.info(`Adding start time ${start_time} for bus ID: ${busId}, rep_no: ${rep_no}`);
    
    try {
        // Check if bus exists
        const busExists = await pool.query('SELECT id FROM buses WHERE id = $1', [busId]);
        if (busExists.rows.length === 0) {
            logger.error(`Bus with ID ${busId} not found`);
            return res.status(404).json({ message: `Bus with ID ${busId} not found` });
        }

        // Use explicit cast for rep_no in case it's a string
        const repNoValue = rep_no ? parseInt(rep_no, 10) : 1;
        
        // Check if rep_no already exists for this bus
        const checkResult = await pool.query(
            `SELECT * FROM bus_start_time WHERE bus_id = $1 AND rep_no = $2`,
            [busId, repNoValue]
        );
        
        if (checkResult.rows.length > 0) {
            logger.warn(`Start time for repetition ${repNoValue} already exists for bus ${busId}`);
            return res.status(400).json({ message: `Start time for repetition ${repNoValue} already exists` });
        }
        
        // Insert new start time with explicit parameter types
        const result = await pool.query(
            `INSERT INTO bus_start_time (bus_id, rep_no, start_time) 
             VALUES ($1, $2, $3::time) 
             RETURNING *`,
            [busId, repNoValue, start_time]
        );
        
        logger.info(`Start time added for bus ID: ${busId}`);
        //console.log(`Start time added successfully for bus ${busId}:`, result.rows[0]);
        return res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(`Error in addBusStartTime for bus ID ${busId}:`, error);
        logger.error(`Error adding start time for bus ID: ${busId}`, error);
        return res.status(500).json({ 
            message: "Error adding bus start time", 
            error: error.message,
            details: error.detail || "No additional details"
        });
    }
});

// Update an existing start time
export const updateStartTime = asyncHandler(async (req, res) => {
    const timeId = req.params.id;
    const { start_time } = req.body;
    
    if (!start_time) {
        throw new ApiError(400, "Start time is required");
    }
    
    logger.info(`Updating start time ID: ${timeId} to ${start_time}`);
    
    try {
        const result = await pool.query(
            `UPDATE bus_start_time 
             SET start_time = $1 
             WHERE id = $2 
             RETURNING *`,
            [start_time, timeId]
        );
        
        if (result.rows.length === 0) {
            throw new ApiError(404, "Start time not found");
        }
        
        logger.info(`Start time updated for ID: ${timeId}`);
        return res.status(200).json(
            new ApiResponse(200, result.rows[0], "Start time updated successfully")
        );
    } catch (error) {
        logger.error(`Error updating start time ID: ${timeId}`, error);
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, "Error updating start time");
    }
});

// Delete a start time
export const deleteStartTime = asyncHandler(async (req, res) => {
    const timeId = req.params.id;
    
    logger.info(`Deleting start time ID: ${timeId}`);
    
    try {
        const result = await pool.query(
            `DELETE FROM bus_start_time 
             WHERE id = $1 
             RETURNING id, bus_id, rep_no`,
            [timeId]
        );
        
        if (result.rows.length === 0) {
            throw new ApiError(404, "Start time not found");
        }
        
        logger.info(`Start time deleted for ID: ${timeId}`);
        return res.status(200).json(
            new ApiResponse(200, result.rows[0], "Start time deleted successfully")
        );
    } catch (error) {
        logger.error(`Error deleting start time ID: ${timeId}`, error);
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, "Error deleting start time");
    }
});
