import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import { logger } from '../utilities/logger.js';

export const checkForUserAuthentication = async (req, res, next) => {
  try {
    const token = 
      req.headers.authorization?.split(' ')[1] || 
      req.cookies?.jwtToken;
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      const decodedToken = jwt.verify(token, process.env.JWT_KEY || 'your_jwt_secret');
      
      // Verify user exists in database
      const result = await pool.query(
        'SELECT id, username, email, role FROM users WHERE id = $1',
        [decodedToken.userId]
      );
      
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      // Simplified logging - just log the actual properties
      logger.info('User authenticated', { 
        userId: decodedToken.userId, 
        role: decodedToken.role
      });

      // Don't try to add id if it doesn't exist, just use the token data as is
      req.userData = decodedToken;
      
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.info('Token expired', { errorType: error.name });
        return res.status(401).json({
          message: 'Token expired',
          expired: true
        });
      } else if (error.name === 'JsonWebTokenError') {
        logger.info('Invalid token', { errorType: error.name });
        return res.status(401).json({
          message: 'Invalid token',
          malformed: true
        });
      }
      
      throw error; // Re-throw unexpected errors
    }
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(500).json({
      message: 'Authentication error'
    });
  }
};

// Middleware to check for specific roles
export const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.userData) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (allowedRoles.includes(req.userData.role)) {
      next();
    } else {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
  };
};

