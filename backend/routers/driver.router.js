import { Router } from 'express';
import { 
  getDriverBus,
  updateLocation,
  clearStop,
  getTripOptions,
  initializeTrip
} from '../controllers/driver.controller.js';
import { driverApiAuth } from '../middleware/driverAuth.middleware.js';

const router = Router();

// Apply driver authentication middleware to all routes
router.use(driverApiAuth);

// Get driver's bus
router.get('/my-bus', getDriverBus);

// Update bus location
router.post('/update-location', updateLocation);

// Clear a stop
router.post('/clear-stop', clearStop);

// New routes for trip initialization
router.get('/trip-options/:id', getTripOptions);
router.post('/initialize-trip', initializeTrip);

export default router;
