import { Router } from 'express';
import { 
  getAllBuses,
  getBusLocation,
  getBusRoute,
  getBusInfo,
  getBusLocationOnly
} from '../controllers/bus.controller.js';
import { userApiAuth } from '../middleware/userAuth.middleware.js';
import { logger } from '../utilities/logger.js';

const router = Router();

// Add user authentication middleware
router.use(userApiAuth);

// Log when router is initialized
logger.info('Bus router initialized');

// Get all buses
router.get('/getAllBuses', getAllBuses);

// Get bus location
router.get('/:id/location', getBusLocation);

// Get bus location only (for automatic updates)
router.get('/:id/locationOnly', getBusLocationOnly);

// Get bus route information
router.get('/:id/route', getBusRoute);

// Get bus information including driver
router.get('/:id/info', getBusInfo);

export default router;
