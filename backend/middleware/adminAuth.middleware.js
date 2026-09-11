import { checkForUserAuthentication, checkRole } from './auth.middleware.js';
import { asyncHandler } from '../utilities/asyncHandler.js';

// Combine authentication check with admin role check
export const verifyAdmin = [
  checkForUserAuthentication,
  checkRole(['admin'])
];

// Middleware to specifically verify admin for API endpoints
export const adminApiAuth = asyncHandler(async (req, res, next) => {
  try {
    // First ensure user is authenticated
    await new Promise((resolve, reject) => {
      checkForUserAuthentication(req, res, (err) => {
        if (err) reject(err);
        resolve();
      });
    });
    
    // Then check if authenticated user has admin role
    if (req.userData && req.userData.role === 'admin') {
      return next();
    }
    
    // If not admin, deny access
    return res.status(403).json({ 
      error: 'Access denied. Admin privileges required.',
      code: 'ADMIN_REQUIRED'
    });
  } catch (error) {
    console.error("Admin auth error:", error);
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_FAILED' 
    });
  }
});
