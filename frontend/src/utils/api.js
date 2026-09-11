import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_API_URL;
// Create an Axios instance with default config
const api = axios.create({
  baseURL: BACKEND_URL,
  withCredentials: true, // Ensure cookies are sent with requests
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwtToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Response interceptor for error handling
api.interceptors.response.use((response) => {
  return response;
}, (error) => {
  console.error('API Error:', error);
  
  // Handle 401 by redirecting to login
  if (error.response && error.response.status === 401) {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
  
  return Promise.reject(error);
});

export default api;