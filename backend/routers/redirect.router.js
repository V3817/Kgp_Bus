import { Router } from "express";
import {
    driverpage,
    userpage,
    adminpage
} from "../controllers/redirect.controller.js";

import { checkForUserAuthentication } from "../middleware/auth.middleware.js";

const router = Router();
router.route("/logged_in/:user_id/driver").get(checkForUserAuthentication, driverpage);
router.route("/logged_in/:user_id/users").get(checkForUserAuthentication, userpage);
router.route("/logged_in/:user_id/admin").get(checkForUserAuthentication, adminpage);

export default router;