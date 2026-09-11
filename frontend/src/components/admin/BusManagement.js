import React, { useState, useEffect } from 'react';
import axios from 'axios';
import api, { getApiUrl } from '../../utils/api2.js';

axios.defaults.withCredentials = true;

function BusManagement({ user }) {
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingBus, setEditingBus] = useState(null);
  const [formData, setFormData] = useState({ 
    name: ''
  });
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Define fetch buses function
  const fetchBuses = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await axios.get(getApiUrl(api.endpoints.adminBuses), {
        headers: { Authorization: `Bearer ${user.token}` },
        timeout: 10000 // 10 second timeout
      });
      
      if (response.data && Array.isArray(response.data)) {
        setBuses(response.data);
        //console.log("Buses loaded from database:", response.data.length);
      } else {
        throw new Error("Invalid data format received");
      }
    } catch (err) {
      console.error("Error in fetchBuses:", err);
      
      // Provide more user-friendly message based on error type
      if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
        setError('Request timed out. The server might be overloaded or the database is temporarily unavailable.');
      } else if (err.code === 'ETIMEDOUT') {
        setError('Connection to database timed out. Please try again later.');
      } else {
        setError('Failed to fetch buses: ' + err.message);
      }
      
      // Add fallback mock data if needed
      if (buses.length === 0) {
        setBuses([
          { id: 'mock1', name: 'Demo Bus 1', created_at: new Date().toISOString() },
          { id: 'mock2', name: 'Demo Bus 2', created_at: new Date().toISOString() }
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    //console.log("Fetching buses (useEffect triggered)");
    fetchBuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.token, refreshTrigger]); 

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAddBus = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      //console.log("Adding new bus:", formData);
      
      const response = await axios.post(
        getApiUrl(api.endpoints.adminAddBus),
        formData,
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      
      if (response.data) {
        //console.log("Bus added successfully:", response.data);
        // Refresh to get latest data from server
        setRefreshTrigger(prev => prev + 1);
      } else {
        throw new Error("No data returned");
      }
      
      // Reset form state
      setFormData({ name: '' });
      setIsAddingNew(false);
    } catch (err) {
      setError('Failed to add bus: ' + err.message);
      console.error("Error in handleAddBus:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditBus = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      //console.log("Updating bus:", editingBus.id, formData);
      
      const response = await axios.put(
        getApiUrl(api.endpoints.adminUpdateBus(editingBus.id)),
        formData,
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      
      if (response.data) {
        //console.log("Bus updated successfully:", response.data);
        // Refresh to get latest data from server
        setRefreshTrigger(prev => prev + 1);
      } else {
        throw new Error("No data returned");
      }
      
      setEditingBus(null);
      setFormData({ name: '' });
    } catch (err) {
      setError('Failed to update bus: ' + err.message);
      console.error("Error in handleEditBus:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBus = async (id) => {
    // Improved confirmation message with warning about related data
    if (!window.confirm('Are you sure you want to delete this bus? This will also remove all related data including routes, start times, driver assignments, and location history.')) return;
    
    try {
        setError('');
        setLoading(true);
        console.log("Deleting bus:", id);
        
        const response = await axios.delete(
            getApiUrl(api.endpoints.adminDeleteBus(id)),
            { headers: { Authorization: `Bearer ${user.token}` } }
        );
        
        console.log("Bus deletion response:", response.data);
        
        // Show success message
        const successMessage = response.data.message || 'Bus deleted successfully';
        alert(successMessage);
        
        // Refresh to get latest data
        setRefreshTrigger(prev => prev + 1);
    } catch (err) {
        console.error("Error in handleDeleteBus:", err);
        
        let errorMessage = "Failed to delete bus";
        
        // Check for foreign key constraint violation
        if (err.response?.data?.message?.includes('foreign key constraint')) {
            errorMessage = "Cannot delete this bus because it has related schedules or routes. Please delete those first.";
        } else if (err.response?.data?.message) {
            // Use the server's error message if available
            errorMessage = err.response.data.message;
        } else {
            // Fall back to generic error with the message
            errorMessage = 'Failed to delete bus: ' + err.message;
        }
        
        setError(errorMessage);
        alert(errorMessage); // Show an alert for immediate feedback
    } finally {
        setLoading(false);
    }
  };

  const startEditing = (bus) => {
    setEditingBus(bus);
    setFormData({ name: bus.name });
    setIsAddingNew(false);
  };

  const cancelAction = () => {
    setEditingBus(null);
    setFormData({ name: '' });
    setIsAddingNew(false);
  };

  if (loading && !buses.length) return <div>Loading buses...</div>;

  return (
    <div className="bus-management">
      <h2>Bus Management</h2>
      {error && <div className="error-message">{error}</div>}
      
      <div className="action-buttons">
        <button 
          className="add-button"
          onClick={() => {
            setIsAddingNew(true);
            setEditingBus(null);
            setFormData({ name: '' });
          }}
          disabled={isAddingNew || editingBus}
        >
          Add New Bus
        </button>
        
        <button 
          onClick={() => setRefreshTrigger(prev => prev + 1)}
          disabled={loading}
          className="refresh-button"
        >
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>
      
      {isAddingNew && (
        <div className="form-container">
          <h3>Add New Bus</h3>
          <form onSubmit={handleAddBus}>
            <div className="form-group">
              <label htmlFor="name">Bus Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-buttons">
              <button type="submit">Add Bus</button>
              <button type="button" onClick={cancelAction}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      
      {editingBus && (
        <div className="form-container">
          <h3>Edit Bus</h3>
          <form onSubmit={handleEditBus}>
            <div className="form-group">
              <label htmlFor="name">Bus Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-buttons">
              <button type="submit">Update Bus</button>
              <button type="button" onClick={cancelAction}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      
      <div className="bus-list">
        <h3>Current Buses</h3>
        {buses.length === 0 ? (
          <p>No buses found in the system.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {buses.map(bus => (
                <tr key={bus.id}>
                  <td>{bus.id}</td>
                  <td>{bus.name}</td>
                  <td>{new Date(bus.created_at).toLocaleString()}</td>
                  <td>
                    <button onClick={() => startEditing(bus)}>Edit</button>
                    <button onClick={() => handleDeleteBus(bus.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default BusManagement;
