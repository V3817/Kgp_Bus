import { Router } from "express";
import {
  getUserProfile,
  updateUserProfile,
  changePassword
} from "../controllers/profile.controller.js";
import { checkForUserAuthentication } from "../middleware/auth.middleware.js";
import { logger } from "../utilities/logger.js";

const router = Router();

// Apply authentication middleware to all profile routes
router.use(checkForUserAuthentication);

// Log when router is initialized
logger.info('Profile router initialized');

// Profile routes
router.get("/:user_id", getUserProfile);
router.put("/:user_id/update", updateUserProfile);
router.post("/:user_id/change-password", changePassword);

export default router;