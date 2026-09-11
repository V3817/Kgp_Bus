import { checkForUserAuthentication, checkRole } from './auth.middleware.js';
import { asyncHandler } from '../utilities/asyncHandler.js';
import { logger } from '../utilities/logger.js';

// Combine authentication check with driver role check
export const verifyAdmin = [
  checkForUserAuthentication,
  checkRole(['driver'])
];

// Middleware to specifically verify driver for API endpoints
export const driverApiAuth = asyncHandler(async (req, res, next) => {
  try {
    // First ensure driver is authenticated
    await new Promise((resolve, reject) => {
      checkForUserAuthentication(req, res, (err) => {
        if (err) reject(err);
        resolve();
      });
    });

    // Log essential user data
    logger.info('Driver authentication - userData:', { 
      userId: req.userData?.userId,
      role: req.userData?.role
    });

    // Then check if authenticated user has driver role
    if (req.userData && req.userData.role === 'driver') {
      // We don't need to set req.user anymore since we're using req.userData consistently
      return next();
    }

    // If not driver, deny access
    logger.warn('Access denied - role mismatch', { role: req.userData?.role });
    return res.status(403).json({
      error: 'Access denied. Driver privileges required.',
      code: 'DRIVER_REQUIRED'
    });
  } catch (error) {
    logger.error("Driver auth error:", error);
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_FAILED'
    });
  }
});