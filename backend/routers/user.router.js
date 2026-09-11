import { Router } from 'express';
import { getAllBusStops, updateLocation } from '../controllers/user.controller.js';
import { logger } from '../utilities/logger.js';
import { userApiAuth } from '../middleware/userAuth.middleware.js';

const router = Router();

// Add userApiAuth middleware to all routes
router.use(userApiAuth);

// Log when router is initialized
logger.info('Bus stop router initialized');

// Routes for bus stops
router.get('/getAllBusStops', getAllBusStops);

// Add user location update endpoint - now using the function from user.controller.js
router.post('/updateLocation', updateLocation);

export default router;
