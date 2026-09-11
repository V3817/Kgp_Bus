import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bodyParser from 'body-parser';
import session from 'express-session';
import dotenv from 'dotenv';
import { connectDB } from "./config/db.js";

// Routes
import authenticationRouter from "./routers/authentication.router.js";
import redirectRouter from "./routers/redirect.router.js";
import adminRouter from "./routers/admin.router.js"; // Ensure admin router is properly imported
import busStopRouter from "./routers/user.router.js";
import busRouter from "./routers/bus.router.js";
import driverRouter from "./routers/driver.router.js";
import abusrouteRouter from './routers/abusroute.router.js';
import busStopsViewRouter from './routers/busStopsView.router.js';
import profileRouter from "./routers/profile.router.js"; 

dotenv.config();
const app = express();

// Connect to PostgreSQL
connectDB();

app.use(bodyParser.json({ limit: '5mb' }));
app.get("/", (req, res) => res.send({ message: "KGP Bus Service API" }));

// Updated CORS configuration
app.use(
  cors({
    origin: [process.env.FRONTEND_URL_LOCAL || "https://kgp-bus-frontend.vercel.app"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true, // Allow credentials (cookies, authorization headers, etc.)
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Requested-With", "Accept", "Accept-Version", "Content-Length", "Content-MD5", "Date", "X-Api-Version"],
    exposedHeaders: ["Content-Range", "X-Content-Range"]
  })
);

// Ensure cookies are handled correctly
app.use(cookieParser());

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'kgpservice',
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    secure: true, // Ensure secure cookies
    sameSite: 'none' // Allow cross-site cookies
  }
}));

// Register routes
app.use('/', authenticationRouter);
app.use('/', redirectRouter);
app.use('/admin', adminRouter); // Ensure admin router is properly mounted
app.use('/bus_stops', busStopRouter);
app.use('/buses', busRouter);
app.use('/driver', driverRouter);
app.use('/abusroute', abusrouteRouter);
app.use('/busStopsView', busStopsViewRouter);

app.use('/profile', profileRouter); 

// Add a test route to confirm server is running
app.get('/api-status', (req, res) => {
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    routes: {
      adminUsers: '/admin/users' // Helps confirm expected URL pattern
    }
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`); // Added a standard console log to confirm it is running
  //console.log(`Frontend URL: ${frontendURL}`); // Removed as it references a removed config
});

export default app;