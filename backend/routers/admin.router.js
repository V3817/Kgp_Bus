import { Router } from 'express';
import { pool } from '../config/db.js'; 
import { 
  getBuses, addBus, updateBus, deleteBus, updateBusTotalRep,
  getBusStops, addBusStop, updateBusStop, deleteBusStop,
  getRoutes, addRoute, updateRoute, deleteRoute, getBusRoute,
  getDrivers, addDriver, updateDriver, deleteDriver,
  getStatistics, getUsers, getUserById, addUser, updateUser, deleteUser,
  getBusLocation // Make sure this import is here
} from '../controllers/admin.controllers.js';
import { 
  getBusStartTimes, addBusStartTime, updateStartTime, deleteStartTime 
} from '../controllers/bus_time.controller.js';
import { getAllUserLocations } from '../controllers/location.controller.js';
import { adminApiAuth } from '../middleware/adminAuth.middleware.js';

const router = Router();

// Add adminApiAuth middleware to all admin routes
router.use(adminApiAuth);

// Add a test endpoint to help debug route issues
router.get('/test-route', (req, res) => {
  res.json({
    message: 'Admin routes are working correctly',
    availableRoutes: {
      busLocation: '/admin/buses/:id/location'
    }
  });
});

// Bus management routes
router.get('/buses', getBuses);

// IMPORTANT: The more specific route needs to come BEFORE the more general route
// Add bus location endpoint - moved up in the order
router.get('/buses/:id/location', getBusLocation);

// Fix the get bus by ID route - now this won't capture /buses/:id/location requests
router.get('/buses/:id', async (req, res) => { 
  try {
    const busId = req.params.id;
    console.log(`Fetching bus details for ID: ${busId}`);
    
    const result = await pool.query('SELECT * FROM buses WHERE id = $1', [busId]);
    
    if (result.rows.length === 0) {
      console.log(`Bus not found with ID: ${busId}`);
      return res.status(404).json({ message: 'Bus not found' });
    }
    
    console.log(`Bus found: ${JSON.stringify(result.rows[0])}`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching bus:', err);
    res.status(500).json({ message: 'Error fetching bus details' });
  }
});

router.post('/buses/add', addBus);
router.put('/buses/:id/update', updateBus);
router.delete('/buses/:id/delete', deleteBus);
router.put('/buses/:id', updateBusTotalRep); // Route for updating totalRep

// Bus stop management routes
router.get('/stops', getBusStops);
router.post('/stops/add', addBusStop);
router.put('/stops/:id/update', updateBusStop);
router.delete('/stops/:id/delete', deleteBusStop);

// Route management routes
router.get('/routes', getRoutes);
router.get('/routes/:id', getBusRoute);
router.post('/routes/add', addRoute);
router.put('/routes/:id/update', updateRoute); 
router.delete('/routes/:id/delete', deleteRoute);

// Bus start time routes
router.get('/buses/:id/start-times', getBusStartTimes);
router.post('/buses/:id/start-times', addBusStartTime);
router.put('/start-times/:id', updateStartTime);
router.delete('/start-times/:id', deleteStartTime);

// Driver management routes
router.get('/drivers', getDrivers);
router.post('/drivers/add', addDriver);
router.put('/drivers/:id/update', updateDriver);
router.delete('/drivers/:id/delete', deleteDriver);

// Statistics route
router.get('/statistics', getStatistics);

// // User locations (admin only)
router.get('/users/locations', getAllUserLocations);

router.get('/users', getUsers);
router.get('/users/:id', getUserById); // This parameterized route must come after specific routes
router.post('/users', addUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

export default router;