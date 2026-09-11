import { pool } from "../config/db.js";
import { asyncHandler } from "../utilities/asyncHandler.js";

// Update the current user's location
export const updateLocation = asyncHandler(async (req, res) => {
    const { latitude, longitude } = req.body;
    const userId = req.userData.userId;

    // Validate coordinates
    if (!latitude || !longitude) {
        return res.status(400).json({ message: 'Latitude and longitude are required' });
    }

    try {
        // Insert the user's location
        const result = await pool.query(
            `INSERT INTO user_locations (user_id, latitude, longitude) 
             VALUES ($1, $2, $3)
             RETURNING id, latitude, longitude, timestamp`,
            [userId, latitude, longitude]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating location:', error);
        res.status(500).json({ message: 'Error updating location', error: error.message });
    }
});

// Get the current user's latest location
export const getUserLocation = asyncHandler(async (req, res) => {
    const userId = req.userData.userId;

    try {
        const result = await pool.query(
            `SELECT latitude, longitude, timestamp
             FROM user_locations
             WHERE user_id = $1
             ORDER BY timestamp DESC
             LIMIT 1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No location found for this user' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching user location:', error);
        res.status(500).json({ message: 'Error fetching location', error: error.message });
    }
});

// Get all current bus locations - for regular users to see buses
export const getBusLocations = asyncHandler(async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT l.bus_id, l.latitude, l.longitude, l.timestamp, b.name as bus_name
             FROM locations l
             JOIN buses b ON l.bus_id = b.id
             WHERE l.timestamp > (NOW() - INTERVAL '1 hour')
             ORDER BY l.bus_id, l.timestamp DESC`
        );

        // Process to get only the latest location for each bus
        const latestByBus = {};
        result.rows.forEach(row => {
            if (!latestByBus[row.bus_id] ||
                new Date(row.timestamp) > new Date(latestByBus[row.bus_id].timestamp)) {
                latestByBus[row.bus_id] = row;
            }
        });

        const busLocations = Object.values(latestByBus).map(loc => ({
            id: loc.bus_id,
            name: loc.bus_name,
            location: {
                latitude: parseFloat(loc.latitude),
                longitude: parseFloat(loc.longitude)
            },
            timestamp: loc.timestamp
        }));

        res.json(busLocations);
    } catch (error) {
        console.error('Error fetching bus locations:', error);
        res.status(500).json({ message: 'Error fetching bus locations', error: error.message });
    }
});

// Get all user locations (admin only)
export const getAllUserLocations = asyncHandler(async (req, res) => {
    try {
        console.log('Fetching user locations for admin...');
        
        // First, check if the users table has 'username' or 'name' column
        const columnCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND (column_name = 'username' OR column_name = 'name')
            AND table_schema = 'kgp_bus_track'
        `);
        
        console.log('Column check result:', columnCheck.rows);
        
        // Determine which column to use based on the check
        const usernameColumn = columnCheck.rows.find(row => row.column_name === 'username') 
            ? 'username' 
            : 'name';
        
        console.log(`Using '${usernameColumn}' column for usernames`);
        
        // Use the determined column name in the query
        const result = await pool.query(`
            SELECT 
                ul.id AS _id, 
                u.id AS user_id,
                u.${usernameColumn} AS username,
                u.email AS "fullName",
                u.role AS type,
                ul.latitude,
                ul.longitude,
                ul.timestamp
            FROM user_locations ul
            JOIN users u ON ul.user_id = u.id
            ORDER BY ul.timestamp DESC
        `);

        console.log(`Found ${result.rows.length} user locations`);
        
        if (result.rows.length === 0) {
            console.log('No user locations found in database');
            
            // Check if there are any users at all
            const usersCheck = await pool.query(`SELECT COUNT(*) FROM users`);
            console.log(`Total users in database: ${usersCheck.rows[0].count}`);
            
            // Check if there are any locations at all
            const locationsCheck = await pool.query(`SELECT COUNT(*) FROM user_locations`);
            console.log(`Total user locations in database: ${locationsCheck.rows[0].count}`);
        }
        
        // Parse latitude and longitude to ensure they're numbers
        const locations = result.rows.map(row => ({
            _id: row._id,
            user_id: row.user_id,
            username: row.username,
            fullName: row.fullName, 
            type: row.type,
            coordinates: {
                latitude: parseFloat(row.latitude),
                longitude: parseFloat(row.longitude)
            },
            timestamp: row.timestamp
        }));
        
        if (locations.length > 0) {
            console.log('Sample location data:', locations[0]);
        }
        
        res.json(locations);
    } catch (error) {
        console.error('Error fetching all user locations:', error);
        res.status(500).json({ message: 'Error fetching user locations', error: error.message });
    }
});
