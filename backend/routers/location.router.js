import { Router } from 'express';
import {
  updateLocation,
  getUserLocation,
  getBusLocations
} from '../controllers/location.controller.js';
import { checkForUserAuthentication } from '../middleware/auth.middleware.js';
import { adminApiAuth } from '../middleware/adminAuth.middleware.js';

const router = Router();
router.use(adminApiAuth);

// Endpoints requiring authentication
router.post('/update', checkForUserAuthentication, updateLocation);
router.get('/mylocation', checkForUserAuthentication, getUserLocation);

// Public endpoints (though still behind login)
router.get('/buses', checkForUserAuthentication, getBusLocations);

export default router;
