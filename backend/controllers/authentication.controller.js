import { pool } from "../config/db.js";
import { ApiError } from "../utilities/ApiError.js";
import { asyncHandler } from "../utilities/asyncHandler.js";
import { logger } from "../utilities/logger.js";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Register a new user
export const registerUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || username.trim() === "") throw new ApiError(500, "Name is required");

  if (!email || email.trim() === "")
    throw new ApiError(501, "Email is required");

  if (!password || password.trim() === "")
    throw new ApiError(502, "Password is required");

  try {
    // Check if user already exists
    const userExists = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userExists.rows.length > 0) {
      throw new ApiError(409, "Unable to create user, user already exists");
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id',
      [username, email, hashedPassword]
    );

    logger.info("User registered successfully", { userId: result.rows[0].id });

    res.status(201).json({
      message: "user created",
      userId: result.rows[0].id
    });

  } catch (error) {
    logger.error("Error registering user", error);
    throw new ApiError(500, "Internal Server Error");
  }
});

// Login user
export const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || email.trim() === "") {
    return res.status(400).json({ message: "Email is required" });
  }
  if (!password || password.trim() === "") {
    return res.status(400).json({ message: "Password is required" });
  }

  try {
    // Find user by email
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        email: user.email,
        userId: user.id,
        role: user.role
      },
      process.env.JWT_KEY,
      { expiresIn: '2h' }
    );

    // Set cookie and return response
    res.cookie('jwtToken', token, {
      httpOnly: true,
      secure: true, // Ensure secure cookies
      sameSite: 'none',
      maxAge: 3600 * 1000 * 2
    });

    // Log success without sensitive details
    logger.info("User login successful", { userId: user.id, role: user.role });

    return res.status(200).json({
      message: 'Auth successful',
      token: token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    logger.error("Login error occurred", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Login user with Google OAuth
export const login_google = asyncHandler(async (req, res) => {
  const { email, username } = req.body;

  if (!email || email.trim() === "") {
    throw new ApiError(400, "Email is required");
  }

  if (!username || username.trim() === "") {
    throw new ApiError(400, "Username is required");
  }

  try {
    // Check if user exists with this email
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    let user;

    // If user doesn't exist, create a new one
    if (userResult.rows.length === 0) {
      // Generate secure password for Google auth
      const googlePassword = 'google_a@ut2h_kgp';
      const hashedPassword = await bcrypt.hash(googlePassword, 10);

      // Default role is 'user'
      const role = 'user';

      const newUserResult = await pool.query(
        'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
        [username, email, hashedPassword, role]
      );

      user = newUserResult.rows[0];
    } else {
      // User exists
      user = userResult.rows[0];
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        email: user.email,
        userId: user.id,
        role: user.role
      },
      process.env.JWT_KEY,
      { expiresIn: '2h' }
    );

    // Set cookie and return response
    res.cookie('jwtToken', token, {
      httpOnly: true,
      secure: true, // Ensure secure cookies
      sameSite: 'none',
      maxAge: 3600 * 1000 * 2
    });

    // Log sanitized information
    logger.info("Google login successful for user ID", { userId: user.id, role: user.role });

    return res.status(200).send({
      message: 'Google auth successful',
      token: token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || 'user'
      }
    });
  } catch (error) {
    logger.error("Google login error occurred", error);
    throw new ApiError(500, "Internal Server Error");
  }
});

// Authenticate user
export const authenticateUser = asyncHandler(async (req, res) => {
  try {
    const bearerHeader = req.headers.authorization;

    if (!bearerHeader) {
      return res.status(401).json({
        message: "Authentication Failed - No token provided"
      });
    }

    const token = bearerHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        message: "Authentication Failed - Invalid token format"
      });
    }

    try {
      const decodedToken = jwt.verify(token, process.env.JWT_KEY);

      // Get user from database
      const result = await pool.query(
        'SELECT id, username, email, role FROM users WHERE id = $1',
        [decodedToken.userId]
      );

      const user = result.rows[0];

      if (!user) {
        return res.status(404).json({
          message: "User not found"
        });
      }

      // Log minimal information
      logger.info("User authenticated", { id: user.id, role: user.role });

      return res.status(200).json({
        user: user
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.info("Token expired", { errorType: error.name });
        return res.status(401).json({
          message: "Authentication Failed - Token expired",
          expired: true
        });
      } else {
        logger.error("Authentication error", error);
        return res.status(401).json({
          message: "Authentication Failed - Invalid token"
        });
      }
    }
  } catch (error) {
    logger.error("Authentication error", error);
    return res.status(500).json({
      message: "Authentication Failed - Server error"
    });
  }
});

export const logoutUser = asyncHandler(async (req, res) => {
  try {
    const frontendURL = process.env.FRONTEND_URL_LOCAL;

    // Clear JWT cookie
    res.clearCookie('jwtToken', {
      httpOnly: true,
      secure: true, // Ensure secure cookies
      sameSite: 'none'
    });

    logger.info("User logged out");

    // Respond with success message
    res.status(200).json({
      success: true,
      message: 'Successfully logged out',
      redirectUrl: frontendURL
    });
  } catch (error) {
    logger.error("Logout error", error);
    res.status(500).json({
      success: false,
      message: 'Error during logout'
    });
  }
});