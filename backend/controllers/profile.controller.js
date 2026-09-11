import { pool } from "../config/db.js";
import { asyncHandler } from "../utilities/asyncHandler.js";
import bcrypt from "bcrypt";
import { logger } from "../utilities/logger.js";
import { ApiResponse } from "../utilities/ApiResponse.js";
import { ApiError } from "../utilities/ApiError.js";

// Get user profile details
export const getUserProfile = asyncHandler(async (req, res) => {
  const userId = req.params.user_id || req.user.id;
  
  logger.info(`Fetching profile for user ID: ${userId}`);

  try {
    const result = await pool.query(
      'SELECT id, username, email, role, created_at FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      logger.info(`No user found with ID: ${userId}`);
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found"));
    }
    
    logger.info(`Profile found for user ID: ${userId}`);
    return res
      .status(200)
      .json(new ApiResponse(200, result.rows[0], "User profile fetched successfully"));
  } catch (error) {
    logger.error(`Error fetching profile for user ID: ${userId}`, error);
    throw new ApiError(500, "Error fetching user profile from database");
  }
});

// Update user profile
export const updateUserProfile = asyncHandler(async (req, res) => {
  const userId = req.params.user_id || req.user.id;
  const { username, email } = req.body;
  
  logger.info(`Updating profile for user ID: ${userId}`);

  try {
    // Check if email is already taken by another user
    if (email) {
      const emailCheck = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, userId]
      );
      
      if (emailCheck.rows.length > 0) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Email is already in use by another account"));
      }
    }

    const result = await pool.query(
      'UPDATE users SET username = COALESCE($1, username), email = COALESCE($2, email) WHERE id = $3 RETURNING id, username, email, role, created_at',
      [username, email, userId]
    );
    
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found"));
    }
    
    logger.info(`Profile updated for user ID: ${userId}`);
    return res
      .status(200)
      .json(new ApiResponse(200, result.rows[0], "User profile updated successfully"));
  } catch (error) {
    logger.error(`Error updating profile for user ID: ${userId}`, error);
    throw new ApiError(500, "Error updating user profile in database");
  }
});

// Change user password
export const changePassword = asyncHandler(async (req, res) => {
  const userId = req.params.user_id || req.user.id;
  const { newPassword } = req.body;
  
  if (!newPassword) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "New password is required"));
  }
  
  logger.info(`Changing password for user ID: ${userId}`);

  try {
    // Get current user data to verify user exists
    const userResult = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found"));
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, userId]
    );
    
    logger.info(`Password changed for user ID: ${userId}`);
    return res
      .status(200)
      .json(new ApiResponse(200, null, "Password changed successfully"));
  } catch (error) {
    logger.error(`Error changing password for user ID: ${userId}`, error);
    throw new ApiError(500, "Error changing password in database");
  }
});