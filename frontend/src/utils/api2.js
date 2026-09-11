import axios from 'axios';

axios.defaults.withCredentials = true;

// Base URL based on environment
const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || process.env.REACT_APP_API_URL;

// Define API endpoints
const apiConfig = {
  endpoints: {
    // Auth endpoints
    authenticate: '/authenticate',
    login: '/login',
    signup: '/signup',
    logout: '/logout',

    // Admin endpoints
    adminBuses: '/admin/buses',
    adminAddBus: '/admin/buses/add',
    adminUpdateBus: (id) => `/admin/buses/${id}/update`,
    adminDeleteBus: (id) => `/admin/buses/${id}/delete`,

    adminStops: '/admin/stops',
    adminAddStop: '/admin/stops/add',
    adminUpdateStop: (id) => `/admin/stops/${id}/update`,
    adminDeleteStop: (id) => `/admin/stops/${id}/delete`,

    adminRoutes: '/admin/routes',
    adminRouteById: (id) => `/admin/routes/${id}`,
    adminAddRoute: '/admin/routes/add',
    adminUpdateRoute: (id) => `/admin/routes/${id}/update`,
    adminDeleteRoute: (id) => `/admin/routes/${id}/delete`,

    adminDrivers: '/admin/drivers',
    adminAddDriver: '/admin/drivers/add',
    adminUpdateDriver: (id) => `/admin/drivers/${id}/update`,
    adminDeleteDriver: (id) => `/admin/drivers/${id}/delete`,

    // Bus start time endpoints - fix the paths
    adminBusStartTimes: (busId) => `/admin/buses/${busId}/start-times`,
    adminAddBusStartTime: (busId) => `/admin/buses/${busId}/start-times`,
    adminUpdateStartTime: (timeId) => `/admin/start-times/${timeId}`,
    adminDeleteStartTime: (timeId) => `/admin/start-times/${timeId}`,

    // Bus totalRep update endpoint - change to match controller
    adminUpdateBusTotalRep: (busId) => `/admin/buses/${busId}`,

    // Get specific bus details endpoint
    adminGetBus: (busId) => `/admin/buses/${busId}`,

    adminStats: '/admin/statistics',
    adminUserLocations: '/admin/users/locations',
    // User management endpoints - corrected to match backend routes
    adminUsers: '/admin/users',
    adminGetUser: (id) => `/admin/users/${id}`,
    adminAddUser: '/admin/users', // Matches the POST /admin/users endpoint
    adminUpdateUser: (id) => `/admin/users/${id}`, // Matches the PUT /admin/users/:id endpoint
    adminDeleteUser: (id) => `/admin/users/${id}`, // Matches the DELETE /admin/users/:id endpoint

    // Fix the bus location endpoint path - remove the /api prefix
    adminBusLocation: (busId) => `/admin/buses/${busId}/location`,
  }
};

// Helper function to build full API URLs
export const getApiUrl = (path) => {
  return `${API_BASE_URL}${path}`;
};

// New helper to handle API calls with better error handling
export const callApi = async (endpoint, options = {}) => {
  try {
    const url = getApiUrl(endpoint);
    const response = await axios({
      url,
      ...options,
      timeout: options.timeout || 15000, // Default timeout of 15 seconds
      withCredentials: true, // Ensure credentials are included
    });
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      console.error('API request timed out:', endpoint);
      throw new Error('Request timed out. The server might be temporarily unavailable.');
    }
    throw error;
  }
};



export default apiConfig;

