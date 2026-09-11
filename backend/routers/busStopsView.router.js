// backend/routers/busStopsView.router.js

import { Router } from 'express';
import { getBusesByStops, getBusStops } from '../controllers/busStopsView.controller.js'; 
import { userApiAuth } from '../middleware/userAuth.middleware.js'; 

const router = Router();

// Protect with authentication middleware
router.use(userApiAuth);

// GET buses by From and To stops
router.get('/buses', getBusesByStops);

// New: GET all bus stops
router.get('/bus-stops', getBusStops);

export default router;
