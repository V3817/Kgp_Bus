import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import apiConfig, { getApiUrl } from '../../utils/api2.js';
import BusManagement from './BusManagement.js';
import StopManagement from './StopManagement.js';
import RouteManagement from './RouteManagement.js';
import DriverManagement from './DriverManagement.js';
// import SystemStatistics from './SystemStatistics.js';
import UserLocations from './UserLocations.js';
import UserManagement from './UserManagement.js';

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const navigate = useNavigate();
  const { id } = useParams();
  
  // Reference to store the interval ID for session checking
  const sessionCheckIntervalRef = useRef(null);
  
  // Use useCallback to memoize the function so it doesn't change on every render
  const handleSessionTimeout = useCallback(() => {
    // Clear the interval to prevent multiple alerts
    if (sessionCheckIntervalRef.current) {
      clearInterval(sessionCheckIntervalRef.current);
      sessionCheckIntervalRef.current = null;
    }
    
    // Clear local storage
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('user');
    
    // Show timeout alert
    alert("Your session has expired. Please log in again.");
    
    // Navigate to login page
    navigate('/login');
  }, [navigate]);
  
  // Function to check if the session is still valid - also wrapped in useCallback
  const checkSessionValidity = useCallback(async () => {
    try {
      const token = localStorage.getItem('jwtToken');
      if (!token) {
        handleSessionTimeout();
        return;
      }
      
      // Use the proper API URL for the authentication endpoint
      await axios.get(getApiUrl(apiConfig.endpoints.authenticate), {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        withCredentials: true
      });
      
      // If we get here, the token is still valid
      ////console.log("Session is still valid");
    } catch (err) {
      console.error("Session check failed:", err);
      
      // If we get a 401 or 403, the token is no longer valid
      if (err.response && (err.response.status === 401 || err.response.status === 403)) {
        handleSessionTimeout();
      }
    }
  }, [handleSessionTimeout]);
  
  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        // First try to get user from localStorage
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          if (parsedUser.role === 'admin') {
            ////console.log("Admin user found in localStorage:", parsedUser.id);
            setUser(parsedUser);
            setLoading(false);
            return;
          }
        }

        // If no stored user or not admin, fetch from API
        const token = localStorage.getItem('jwtToken');
        if (!token) {
          throw new Error("No authentication token found");
        }

        // Get user data from backend using the id param and authenticated request
        const response = await axios.get(`/logged_in/${id}/admin`, {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          withCredentials: true
        });

        if (response.data && response.data.user) {
          const userData = response.data.user;
          // Add token to user data for easier access in child components
          userData.token = token;
          // Store user in localStorage for future requests
          localStorage.setItem('user', JSON.stringify(userData));
          setUser(userData);
          ////console.log("Admin user fetched from API:", userData.id);
        } else {
          throw new Error("Invalid user data received");
        }
      } catch (err) {
        console.error("Error fetching admin data:", err);
        setError("Failed to load admin dashboard. Please log in again.");
        
        // If there's an auth error, redirect to login
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
          setTimeout(() => navigate('/login'), 2000);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAdminData();
    
    // Run a session check immediately when the component mounts
    checkSessionValidity();
    
    // Set up session validity check every minute (60000 ms)
    sessionCheckIntervalRef.current = setInterval(checkSessionValidity, 60000);
    
    // Clean up the interval when the component unmounts
    return () => {
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
      }
    };
  }, [id, navigate, checkSessionValidity]);

  // Show loading state
  if (loading) {
    return <div className="loading">Loading admin dashboard...</div>;
  }

  // Show error message
  if (error) {
    return (
      <div className="error-container">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/login')}>Return to Login</button>
      </div>
    );
  }

  // Show unauthorized message if user is not an admin
  if (!user || user.role !== 'admin') {
    return (
      <div className="unauthorized">
        <h2>Unauthorized Access</h2>
        <p>You must be an administrator to access this page.</p>
        <button onClick={() => navigate('/login')}>Go to Login</button>
      </div>
    );
  }
  
  // Get token for API calls
  const token = localStorage.getItem('jwtToken');
  
  // Debug token format to help diagnose issues
  ////console.log("Token format check:", {
  //   exists: !!token,
  //   length: token ? token.length : 0,
  //   // Show only first 10 chars to avoid logging sensitive data
  //   preview: token ? token.substring(0, 10) + '...' : null
  // });

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'buses':
        return <BusManagement user={{...user, token}} />;
      case 'stops':
        return <StopManagement user={{...user, token}} />;
      case 'routes':
        return <RouteManagement user={{...user, token}} />;
      case 'drivers':
        return <DriverManagement user={{...user, token}} />;
      case 'users':
        return <UserManagement user={{...user, token}} />;
      case 'locations':
        return <UserLocations user={{...user, token}} />;
      default:
        return <AdminOverview 
                  user={{...user, token}} 
                  setActiveTab={setActiveTab} 
               />;
    }
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-container">
        <div className="admin-sidebar">
          <nav>
            <ul>
              <li 
                className={activeTab === 'overview' ? 'active' : ''} 
                onClick={() => setActiveTab('overview')}>
                  Dashboard Overview
              </li>
              <li 
                className={activeTab === 'buses' ? 'active' : ''} 
                onClick={() => setActiveTab('buses')}>
                  Manage Buses
              </li>
              <li 
                className={activeTab === 'stops' ? 'active' : ''} 
                onClick={() => setActiveTab('stops')}>
                  Manage Bus Stops
              </li>
              <li 
                className={activeTab === 'routes' ? 'active' : ''} 
                onClick={() => setActiveTab('routes')}>
                  Manage Routes
              </li>
              <li 
                className={activeTab === 'drivers' ? 'active' : ''} 
                onClick={() => setActiveTab('drivers')}>
                  Manage Drivers
              </li>
              <li 
                className={activeTab === 'users' ? 'active' : ''} 
                onClick={() => setActiveTab('users')}>
                  Manage Users
              </li>
              <li 
                className={activeTab === 'locations' ? 'active' : ''} 
                onClick={() => setActiveTab('locations')}>
                  Track User Locations
              </li>
            </ul>
          </nav>
        </div>
        
        <div className="admin-content">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

// Simple overview component for the dashboard home
function AdminOverview({ user, setActiveTab }) {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalBuses: 0,
    totalStops: 0,
    totalRoutes: 0,
    totalDrivers: 0
  });
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        
        // Get token from user object or localStorage
        const token = user.token || localStorage.getItem('jwtToken');
        
        const response = await axios.get(
          getApiUrl(apiConfig.endpoints.adminStats),
          { 
            headers: { 'Authorization': `Bearer ${token}` },
            withCredentials: true
          }
        );
        
        if (response.data) {
          setStats({
            totalUsers: response.data.totalUsers || 0,
            totalBuses: response.data.totalBuses || 0,
            totalStops: response.data.totalStops || 0,
            totalRoutes: response.data.totalRoutes || 0,
            totalDrivers: response.data.totalDrivers || 0,
          });
        }
      } catch (err) {
        console.error("Error fetching dashboard stats:", err);
        // Fallback to demo values
      } finally {
        setLoading(false);
      }
    };
    
    fetchStats();
  }, [user.token]);
  
  if (loading) {
    return <div>Loading statistics...</div>;
  }

  return (
    <div className="admin-overview">
      <h2>System Overview</h2>
      <div className="dashboard-stats">
        <div className="stat-card">
          <h3>Buses</h3>
          <div className="stat">{stats.totalBuses}</div>
          <div className="stat-action">
            <button onClick={() => setActiveTab('buses')}>Manage</button>
          </div>
        </div>
        <div className="stat-card">
          <h3>Bus Stops</h3>
          <div className="stat">{stats.totalStops}</div>
          <div className="stat-action">
            <button onClick={() => setActiveTab('stops')}>Manage</button>
          </div>
        </div>
        <div className="stat-card">
          <h3>Routes</h3>
          <div className="stat">{stats.totalRoutes}</div>
          <div className="stat-action">
            <button onClick={() => setActiveTab('routes')}>Manage</button>
          </div>
        </div>
        <div className="stat-card">
          <h3>Drivers</h3>
          <div className="stat">{stats.totalDrivers}</div>
          <div className="stat-action">
            <button onClick={() => setActiveTab('drivers')}>Manage</button>
          </div>
        </div>
        <div className="stat-card">
          <h3>Users</h3>
          <div className="stat">{stats.totalUsers}</div>
          <div className="stat-action">
            <button onClick={() => setActiveTab('users')}>Manage</button>
          </div>
        </div>
      </div>
      
      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="action-buttons">
          <button onClick={() => setActiveTab('buses')}>Add New Bus</button>
          <button onClick={() => setActiveTab('stops')}>Add New Stop</button>
          <button onClick={() => setActiveTab('routes')}>Create New Route</button>
          <button onClick={() => setActiveTab('drivers')}>Add New Driver</button>
          <button onClick={() => setActiveTab('users')}>Manage Users</button>
        </div>
      </div>
      
      {/* <div className="recent-activity">
        <h3>Recent System Activity</h3>
        <ul className="activity-list">
          <li>Bus KGP Express 1 location updated (2 minutes ago)</li>
          <li>New student registered: Aditya Gupta (15 minutes ago)</li>
          <li>Route modification: Campus Shuttle 2 (1 hour ago)</li>
          <li>System maintenance completed (3 hours ago)</li>
        </ul>
      </div> */}
    </div>
  );
}

export default AdminDashboard;
