// backend/routers/abusroute.router.js

import { Router } from 'express';
import { getBusRouteWithStops } from '../controllers/abusroute.controller.js'; 
import { userApiAuth } from '../middleware/userAuth.middleware.js'; 

const router = Router();

// Protect with authentication middleware (if you use it)
router.use(userApiAuth);

// GET /abusroute/:id/route-with-stops
router.get('/:id/route-with-stops', getBusRouteWithStops);

export default router;
