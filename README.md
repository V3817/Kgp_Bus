# KGP Bus Tracking System

## Project Structure

### Frontend Structure

#### Core Files
- **`/frontend/src/index.js`**: The entry point of the React application that renders the App component to the DOM.
- **`/frontend/src/App.js`**: The main application component that sets up routing, authentication state, and protected routes.

#### Component Files
- **`/frontend/src/components/Navbar.js`**: Navigation bar component with conditional rendering based on user authentication status and role.
- **`/frontend/src/components/login.js`**: Login form component with email/password and Google OAuth authentication options.
- **`/frontend/src/components/signup.js`**: Registration form component with standard and Google account signup options.

#### Utility Files
- **`/frontend/src/utils/api.js`**: Axios instance configuration with interceptors for handling authentication tokens and error responses.

#### Public Files
- **`/frontend/public/index.html`**: The HTML template for the React application.
- **`/frontend/public/manifest.json`**: Web app manifest file for Progressive Web App functionality.
- **`/frontend/public/robots.txt`**: Rules for search engine crawlers, allowing access to public pages and restricting private routes.

### Backend Structure

#### Config Folder
- **`config/db.js`**: Handles database connection and initializes database tables. It creates the necessary schema and tables (users, bus_stops, buses, routes, bus_drivers, locations) if they don't exist.
- **`config/createAdminUser.js`**: Creates an admin user account if it doesn't exist already.

#### Controllers Folder
This folder contains the main backend logic that handles API requests:

1. **Authentication Controller** (`authentication.controller.js`)
   - `registerUser`: Registers a new user with username, email, and password
   - `loginUser`: Authenticates users with email and password, returns JWT token
   - `login_google`: Handles Google OAuth authentication
   - `authenticateUser`: Validates user's JWT token
   - `logoutUser`: Logs out a user and clears authentication cookies

2. **Redirect Controller** (`redirect.controller.js`)
   - `driverpage`: Handles access to driver-specific pages
   - `userpage`: Handles access to regular user pages
   - `adminpage`: Handles access to admin pages

#### Middleware Folder
Middlewares are functions that run between the request and response cycle to perform specific checks or operations.

- **`auth.middleware.js`**:
  - `checkForUserAuthentication`: Validates JWT tokens and adds user data to request object
  - `checkRole`: Ensures users have appropriate permissions for specific routes

#### Utilities Folder
Contains helper functions and classes that are used throughout the application:

- **`asyncHandler.js`**: A higher-order function that wraps async route handlers to avoid repetitive try/catch blocks and provide consistent error handling.
- **`ApiError.js`**: Custom error class that extends JavaScript's Error with additional properties for status code, error details, and JSON formatting for API responses.
- **`ApiResponse.js`**: Standardizes API response format with consistent structure for all successful responses.
- **`logger.js`**: Provides logging utilities that sanitize sensitive information before logging to prevent accidental exposure of user data or credentials in logs.

#### Routers Folder
Contains route definitions that map URLs to controller functions:

- **`authentication.router.js`**: Routes for user registration, login, and authentication
- **`redirect.router.js`**: Routes for handling page access based on user roles

### Environment Variables (.env file)
The application uses environment variables for configuration:

- **Database Configuration**:
  - `DB_NAME`: Database name (default: 22CS30065)
  - `DB_USER`: Database username
  - `DB_PASSWORD`: Database password
  - `DB_HOST`: Database host address (default: 10.5.18.73)
  - `DB_PORT`: Database port (default: 5432)

- **Server Configuration**:
  - `PORT`: The port on which the server runs (default: 5000)
  - `REACT_APP_API_URL`: URL of the backend service

- **Authentication**:
  - `JWT_SECRET`: Secret key for JWT token encryption
  - `JWT_EXPIRES_IN`: JWT token expiration time
  - `JWT_COOKIE_EXPIRES_IN`: Cookie expiration time for JWT

## Authentication Flow
1. User registers or logs in using email/password or Google OAuth
2. Server validates credentials and issues JWT token
3. Token is stored in cookies and localStorage, and sent in Authorization header for API requests
4. Protected routes check token validity before granting access
5. User roles (admin, driver, user) determine access to different parts of the application

## Running the Application

### Frontend
To run the frontend application:
```bash
cd frontend
npm install
nodemon start
npm start
```

### Backend
To run the backend server:
```bash
cd backend
npm install
npm start
npm run dev
```
