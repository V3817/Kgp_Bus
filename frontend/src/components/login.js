import React, { useState } from "react";
import { Container, Form, Button } from "react-bootstrap";
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import api from '../utils/api';

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

// SVG icons for password visibility
const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/>
    <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/>
  </svg>
);

const EyeSlashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z"/>
    <path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/>
    <path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z"/>
  </svg>
);

const LoginPage = ({ setUser }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const redirect_register = () => {
    try {
      window.location.href = "/signup";
    } catch (err) {
      ////console.log(err);
    }
  };
  
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    // Basic validation
    if (!email.trim()) {
      alert("Email is required");
      setLoading(false);
      return;
    }
    
    if (!password.trim()) {
      alert("Password is required");
      setLoading(false);
      return;
    }
    
    try {
      const resp = await api.post('/login', {
        email: email,
        password: password,
      });

      if (resp.status === 200) {
        const token = resp.data.token;
        localStorage.setItem('jwtToken', token);
        localStorage.setItem('user', JSON.stringify(resp.data.user));
        
        // Update user state in parent component
        if (setUser) {
          setUser(resp.data.user);
        }
        
        // Get role and id for redirection
        const { role, id } = resp.data.user;
        
        if (!role || !id) {
          alert("Login successful but user role is missing. Please contact support.");
          setLoading(false);
          return;
        }
        
        alert(`Login successful! Welcome ${resp.data.user.username}.`);
        
        // Redirect immediately without countdown
        window.location.replace(`/logged_in/${role}/${id}`);
      }
    } catch (err) {
      ////console.log(err);
      alert(err.response?.data?.message || "Invalid email or password. Please try again.");
      setLoading(false);
    }
  };

  const responseGoogle = async (response) => {
    setLoading(true);
    
    try {
      const decoded = jwtDecode(response.credential);
      const { email, name } = decoded;

      const resp = await api.post('/login_google', {
        email,
        username: name,
      });
 
      if (resp.status === 200) {
        const token = resp.data.token;
        localStorage.setItem('jwtToken', token);
        localStorage.setItem('user', JSON.stringify(resp.data.user));
        
        // Update user state in parent component
        if (setUser) {
          setUser(resp.data.user);
        }
        
        // Get role and id for redirection
        const { role, id } = resp.data.user;
        
        if (!role || !id) {
          alert("Login successful but user role is missing. Please contact support.");
          setLoading(false);
          return;
        }
        
        alert(`Google login successful! Welcome ${resp.data.user.username}.`);
        
        // Redirect immediately without countdown
        window.location.replace(`/logged_in/${role}/${id}`);
      }
    } catch (err) {
      console.error("Google login error:", err);
      alert("Error signing in with Google. Please try again.");
      setLoading(false);
    }
  };

  return (
    <Container className="login-box">
      <h1>Welcome Back</h1>
      
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <div className="google-loginbox">
          <GoogleLogin
            buttonText="Login with Google"
            onSuccess={responseGoogle}
            onError={(err) => {
              if (err.error === "popup_closed_by_user") {
                alert("Popup closed before completing login.");
              } else if (err.error === "idpiframe_initialization_failed") {
                alert("Initialization failed. Please check your Client ID and authorized origins.");
              } else {
                alert("Google login error. Please try again.");
                console.error("Google login error:", err);
              }
            }}
            disabled={loading}
          />
        </div>
      </GoogleOAuthProvider>
      
      <div className="login-form">
        <h3 className="emailSignin">Sign in with your email</h3>
        <Form onSubmit={handleLogin}>
          <Form.Group controlId="formBasicEmail">
            <Form.Control
              className="email"
              type="email"
              placeholder="Enter email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </Form.Group>

          <Form.Group controlId="formBasicPassword" className="password-wrapper">
            <Form.Control
              className="password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
            <button 
              type="button"
              className="show-password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              disabled={loading}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
          </Form.Group>
          
          <Button 
            className="login-button" 
            type="submit" 
            variant="primary"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </Button>
        </Form>
      </div>
      
      <div className="noaccount">
        <p>
          Don't have an account?{" "}
          <span className="gotosignup" onClick={redirect_register} style={{ cursor: 'pointer' }}>
            Sign Up
          </span>
        </p>
      </div>
    </Container>
  );
};

export default LoginPage;