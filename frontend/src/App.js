import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './css/authStyles.css';

import Home from './components/Home';
import Header from './components/Header';
import Footer from './components/Footer';
import Login from './components/login';
import Register from './components/signup';
import Driver from './components/driver_pages/driver';
import User from './components/user_pages/user';
import About from './components/About';
import AdminDashboard from './components/admin/AdminDashboard';
import UserProfile from './components/profile/UserProfile';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_API_URL;
axios.defaults.withCredentials = true;


// Future flags configuration for React Router
const router = {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true
  }
};

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyAuth = async () => {
      const token = localStorage.getItem('jwtToken');

      if (!token) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }

      try {
        const response = await axios.get(`${BACKEND_URL}/authenticate`, {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          withCredentials: true
        });

        if (response.status === 200) {
          setIsAuthenticated(true);
          setUserRole(response.data.user.role);
        } else {
          setIsAuthenticated(false);
          // Clear invalid auth data
          localStorage.removeItem('jwtToken');
          localStorage.removeItem('user');
        }
      } catch (error) {
        console.error('Auth verification failed:', error);
        setIsAuthenticated(false);
        
        // Clear tokens on auth failure
        localStorage.removeItem('jwtToken');
        localStorage.removeItem('user');
      } finally {
        setLoading(false);
      }
    };

    verifyAuth();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return <Navigate to="/" />;
  }

  return children;
};

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check for user in localStorage
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        // Log minimal information, avoid logging full user details
        ////console.log("User loaded from localStorage (ID):", parsedUser.id);
      } catch (error) {
        console.error("Error parsing user data from localStorage");
        localStorage.removeItem('user');
      }
    }

    // Verify token on app load
    const verifyToken = async () => {
      const token = localStorage.getItem('jwtToken');
      if (token) {
        try {
          const response = await axios.get(`${BACKEND_URL}/authenticate`, {
            headers: {
              'Authorization': `Bearer ${token}`
            },
            withCredentials: true
          });
          if (response.status === 200) {
            setUser(response.data.user);
            localStorage.setItem('user', JSON.stringify(response.data.user));
            // Log minimal information
            ////console.log("User authenticated (ID):", response.data.user.id);
          }
        } catch (error) {
          console.error("Token verification failed:", error);
          // Clear invalid tokens
          localStorage.removeItem('jwtToken');
          localStorage.removeItem('user');
          setUser(null);
        }
      }
    };

    verifyToken();
  }, []);

  const updateUser = (userData) => {
    setUser(userData);
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
    } else {
      localStorage.removeItem('user');
    }
  };

  return (
    <Router {...router}>
      <Header user={user} updateUser={updateUser} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login setUser={updateUser} />} />
        <Route path="/signup" element={<Register setUser={updateUser} />} />
        <Route path="/about" element={<About />} />

        {/* Protected routes with role-based access */}
        <Route path="/logged_in/admin/:id" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        } />

        <Route path="/logged_in/driver/:id" element={
          <ProtectedRoute allowedRoles={['driver']}>
            <Driver />
          </ProtectedRoute>
        } />

        <Route path="/logged_in/user/:id" element={
          <ProtectedRoute allowedRoles={['user']}>
            <User />
          </ProtectedRoute>
        } />
        <Route 
          path="/profile/:id" 
          element={
            <ProtectedRoute>
              <UserProfile />
            </ProtectedRoute>
          } 
        />
      </Routes>
      <Footer />
    </Router>
  );
}
export default App;
