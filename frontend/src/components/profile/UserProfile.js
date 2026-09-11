import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Button, Container, Row, Col, Card } from 'react-bootstrap';
import axios from 'axios';
import '../../css/profile.css';

const BACKEND_URL = process.env.REACT_APP_API_URL;

function UserProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Toast control states
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  
  // Profile form state
  const [profileForm, setProfileForm] = useState({
    username: '',
    email: ''
  });
  
  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  // Edit state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  
  // Effect to show toasts when error or success changes
  useEffect(() => {
    if (error) {
      setShowErrorToast(true);
      // Auto dismiss after 5 seconds
      const timer = setTimeout(() => {
        setShowErrorToast(false);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);
  
  useEffect(() => {
    if (success) {
      setShowSuccessToast(true);
      // Auto dismiss after 5 seconds
      const timer = setTimeout(() => {
        setShowSuccessToast(false);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Load user data on mount
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const token = localStorage.getItem('jwtToken');
        if (!token) {
          navigate('/login');
          return;
        }
        
        const response = await axios.get(`${BACKEND_URL}/profile/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`
          },
          withCredentials: true
        });
        
        if (response.data && response.data.data) {
          const user = response.data.data;
          setUserData(user);
          setProfileForm({
            username: user.username || '',
            email: user.email || ''
          });
        }
      } catch (err) {
        console.error('Error fetching user data:', err);
        setError(err.response?.data?.message || 'Failed to load user profile');
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserData();
  }, [id, navigate]);
  
  // Handle toast close
  const handleCloseErrorToast = () => {
    setShowErrorToast(false);
    setError(null);
  };

  const handleCloseSuccessToast = () => {
    setShowSuccessToast(false);
    setSuccess(null);
  };
  
  // Handle profile form changes
  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfileForm(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle password form changes
  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle profile form submission
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    try {
      const token = localStorage.getItem('jwtToken');
      
      const response = await axios.put(`${BACKEND_URL}/profile/${id}/update`, profileForm, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        withCredentials: true
      });
      
      if (response.data && response.data.data) {
        setUserData(response.data.data);
        setSuccess('Profile updated successfully');
        setIsEditingProfile(false);
      }
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err.response?.data?.message || 'Failed to update profile');
    }
  };
  
  // Handle password form submission
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    // Validate passwords match
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    
    try {
      const token = localStorage.getItem('jwtToken');
      
      const response = await axios.post(`${BACKEND_URL}/profile/${id}/change-password`, {
        newPassword: passwordForm.newPassword
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        withCredentials: true
      });
      
      if (response.data) {
        setSuccess('Password changed successfully');
        setPasswordForm({
          newPassword: '',
          confirmPassword: ''
        });
      }
    } catch (err) {
      console.error('Error changing password:', err);
      setError(err.response?.data?.message || 'Failed to change password');
    }
  };
  
  if (loading) {
    return <div className="loading-spinner">Loading profile data...</div>;
  }
  
  return (
    <>
      {/* Toast Container */}
      <div className="toast-container">
        {/* Error Toast */}
        {showErrorToast && (
          <div className="toast toast-error">
            <div className="toast-header">
              <h5 className="toast-title">
                <span className="toast-icon">⚠️</span>
                Error
              </h5>
              <button 
                type="button" 
                className="toast-close" 
                onClick={handleCloseErrorToast}
              >
                ×
              </button>
            </div>
            <div className="toast-body">
              {error}
            </div>
          </div>
        )}
        
        {/* Success Toast */}
        {showSuccessToast && (
          <div className="toast toast-success">
            <div className="toast-header">
              <h5 className="toast-title">
                <span className="toast-icon">✅</span>
                Success
              </h5>
              <button 
                type="button" 
                className="toast-close" 
                onClick={handleCloseSuccessToast}
              >
                ×
              </button>
            </div>
            <div className="toast-body">
              {success}
            </div>
          </div>
        )}
      </div>
      
      <Container className="profile-container">
        <h1 className="profile-title">User Profile</h1>
        
        <Row>
          <Col md={6}>
            <Card className="profile-card">
              <Card.Header>
                <h3>Profile Information</h3>
              </Card.Header>
              <Card.Body>
                {isEditingProfile ? (
                  <Form onSubmit={handleProfileSubmit}>
                    <Form.Group className="mb-3">
                      <Form.Label>Username</Form.Label>
                      <Form.Control
                        type="text"
                        name="username"
                        value={profileForm.username}
                        onChange={handleProfileChange}
                        required
                      />
                    </Form.Group>
                    
                    <Form.Group className="mb-3">
                      <Form.Label>Email</Form.Label>
                      <Form.Control
                        type="email"
                        name="email"
                        value={profileForm.email}
                        onChange={handleProfileChange}
                        required
                      />
                    </Form.Group>
                    
                    <Form.Group className="mb-3">
                      <Form.Label>Role</Form.Label>
                      <Form.Control
                        type="text"
                        value={userData?.role || ''}
                        disabled
                      />
                    </Form.Group>
                    
                    <Button variant="success" type="submit" className="me-2">
                      Save Changes
                    </Button>
                    <Button 
                      variant="secondary" 
                      onClick={() => setIsEditingProfile(false)}
                    >
                      Cancel
                    </Button>
                  </Form>
                ) : (
                  <>
                    <div className="profile-info">
                      <p><strong>Username:</strong> {userData?.username}</p>
                      <p><strong>Email:</strong> {userData?.email}</p>
                      <p><strong>Role:</strong> {userData?.role}</p>
                      <p><strong>Member Since:</strong> {new Date(userData?.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="mt-3">
                      <Button 
                        variant="primary" 
                        onClick={() => setIsEditingProfile(true)}
                      >
                        Edit Profile
                      </Button>
                    </div>
                  </>
                )}
              </Card.Body>
            </Card>
          </Col>
          
          <Col md={6}>
            <Card className="password-card">
              <Card.Header>
                <h3>Change Password</h3>
              </Card.Header>
              <Card.Body>
                <Form onSubmit={handlePasswordSubmit}>
                  <Form.Group className="mb-3">
                    <Form.Label>New Password</Form.Label>
                    <Form.Control
                      type="password"
                      name="newPassword"
                      value={passwordForm.newPassword}
                      onChange={handlePasswordChange}
                      required
                    />
                  </Form.Group>
                  
                  <Form.Group className="mb-3">
                    <Form.Label>Confirm New Password</Form.Label>
                    <Form.Control
                      type="password"
                      name="confirmPassword"
                      value={passwordForm.confirmPassword}
                      onChange={handlePasswordChange}
                      required
                    />
                  </Form.Group>
                  
                  <Button variant="primary" type="submit">
                    Change Password
                  </Button>
                </Form>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </>
  );
}

export default UserProfile;