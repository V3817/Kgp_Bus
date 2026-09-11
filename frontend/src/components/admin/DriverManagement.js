import React, { useState, useEffect } from 'react';
import axios from 'axios';
import api, { getApiUrl } from '../../utils/api2.js';

axios.defaults.withCredentials = true;

function DriverManagement({ user }) {
  const [drivers, setDrivers] = useState([]);
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingDriver, setEditingDriver] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    bus_id: ''
  });

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Fetch data on component mount
  useEffect(() => {
    fetchData();
  }, [user.token, refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Define fetch data function
  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');

      // First fetch buses
      try {
        const busesResponse = await axios.get(
          getApiUrl(api.endpoints.adminBuses),
          { headers: { Authorization: `Bearer ${user.token}` } }
        );

        if (busesResponse.data && Array.isArray(busesResponse.data)) {
          setBuses(busesResponse.data);
          //console.log('Buses loaded from database:', busesResponse.data.length);
        }
      } catch (busError) {
        console.error('Error fetching buses:', busError);
        setError('Error loading buses: ' + busError.message);
      }

      // Then fetch drivers
      try {
        //console.log('Fetching drivers from API...');
        const driversResponse = await axios.get(
          getApiUrl(api.endpoints.adminDrivers),
          {
            headers: { Authorization: `Bearer ${user.token}` }
          }
        );

        if (driversResponse.data) {
          if (Array.isArray(driversResponse.data)) {
            setDrivers(driversResponse.data);
            //console.log('Drivers loaded from database:', driversResponse.data.length);
            setError('');
          } else {
            console.warn('Driver data is not an array:', typeof driversResponse.data);
            setError('Invalid driver data format received');
            setDrivers([]);
          }
        } else {
          console.warn('No driver data in response');
          setError('No driver data received from server');
          setDrivers([]);
        }
      } catch (driverError) {
        console.error('Error fetching drivers:', driverError);
        setError('Error loading driver data: ' + driverError.message);
        setDrivers([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle form field changes
  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const getBusAssignments = () => {
    const busAssignments = {};
    drivers.forEach(driver => {
      if (driver.bus_id && (!editingDriver || driver.id !== editingDriver.id)) {
        busAssignments[driver.bus_id] = driver.username;
      }
    });
    return busAssignments;
  };

  // Handle adding a new driver
  const handleAddDriver = async (e) => {
    e.preventDefault();
    try {
      // Client-side validation - check if bus is already assigned
      const busAssignments = getBusAssignments();
      if (formData.bus_id && busAssignments[formData.bus_id]) {
        alert(`This bus is already assigned to driver: ${busAssignments[formData.bus_id]}`);
        return;
      }

      setLoading(true);
      setError('');

      const response = await axios.post(
        getApiUrl(api.endpoints.adminAddDriver),
        formData,
        { headers: { Authorization: `Bearer ${user.token}` } }
      );

      //console.log('Driver added successfully:', response.data);
      setFormData({ name: '', email: '', password: '', bus_id: '' });
      setIsAddingNew(false);
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error('Error adding driver:', err);
      if (err.response?.status === 400 &&
        err.response?.data?.message?.includes('already assigned')) {
        alert(err.response.data.message);
      } else {
        setError(`Failed to add driver: ${err.response?.data?.message || err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };


  // Handle updating a driver
  const handleUpdateDriver = async (e) => {
    e.preventDefault();
    try {
      // Client-side validation - check if bus is already assigned
      const busAssignments = getBusAssignments();
      if (formData.bus_id && busAssignments[formData.bus_id]) {
        alert(`This bus is already assigned to driver: ${busAssignments[formData.bus_id]}`);
        return;
      }

      setLoading(true);
      setError('');

      const response = await axios.put(
        getApiUrl(api.endpoints.adminUpdateDriver(editingDriver.id)),
        formData,
        { headers: { Authorization: `Bearer ${user.token}` } }
      );

      //console.log('Driver updated successfully:', response.data);
      setFormData({ name: '', email: '', password: '', bus_id: '' });
      setEditingDriver(null);
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error('Error updating driver:', err);
      if (err.response?.status === 400 &&
        err.response?.data?.message?.includes('already assigned')) {
        alert(err.response.data.message);
      } else {
        setError(`Failed to update driver: ${err.response?.data?.message || err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };


  // Handle deleting a driver
  const handleDeleteDriver = async (driverId) => {
    if (!window.confirm('Are you sure you want to delete this driver?')) {
      return;
    }

    try {
      setLoading(true);
      setError('');

      await axios.delete(
        getApiUrl(api.endpoints.adminDeleteDriver(driverId)),
        { headers: { Authorization: `Bearer ${user.token}` } }
      );

      //console.log('Driver deleted successfully');

      // Refresh data
      setRefreshTrigger(prev => prev + 1);

    } catch (err) {
      console.error('Error deleting driver:', err);
      setError(`Failed to delete driver: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Set up edit mode for a driver
  const handleEditClick = (driver) => {
    setEditingDriver(driver);
    setFormData({
      name: driver.username || '',
      email: driver.email || '',
      password: '', // Don't show the current password
      bus_id: driver.bus_id || ''
    });
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingDriver(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      bus_id: ''
    });
  };

  if (loading && drivers.length === 0) {
    return <div className="loading-container">Loading driver data...</div>;
  }

  return (
    <div className="driver-management">
      <h2>Manage Drivers</h2>

      {error && (
        <div className="error-message">
          <p>{error}</p>
        </div>
      )}

      <div className="action-bar">
        <button
          onClick={() => {
            setIsAddingNew(true);
            setEditingDriver(null);
          }}
          disabled={isAddingNew || editingDriver}
          className="add-button"
        >
          Add New Driver
        </button>
      </div>

      {/* Form for adding or editing driver */}
      {(isAddingNew || editingDriver) && (
        <div className="form-container">
          <h3>{editingDriver ? 'Edit Driver' : 'Add New Driver'}</h3>
          <form onSubmit={editingDriver ? handleUpdateDriver : handleAddDriver}>
            <div className="form-group">
              <label htmlFor="name">Driver Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">
                {editingDriver ? 'Password (leave blank to keep current)' : 'Password'}
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required={!editingDriver}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="bus_id">Assigned Bus</label>
              <select
                id="bus_id"
                name="bus_id"
                value={formData.bus_id || ''}
                onChange={handleChange}
                className="form-control"
                disabled={loading}
              >
                <option value="">-- No Bus Assigned --</option>
                {buses.map(bus => {
                  const busAssignments = getBusAssignments();
                  const isAssigned = Boolean(busAssignments[bus.id]);

                  return (
                    <option
                      key={bus.id}
                      value={bus.id}
                      disabled={isAssigned}
                    >
                      {bus.name} {isAssigned ? `(Assigned to ${busAssignments[bus.id]})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="form-buttons">
              <button type="submit" disabled={loading}>
                {loading ? 'Saving...' : editingDriver ? 'Update Driver' : 'Add Driver'}
              </button>

              <button
                type="button"
                onClick={() => editingDriver ? handleCancelEdit() : setIsAddingNew(false)}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Drivers table */}
      {drivers.length === 0 ? (
        <div className="no-data-message">
          <p>No drivers found. Add your first driver using the button above.</p>
        </div>
      ) : (
        <div className="drivers-table">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Assigned Bus</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map(driver => (
                <tr key={driver.id}>
                  <td>{driver.id}</td>
                  <td>{driver.username}</td>
                  <td>{driver.email}</td>
                  <td>
                    {driver.bus_id ?
                      buses.find(b => b.id === driver.bus_id)?.name || `Bus #${driver.bus_id}` :
                      'Not Assigned'
                    }
                  </td>
                  <td className="actions">
                    <button onClick={() => handleEditClick(driver)}>Edit</button>
                    <button
                      onClick={() => handleDeleteDriver(driver.id)}
                      className="delete-button"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default DriverManagement;
