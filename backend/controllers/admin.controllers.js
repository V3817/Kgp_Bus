import { pool } from "../config/db.js";
import { asyncHandler } from "../utilities/asyncHandler.js";
import bcrypt from 'bcryptjs';

// Bus Management Controllers
export const getBuses = asyncHandler(async (req, res) => {
    const result = await pool.query('SELECT * FROM buses ORDER BY id');
    //console.log("Buses fetched:", result.rows.length);
    res.json(result.rows);
});

export const addBus = asyncHandler(async (req, res) => {
    const { name } = req.body;
    //console.log('Adding bus:', { name });

    const result = await pool.query(
        'INSERT INTO buses (name) VALUES ($1) RETURNING *',
        [name]
    );

    //console.log('Bus added successfully:', result.rows[0]);
    res.status(201).json(result.rows[0]);
});

export const updateBus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    const result = await pool.query(
        'UPDATE buses SET name = $1 WHERE id = $2 RETURNING *',
        [name, id]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Bus not found' });
    }

    res.json(result.rows[0]);
});

export const deleteBus = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // First check if the bus exists
        const busCheck = await client.query('SELECT id FROM buses WHERE id = $1', [id]);
        if (busCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Bus not found' });
        }
        
        // console.log(`Deleting all related records for bus ID: ${id}`);
        
        // Delete related records first to avoid foreign key constraint violations
        
        // 1. Delete bus start times first - this was causing the constraint error
        await client.query('DELETE FROM bus_start_time WHERE bus_id = $1', [id]);
        // console.log('- Start times deleted');
        
        // 2. Delete route records
        await client.query('DELETE FROM routes WHERE bus_id = $1', [id]);
        // console.log('- Routes deleted');
        
        // 3. Delete bus driver assignments
        await client.query('DELETE FROM bus_drivers WHERE bus_id = $1', [id]);
        // console.log('- Driver assignments deleted');
        
        // 4. Delete location history
        await client.query('DELETE FROM locations WHERE bus_id = $1', [id]);
        // console.log('- Location history deleted');
        
        // 5. Finally delete the bus itself
        const result = await client.query('DELETE FROM buses WHERE id = $1 RETURNING id', [id]);
        // console.log('- Bus record deleted');
        
        await client.query('COMMIT');
        res.json({ 
            message: 'Bus and all related records deleted successfully', 
            id: result.rows[0].id 
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error deleting bus:', err);
        
        // Add specific error messages for constraint violations
        if (err.code === '23503') {
            res.status(500).json({ 
                message: 'Failed to delete bus: It has related records that could not be deleted. ' + 
                         'Please ensure all schedules and routes are removed first.' 
            });
        } else {
            res.status(500).json({ message: 'Failed to delete bus: ' + err.message });
        }
    } finally {
        client.release();
    }
});

    


// Add new function to update bus totalRep
export const updateBusTotalRep = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { totalRep } = req.body;
    
    if (totalRep === undefined) {
        return res.status(400).json({ message: 'Total repetition count is required' });
    }
    
    const result = await pool.query(
        'UPDATE buses SET totalRep = $1 WHERE id = $2 RETURNING *',
        [totalRep, id]
    );
    
    if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Bus not found' });
    }
    
    res.json(result.rows[0]);
});

// Enhanced bus location endpoint with more debugging
export const getBusLocation = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    if (!id) {
        // console.log('Bus ID is missing in request');
        return res.status(400).json({ message: 'Bus ID is required' });
    }

    try {
        // console.log(`Executing location query for bus ID: ${id}`);
        
        // First try to get the actual location data
        const result = await pool.query(`
            SELECT id, bus_id, timestamp, 
                   latitude::float as latitude, 
                   longitude::float as longitude
            FROM locations 
            WHERE bus_id = $1 
            ORDER BY timestamp DESC 
            LIMIT 1
        `, [id]);

        // Log the query results
        // console.log(`Query returned ${result.rows.length} rows`);
        
        // If we found a real location record, return it
        if (result.rows.length > 0) {
            const location = result.rows[0];
            // console.log(`Location found for bus ID ${id}:`, location);
            
            // Explicitly convert to numbers to ensure proper JSON serialization
            return res.json({
                id: location.id,
                bus_id: parseInt(location.bus_id),
                timestamp: location.timestamp,
                latitude: parseFloat(location.latitude),
                longitude: parseFloat(location.longitude)
            });
        }
        
        // console.log(`No location found in database for bus ID: ${id}, generating test data`);
        
        // If no location data exists, create some test data based on first bus stop
        const routeResult = await pool.query(`
            SELECT r.id, r.bus_id, bs.id as stop_id, bs.name, bs.latitude, bs.longitude
            FROM routes r
            JOIN bus_stops bs ON r.bus_stop_id = bs.id
            WHERE r.bus_id = $1
            ORDER BY r.stop_order
            LIMIT 1
        `, [id]);
        
        if (routeResult.rows.length > 0) {
            const firstStop = routeResult.rows[0];
            
            // Generate test data using the first stop's location
            const testLocation = {
                id: 0,
                bus_id: parseInt(id),
                timestamp: new Date(),
                latitude: parseFloat(firstStop.latitude),
                longitude: parseFloat(firstStop.longitude),
                is_test_data: true
            };
            
            // console.log(`Generated test location for bus ID ${id}:`, testLocation);
            return res.json(testLocation);
        }
        
        // Absolute fallback - create a default position at IIT Kharagpur
        // console.log(`No route data found for bus ID: ${id}, using default location`);
        return res.json({
            id: 0,
            bus_id: parseInt(id),
            timestamp: new Date(),
            latitude: 22.3190,
            longitude: 87.3091,
            is_test_data: true,
            is_default: true
        });
    } catch (err) {
        console.error('Error getting bus location:', err);
        res.status(500).json({ message: 'Failed to retrieve bus location: ' + err.message });
    }
});

// Bus Stop Controllers
export const getBusStops = asyncHandler(async (req, res) => {
    const result = await pool.query('SELECT * FROM bus_stops ORDER BY id');

    // Parse latitude and longitude to numbers
    const stops = result.rows.map(stop => ({
        ...stop,
        latitude: parseFloat(stop.latitude),
        longitude: parseFloat(stop.longitude)
    }));

    //console.log('Bus stops fetched:', stops.length);
    res.json(stops);
});

export const addBusStop = asyncHandler(async (req, res) => {
    const { name, latitude, longitude } = req.body;
    const result = await pool.query(
        'INSERT INTO bus_stops (name, latitude, longitude) VALUES ($1, $2, $3) RETURNING *',
        [name, latitude, longitude]
    );

    // Parse latitude and longitude to numbers in response
    const newStop = {
        ...result.rows[0],
        latitude: parseFloat(result.rows[0].latitude),
        longitude: parseFloat(result.rows[0].longitude)
    };

    res.status(201).json(newStop);
});

export const updateBusStop = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, latitude, longitude } = req.body;

    const result = await pool.query(
        'UPDATE bus_stops SET name = $1, latitude = $2, longitude = $3 WHERE id = $4 RETURNING *',
        [name, latitude, longitude, id]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Bus stop not found' });
    }

    // Parse latitude and longitude to numbers in response
    const updatedStop = {
        ...result.rows[0],
        latitude: parseFloat(result.rows[0].latitude),
        longitude: parseFloat(result.rows[0].longitude)
    };

    res.json(updatedStop);
});

export const deleteBusStop = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // First check if this stop is used in any routes
    const routesCheck = await pool.query(
        'SELECT COUNT(*) FROM routes WHERE bus_stop_id = $1',
        [id]
    );

    if (parseInt(routesCheck.rows[0].count) > 0) {
        return res.status(400).json({
            message: 'Cannot delete this bus stop as it is used in one or more routes. Please remove it from all routes first.'
        });
    }

    // If not used in routes, proceed with deletion
    const result = await pool.query('DELETE FROM bus_stops WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Bus stop not found' });
    }

    res.json({ message: 'Bus stop deleted successfully', id: result.rows[0].id });
});

// Route Management Controllers
export const getRoutes = asyncHandler(async (req, res) => {
    const result = await pool.query(`
        SELECT r.*, bs.name as stop_name, b.name as bus_name,
            bs.latitude, bs.longitude
        FROM routes r
        JOIN bus_stops bs ON r.bus_stop_id = bs.id
        JOIN buses b ON r.bus_id = b.id
        ORDER BY r.bus_id, r.stop_order
    `);

    // Parse latitude/longitude to numbers
    const routes = result.rows.map(route => ({
        ...route,
        latitude: parseFloat(route.latitude),
        longitude: parseFloat(route.longitude)
    }));

    //console.log('Routes fetched:', routes.length);
    res.json(routes);
});

export const getBusRoute = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(`
        SELECT r.*, bs.name as stop_name, bs.latitude, bs.longitude
        FROM routes r
        JOIN bus_stops bs ON r.bus_stop_id = bs.id
        WHERE r.bus_id = $1
        ORDER BY r.stop_order
    `, [id]);

    // Parse latitude/longitude to numbers
    const routes = result.rows.map(route => ({
        ...route,
        latitude: parseFloat(route.latitude),
        longitude: parseFloat(route.longitude)
    }));

    res.json(routes);
});

// Update existing addRoute function to include time_from_start
export const addRoute = asyncHandler(async (req, res) => {
    const { bus_id, bus_stop_id, stop_order, time_from_start = 0 } = req.body;

    const result = await pool.query(
        'INSERT INTO routes (bus_id, bus_stop_id, stop_order, time_from_start) VALUES ($1, $2, $3, $4) RETURNING *',
        [bus_id, bus_stop_id, stop_order, time_from_start]
    );

    // Get stop details for the response
    const stopDetails = await pool.query(
        'SELECT name, latitude, longitude FROM bus_stops WHERE id = $1',
        [bus_stop_id]
    );

    const response = {
        ...result.rows[0],
        stop_name: stopDetails.rows[0].name,
        latitude: parseFloat(stopDetails.rows[0].latitude),
        longitude: parseFloat(stopDetails.rows[0].longitude)
    };

    res.status(201).json(response);
});

export const deleteRoute = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(
        'DELETE FROM routes WHERE id = $1 RETURNING bus_id',
        [id]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Route not found' });
    }

    res.json({ message: 'Route deleted successfully', id: id });
});

// Update existing updateRoute function to handle time_from_start
export const updateRoute = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { bus_stop_id, stop_order, time_from_start } = req.body;
    
    // Build the update query dynamically to include bus_stop_id if provided
    let updateColumns = [];
    let values = [];
    let paramCount = 1;
    
    if (bus_stop_id !== undefined) {
        updateColumns.push(`bus_stop_id = $${paramCount}`);
        values.push(bus_stop_id);
        paramCount++;
    }
    if (stop_order !== undefined) {
        updateColumns.push(`stop_order = $${paramCount}`);
        values.push(stop_order);
        paramCount++;
    }
    if (time_from_start !== undefined) {
        updateColumns.push(`time_from_start = $${paramCount}`);
        values.push(time_from_start);
        paramCount++;
    }
    
    if (updateColumns.length === 0) {
        return res.status(400).json({ message: 'No update parameters provided' });
    }
    
    // Add route id as last parameter
    values.push(id);
    
    const result = await pool.query(
        `UPDATE routes 
         SET ${updateColumns.join(', ')} 
         WHERE id = $${paramCount} 
         RETURNING *`,
        values
    );
    
    if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Route not found' });
    }
    
    // Get stop details for the updated route response
    const stopData = await pool.query(`
        SELECT bs.name as stop_name, bs.latitude, bs.longitude
        FROM bus_stops bs
        JOIN routes r ON r.bus_stop_id = bs.id
        WHERE r.id = $1
    `, [id]);
    
    const response = {
        ...result.rows[0],
        stop_name: stopData.rows[0]?.stop_name || 'Unknown Stop',
        latitude: parseFloat(stopData.rows[0]?.latitude || 0),
        longitude: parseFloat(stopData.rows[0]?.longitude || 0)
    };
    
    res.json(response);
});

// Driver Management Controllers
export const getDrivers = asyncHandler(async (req, res) => {
    const result = await pool.query(`
        SELECT u.username,u.id, u.email, bd.bus_id, b.name as bus_name
        FROM users u
        LEFT JOIN bus_drivers bd ON u.id = bd.user_id
        LEFT JOIN buses b ON bd.bus_id = b.id
        WHERE u.role = 'driver'
        ORDER BY u.id
    `);
    //console.log('Drivers fetched:', result.rows);
    res.json(result.rows);
});

export const addDriver = asyncHandler(async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { name, email, password, bus_id } = req.body;
        //console.log('Adding driver:', { name, email, bus_id });

        // First add the user with driver role
        const hashedPassword = await bcrypt.hash(password, 10);
        const userResult = await client.query(
            'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, email, hashedPassword, 'driver']
        );
        const user = userResult.rows[0];

        // If bus_id is provided, check if the bus already has a driver
        if (bus_id) {
            // Check if this bus is already assigned to another driver
            const busCheck = await client.query(
                'SELECT user_id FROM bus_drivers WHERE bus_id = $1',
                [bus_id]
            );

            if (busCheck.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    message: 'This bus is already assigned to another driver' 
                });
            }

            await client.query(
                'INSERT INTO bus_drivers (user_id, bus_id) VALUES ($1, $2)',
                [user.id, bus_id]
            );
        }
        await client.query('COMMIT');
        // Return the user data
        //console.log('Driver added successfully:', user);
        res.status(201).json({
            ...user,
            bus_id: bus_id || null
        });
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
});


export const updateDriver = asyncHandler(async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;
        const { name, email, password, bus_id } = req.body;
        // Update user details
        let userResult;
        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            userResult = await client.query(
                'UPDATE users SET username = $1, email = $2, password = $3 WHERE id = $4 AND role = $5 RETURNING *',
                [name, email, hashedPassword, id, 'driver']
            );
        } else {
            userResult = await client.query(
                'UPDATE users SET username = $1, email = $2 WHERE id = $3 AND role = $4 RETURNING *',
                [name, email, id, 'driver']
            );
        }
        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Driver not found' });
        }
        // Remove current bus assignment
        await client.query('DELETE FROM bus_drivers WHERE user_id = $1', [id]);
        // If bus_id is provided, check if the bus is available before assigning
        if (bus_id) {
            // Check if this bus is already assigned to another driver
            const busCheck = await client.query(
                'SELECT user_id FROM bus_drivers WHERE bus_id = $1 AND user_id != $2',
                [bus_id, id]
            );

            if (busCheck.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    message: 'This bus is already assigned to another driver' 
                });
            }

            await client.query(
                'INSERT INTO bus_drivers (user_id, bus_id) VALUES ($1, $2)',
                [id, bus_id]
            );
        }
        await client.query('COMMIT');
        const user = userResult.rows[0];
        res.json({
            ...user,
            bus_id: bus_id || null
        });
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
});




export const deleteDriver = asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const { id } = req.params;

        // First remove from bus_drivers
        await client.query('DELETE FROM bus_drivers WHERE user_id = $1', [id]);

        // Then delete the user
        const result = await client.query('DELETE FROM users WHERE id = $1 AND role = $2 RETURNING id', [id, 'driver']);

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Driver not found' });
        }

        await client.query('COMMIT');
        res.json({ message: 'Driver deleted successfully', id: result.rows[0].id });
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
});

// System Statistics Controller
export const getStatistics = asyncHandler(async (req, res) => {
    // Gather statistics from database
    const totalUsers = parseInt((await pool.query('SELECT COUNT(*) FROM users WHERE role = \'user\'')).rows[0].count) || 0;
    const activeUsers = parseInt((await pool.query('SELECT COUNT(DISTINCT user_id) FROM user_locations WHERE timestamp > NOW() - INTERVAL \'24 hours\' AND user_id IN (SELECT id FROM users WHERE role = \'user\')')).rows[0].count) || 0;
    const totalBuses = parseInt((await pool.query('SELECT COUNT(*) FROM buses')).rows[0].count) || 0;
    const activeBuses = parseInt((await pool.query('SELECT COUNT(DISTINCT bus_id) FROM locations WHERE timestamp > NOW() - INTERVAL \'24 hours\'')).rows[0].count) || 0;
    const totalStops = parseInt((await pool.query('SELECT COUNT(*) FROM bus_stops')).rows[0].count) || 0;
    const totalRoutes = parseInt((await pool.query('SELECT COUNT(DISTINCT bus_id) FROM routes')).rows[0].count) || 0;
    const totalDrivers = parseInt((await pool.query('SELECT COUNT(*) FROM users WHERE role = \'driver\'')).rows[0].count) || 0;
    const recentLocations = parseInt((await pool.query('SELECT COUNT(*) FROM locations WHERE timestamp > NOW() - INTERVAL \'1 hour\'')).rows[0].count) || 0;
    
    // Return real data
    const stats = {
        totalUsers,
        activeUsers,
        totalBuses,
        activeBuses,
        totalStops,
        totalRoutes,
        totalDrivers,
        recentLocations
    };
    
    //console.log('Statistics generated from database:', stats);
    res.json(stats);
});


export const getUsers = asyncHandler(async (req, res) => {
    const result = await pool.query(`
        SELECT id, username, email, role, created_at
        FROM users
        ORDER BY id
    `);
    
    //console.log("Users fetched:", result.rows.length);
    res.json(result.rows);
});

// Add a new user
export const addUser = asyncHandler(async (req, res) => {
    const { username, email, role, password } = req.body;
    
    // Validate role
    const validRoles = ['user', 'driver', 'admin'];
    if (!validRoles.includes(role)) {
        return res.status(400).json({ message: 'Invalid role. Must be user, driver, or admin.' });
    }
    
    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const result = await pool.query(
            'INSERT INTO users (username, email, role, password) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, created_at',
            [username, email, role, hashedPassword]
        );
        
        //console.log('User added successfully:', result.rows[0]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        // Check for duplicate email error
        if (err.code === '23505') { // PostgreSQL unique violation code
            return res.status(400).json({ message: 'Email already in use. Please try a different email.' });
        }
        throw err;
    }
});

// Update a user
export const updateUser = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { username, email, role, password } = req.body;
    
    // Validate role
    const validRoles = ['user', 'driver', 'admin'];
    if (!validRoles.includes(role)) {
        return res.status(400).json({ message: 'Invalid role. Must be user, driver, or admin.' });
    }
    
    try {
        let result;
        
        // If password is provided, update it as well
        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            result = await pool.query(
                'UPDATE users SET username = $1, email = $2, role = $3, password = $4 WHERE id = $5 RETURNING id, username, email, role, created_at',
                [username, email, role, hashedPassword, id]
            );
        } else {
            // Otherwise, only update other fields
            result = await pool.query(
                'UPDATE users SET username = $1, email = $2, role = $3 WHERE id = $4 RETURNING id, username, email, role, created_at',
                [username, email, role, id]
            );
        }
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        //console.log('User updated successfully:', result.rows[0]);
        res.json(result.rows[0]);
    } catch (err) {
        // Check for duplicate email error
        if (err.code === '23505') { // PostgreSQL unique violation code
            return res.status(400).json({ message: 'Email already in use. Please try a different email.' });
        }
        throw err;
    }
});

// Delete a user
export const deleteUser = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // First get the user to check if they're an admin
    const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
    
    if (userCheck.rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
    }
    
    // Prevent deletion of admin accounts as a safety measure
    if (userCheck.rows[0].role === 'admin') {
        return res.status(403).json({ message: 'Cannot delete admin accounts.' });
    }
    
    // Delete related records first (cascade doesn't always work as expected)
    await pool.query('DELETE FROM user_locations WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM bus_drivers WHERE user_id = $1', [id]);
    
    // Now delete the user
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    
    res.json({ message: 'User deleted successfully', id: result.rows[0].id });
});

// Get a single user by ID
export const getUserById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const result = await pool.query(`
        SELECT id, username, email, role, created_at
        FROM users
        WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(result.rows[0]);
});
