import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getApiUrl } from '../../utils/api2.js';
import '../../css/UserManagement.css'; // Assuming you have a CSS file for styling

function UserManagement({ user }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    role: 'user',
    password: ''
  });
  const [addingUser, setAddingUser] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [stats, setStats] = useState({
    totalUsers: 0,
    adminCount: 0,
    driverCount: 0,
    regularUsers: 0
  });
  const [refreshTrigger, setRefreshTrigger] = useState(false);

  // Fetch all users
  useEffect(() => {
    if (user && user.token && user.role === 'admin') {
      const fetchUsers = async () => {
        try {
          setLoading(true);
          setError('');

          const apiUrl = getApiUrl('/admin/users'); // Ensure correct endpoint
          ////console.log('Fetching users from:', apiUrl);

          const response = await axios.get(apiUrl, {
            headers: {
              Authorization: `Bearer ${user.token}`,
              'Content-Type': 'application/json',
            },
            withCredentials: true
          });

          if (response.data && Array.isArray(response.data)) {
            setUsers(response.data);

            // Calculate statistics
            const admins = response.data.filter(u => u.role === 'admin').length;
            const drivers = response.data.filter(u => u.role === 'driver').length;
            const regular = response.data.filter(u => u.role === 'user').length;

            setStats({
              totalUsers: response.data.length,
              adminCount: admins,
              driverCount: drivers,
              regularUsers: regular
            });
          } else {
            throw new Error('Invalid data format received');
          }
        } catch (err) {
          console.error('Error fetching users:', err);
          setError(`Failed to fetch users: ${err.message}`);
        } finally {
          setLoading(false);
        }
      };

      fetchUsers();
    }
  }, [user, refreshTrigger]);

  // Handle form input changes
  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // Start editing a user
  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      role: user.role,
      password: '' // Clear password field for security
    });
    setAddingUser(false);
  };

  // Start adding a new user
  const handleAddNew = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      email: '',
      role: 'user',
      password: ''
    });
    setAddingUser(true);
  };

  // Cancel editing or adding
  const handleCancel = () => {
    setEditingUser(null);
    setAddingUser(false);
    setFormData({
      username: '',
      email: '',
      role: 'user',
      password: ''
    });
  };

  // Submit the form to add or update a user
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const token = user.token || localStorage.getItem('jwtToken');
      
      if (editingUser) {
        // Update existing user
        const response = await axios.put(
          getApiUrl(`/admin/users/${editingUser.id}`), // Use correct endpoint (no '/update')
          formData,
          {
            headers: { 'Authorization': `Bearer ${token}` },
            withCredentials: true
          }
        );
        
        // Update users list
        setUsers(users.map(u => 
          u.id === editingUser.id ? response.data : u
        ));
        
        setSuccessMessage('User updated successfully!');
      } else {
        // Add new user
        const response = await axios.post(
          getApiUrl('/admin/users'), // Use correct endpoint (no '/add')
          formData,
          {
            headers: { 'Authorization': `Bearer ${token}` },
            withCredentials: true
          }
        );
        
        // Add to users list
        setUsers([...users, response.data]);
        setSuccessMessage('User added successfully!');
      }
      
      // Reset form
      setEditingUser(null);
      setAddingUser(false);
      setFormData({
        username: '',
        email: '',
        role: 'user',
        password: ''
      });
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
      
    } catch (err) {
      console.error('Error saving user:', err);
      setError(err.response?.data?.message || 'Failed to save user. Please try again.');
      
      // Clear error message after 3 seconds
      setTimeout(() => setError(null), 3000);
    }
  };

  // Delete a user
  const handleDelete = async (userId) => {
    // Confirm before deleting
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }
    
    try {
      const token = user.token || localStorage.getItem('jwtToken');
      
      await axios.delete(
        getApiUrl(`/admin/users/${userId}`), // Use correct endpoint (no '/delete')
        {
          headers: { 'Authorization': `Bearer ${token}` },
          withCredentials: true
        }
      );
      
      // Remove from users list
      setUsers(users.filter(u => u.id !== userId));
      setSuccessMessage('User deleted successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
      
    } catch (err) {
      console.error('Error deleting user:', err);
      setError(err.response?.data?.message || 'Failed to delete user. Please try again.');
      
      // Clear error message after 3 seconds
      setTimeout(() => setError(null), 3000);
    }
  };

  // Filter users based on search term
  const filteredUsers = searchTerm 
    ? users.filter(user => 
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.role.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : users;

  if (loading) {
    return <div className="loading">Loading users...</div>;
  }

  return (
    <div className="user-management">
      <h2>User Management</h2>
      
      {/* Success or error messages */}
      {successMessage && <div className="success-message">{successMessage}</div>}
      {error && <div className="error-message">{error}</div>}
      
      {/* Search and add new user */}
      <div className="user-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="add-button" onClick={handleAddNew}>Add New User</button>
      </div>
      
      {/* Add/Edit Form */}
      {(addingUser || editingUser) && (
        <form className="user-form" onSubmit={handleSubmit}>
          <h3>{editingUser ? 'Edit User' : 'Add New User'}</h3>
          
          <div className="form-group">
            <label>Username:</label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Email:</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Role:</label>
            <select
              name="role"
              value={formData.role}
              onChange={handleInputChange}
              required
            >
              <option value="user">User</option>
              <option value="driver">Driver</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>{editingUser ? 'New Password (leave blank to keep current):' : 'Password:'}</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              required={!editingUser}
            />
          </div>
          
          <div className="form-actions">
            <button type="submit">Save</button>
            <button type="button" onClick={handleCancel}>Cancel</button>
          </div>
        </form>
      )}
      
      {/* Users List */}
      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Created At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>{user.username}</td>
                <td>{user.email}</td>
                <td>
                  <span className={`role-badge ${user.role}`}>{user.role}</span>
                </td>
                <td>{new Date(user.created_at).toLocaleString()}</td>
                <td className="action-buttons">
                  <button className="edit-button" onClick={() => handleEdit(user)}>
                    Edit
                  </button>
                  {user.role !== 'admin' && (
                    <button className="delete-button" onClick={() => handleDelete(user.id)}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan="6" className="no-results">No users found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default UserManagement;