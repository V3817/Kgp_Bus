import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../css/Header.css';

const BACKEND_URL = process.env.REACT_APP_API_URL;

function Header({ user, updateUser }) {
  const navigate = useNavigate();
  
  const handleLogoClick = () => {
    // If user is logged in, navigate to their role-specific dashboard
    // Otherwise navigate to public home
    if (user) {
      navigate(`/logged_in/${user.role}/${user.id}`);
    } else {
      navigate('/');
    }
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('jwtToken');
      
      if (token) {
        try {
          await axios.post(`${BACKEND_URL}/logout`, {}, {
            headers: {
              'Authorization': `Bearer ${token}`
            },
            withCredentials: true
          });
        } catch (error) {
          // If token is expired or invalid, just log it - we'll still clear local storage
          // console.log('Logout API call failed, continuing with local logout');
        }
      }
      
      // Always clear local storage regardless of API success/failure
      localStorage.removeItem('jwtToken');
      localStorage.removeItem('user');
      
      // Update user state
      updateUser(null);
      
      // Redirect to home page
      navigate('/');
    } catch (error) {
      console.error('Logout process failed:', error);
      // Ensure we still clear storage on any error
      localStorage.removeItem('jwtToken');
      localStorage.removeItem('user');
      updateUser(null);
      navigate('/');
    }
  };

  return (
    <header className="header">
      <div className="logo" onClick={handleLogoClick}>
        <h1>KGP_BUS</h1>
      </div>
      <nav className="navigation">
        <ul>
          {user && (
            <li className="welcome-message">
              Welcome, {user.username}
            </li>
          )}
          <li>
            <Link to={user ? `/logged_in/${user.role}/${user.id}` : "/"} className="nav-link">Home</Link>
          </li>
          <li>
            <Link to="/about" className="nav-link">About Us</Link>
          </li>
          {user && (
            <li className="nav-item">
              <Link className="nav-link" to={`/profile/${user.id}`}>My Profile</Link>
            </li>
          )}
          {user ? (
            <li>
              <button onClick={handleLogout} className="nav-link logout-btn">Logout</button>
            </li>
          ) : (
            <li>
              <Link to="/login" className="nav-link">Login</Link>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
}

export default Header;