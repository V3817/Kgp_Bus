import { checkForUserAuthentication, checkRole } from './auth.middleware.js';
import { asyncHandler } from '../utilities/asyncHandler.js';
import { logger } from '../utilities/logger.js';

// Combine authentication check with user role check
export const verifyAdmin = [
  checkForUserAuthentication,
  checkRole(['user'])
];

// Middleware to specifically verify user for API endpoints
export const userApiAuth = asyncHandler(async (req, res, next) => {
  try {
    // First ensure user is authenticated
    await new Promise((resolve, reject) => {
      checkForUserAuthentication(req, res, (err) => {
        if (err) reject(err);
        resolve();
      });
    });
    
    // Log authentication success
    logger.info('User authenticated successfully', { userId: req.userData?.userId });
    
    // Then check if authenticated user has user role
    if (req.userData && req.userData.role === 'user') {
      return next();
    }
    
    // If not user, deny access
    logger.warn('Access denied - role mismatch', { role: req.userData?.role, userId: req.userData?.userId });
    return res.status(403).json({ 
      error: 'Access denied. User privileges required.',
      code: 'USER_REQUIRED'
    });
  } catch (error) {
    logger.error("User auth error:", error);
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_FAILED' 
    });
  }
});