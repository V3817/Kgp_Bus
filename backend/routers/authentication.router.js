import { Router } from "express";
import {
  loginUser,
  logoutUser,
  registerUser,
  authenticateUser,
  login_google
} from "../controllers/authentication.controller.js";

import { checkForUserAuthentication } from "../middleware/auth.middleware.js";

const router = Router();
router.route("/signup").post(registerUser);
router.route("/login").post(loginUser);
router.route("/login_google").post(login_google);
router.route("/authenticate").get(authenticateUser);
router.route("/logout").post(checkForUserAuthentication, logoutUser);

export default router;
