import { pool } from "../config/db.js";
import { asyncHandler } from "../utilities/asyncHandler.js";

export const driverpage = asyncHandler(async (req, res) => {
  const userId = req.params.user_id;
  
  // Check if user is a driver
  const result = await pool.query(
    'SELECT * FROM users WHERE id = $1 AND role = $2',
    [userId, 'driver']
  );
  
  if (result.rows.length === 0) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  res.status(200).json({
    message: 'Driver page access granted',
    user: result.rows[0]
  });
});

export const userpage = asyncHandler(async (req, res) => {
  const userId = req.params.user_id;
  
  // Verify user exists
  const result = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.status(200).json({
    message: 'User page access granted',
    user: result.rows[0]
  });
});

export const adminpage = asyncHandler(async (req, res) => {
  const userId = req.params.user_id;
  
  // Check if user has role = 'admin' instead of is_admin = true
  const result = await pool.query(
    'SELECT * FROM users WHERE id = $1 AND role = $2',
    [userId, 'admin']
  );
  
  if (result.rows.length === 0) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  res.status(200).json({
    message: 'Admin page access granted',
    user: result.rows[0]
  });
});
