import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DriverMapScreen from './DriverMapScreen';
import '../../css/DriverPage.css';
import axios from 'axios';
import { getApiUrl } from '../../utils/api2.js';

function Driver() {
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [tokenChecked, setTokenChecked] = useState(false);
  const navigate = useNavigate();

  // Function to check JWT validity - using the correct endpoint
  const checkTokenValidity = async () => {
    const token = localStorage.getItem('jwtToken');
    if (!token) {
      if (tokenChecked) {
        navigate('/login');
      }
      return false;
    }

    try {
      // Use the correct API endpoint for token verification
      const response = await axios.get(getApiUrl('/authenticate'), {
        headers: {
          Authorization: `Bearer ${token}`
        },
        timeout: 5000
      });
      
      // If we get a successful response, the token is valid
      if (response.status === 200 && response.data && response.data.user) {
        return true;
      } else {
        if (tokenChecked) {
          localStorage.removeItem('user');
          localStorage.removeItem('jwtToken');
          navigate('/login');
        }
        return false;
      }
    } catch (error) {
      console.error('Token validation error:', error);
      
      // Only redirect on 401/403 errors, not on network errors
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        if (tokenChecked) {
          localStorage.removeItem('user');
          localStorage.removeItem('jwtToken');
          navigate('/login');
        }
        return false;
      }
      
      // For network errors, assume token is still valid to prevent redirect loops
      console.warn('Network error during token validation - assuming token is still valid');
      return true;
    }
  };

  useEffect(() => {
    // Get user from localStorage
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('jwtToken');

    if (!token) {
      // No token, redirect to login
      navigate('/login');
      return;
    }

    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser({ ...parsedUser, token });
        
        // Initial token check
        const doInitialCheck = async () => {
          await checkTokenValidity();
          setTokenChecked(true);
        };
        
        doInitialCheck();
        
        // Set up interval for token check (every 5 minutes)
        const tokenCheckInterval = setInterval(checkTokenValidity, 5 * 60 * 1000);
        
        return () => {
          clearInterval(tokenCheckInterval);
        };
      } catch (error) {
        console.error('Error parsing user data:', error);
        // Invalid user data, redirect to login
        localStorage.removeItem('user');
        localStorage.removeItem('jwtToken');
        navigate('/login');
      }
    } else {
      // No user data, redirect to login
      navigate('/login');
    }
  }, [id, navigate]);

  if (!user) {
    return <div className="loading-container">Loading...</div>;
  }

  return (
    <div className="driver-page">
      {/* Full screen map for driver */}
      <DriverMapScreen />
    </div>
  );
}

export default Driver;