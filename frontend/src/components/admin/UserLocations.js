import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import axios from 'axios';
import L from 'leaflet';
import api, { getApiUrl } from '../../utils/api2.js';

// Fix for default marker icon in Leaflet with React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Create different icons for different user types
const createIcon = (userType) => {
  const iconUrl = userType === 'driver' ? 
    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png' : 
    userType === 'admin' ?
    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png' :
    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png';
  
  return L.icon({
    iconUrl,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
};

function UserLocations({ user }) {
  const [rawLocations, setRawLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterText, setFilterText] = useState('');
  const [mapCenter, setMapCenter] = useState([22.3190, 87.3091]); // Default IIT KGP coordinates
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const mapRef = useRef(null);
  
  // Process raw locations to get only the most recent location for each user
  const locations = useMemo(() => {
    // Group by user_id and keep only most recent entry
    const userMap = new Map();
    
    rawLocations.forEach(location => {
      // Handle different possible ID keys in the data
      const userId = location.user_id || location.id;
      
      if (!userId) return; // Skip entries without a valid user ID
      
      if (!userMap.has(userId) || 
          new Date(location.timestamp) > new Date(userMap.get(userId).timestamp)) {
        userMap.set(userId, location);
      }
    });
    
    return Array.from(userMap.values());
  }, [rawLocations]);
  
  const fetchUserLocations = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await axios.get(
        getApiUrl(api.endpoints.adminUserLocations),
        { headers: { Authorization: `Bearer ${user.token}` }, withCredentials: true }
      );
      
      if (response.data && Array.isArray(response.data)) {
        ////console.log('User locations loaded:', response.data.length);
        setRawLocations(response.data);
        setLastRefresh(new Date());
        
        if (response.data.length > 0 && mapRef.current) {
          // Find a suitable center point for the map
          const validLocations = response.data.filter(
            loc => loc && loc.latitude && loc.longitude
          );
          
          if (validLocations.length > 0) {
            const firstLocation = validLocations[0];
            setMapCenter([
              firstLocation.latitude || firstLocation.coordinates?.latitude, 
              firstLocation.longitude || firstLocation.coordinates?.longitude
            ]);
          }
        }
      } else {
        console.warn("Unexpected response format:", response.data);
        setRawLocations([]);
      }
    } catch (err) {
      setError('Failed to fetch user locations: ' + err.message);
      console.error('Error fetching user locations:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Initial fetch and polling interval
  useEffect(() => {
    let intervalId;

    const fetchLocations = async () => {
      await fetchUserLocations();
    };

    fetchLocations(); // Initial fetch

    intervalId = setInterval(() => {
      fetchLocations();
    }, 5000); // 5 seconds

    return () => {
      clearInterval(intervalId);
    };
  }, [user.token]);
  
  // Filter locations based on search text - ensure we check all possible fields
  const filteredLocations = locations.filter(location => {
    const searchText = filterText.toLowerCase();
    
    // Check all possible name/identifier fields in the data
    return (
      (location.username?.toLowerCase() || '').includes(searchText) ||
      (location.user_name?.toLowerCase() || '').includes(searchText) ||
      (location.email?.toLowerCase() || '').includes(searchText) ||
      (location.fullName?.toLowerCase() || '').includes(searchText) ||
      (location.role?.toLowerCase() || '').includes(searchText) ||
      (location.type?.toLowerCase() || '').includes(searchText)
    );
  });
  
  // Calculate statistics with better role detection
  const userCounts = {
    total: filteredLocations.length,
    drivers: filteredLocations.filter(loc => {
      const role = loc.role || loc.type || '';
      return role.toLowerCase() === 'driver';
    }).length,
    users: filteredLocations.filter(loc => {
      const role = loc.role || loc.type || '';
      return role.toLowerCase() === 'user' || role === '';
    }).length,
    admins: filteredLocations.filter(loc => {
      const role = loc.role || loc.type || '';
      return role.toLowerCase() === 'admin';
    }).length
  };
  
  // Format timestamp in a readable way
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    
    return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString();
  };
  
  // Get the right marker coordinates regardless of data format
  const getMarkerCoordinates = (location) => {
    // Handle different possible data formats
    if (location.coordinates) {
      return [
        location.coordinates.latitude || location.coordinates.lat,
        location.coordinates.longitude || location.coordinates.lng
      ];
    } else {
      return [location.latitude, location.longitude];
    }
  };
  
  // Get the status of the location based on timestamp
  const getLocationStatus = (timestamp) => {
    if (!timestamp) return 'unknown';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffMinutes < 15) return 'active';
    if (diffMinutes < 60) return 'recent';
    if (diffMinutes < 24 * 60) return 'today';
    return 'old';
  };
  
  // Get the right user role regardless of data format
  const getUserRole = (location) => {
    const role = location.role || location.type || 'user';
    return role.toLowerCase();
  };
  
  if (loading && locations.length === 0) {
    return <div>Loading user locations...</div>;
  }
  
  return (
    <div className="user-locations">
      <h2>User Location Tracking</h2>
      {error && <div className="error-message">{error}</div>}
      
      <div className="action-buttons">
        <button 
          onClick={fetchUserLocations} 
          disabled={loading} 
          className="refresh-button"
        >
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>
      
      <div className="last-updated">
        Last updated: {formatTimestamp(lastRefresh)}
      </div>
      
      <div className="filter-container">
        <input
          type="text"
          placeholder="Filter by name, email or type..."
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
        />
      </div>
      
      {/* <div className="user-stats">
        <div className="stat-box">
          <span className="stat-value">{userCounts.total}</span>
          <span className="stat-label">Total Users</span>
        </div>
        <div className="stat-box">
          <span className="stat-value">{userCounts.drivers}</span>
          <span className="stat-label">Drivers</span>
        </div>
        <div className="stat-box">
          <span className="stat-value">{userCounts.users}</span>
          <span className="stat-label">Passengers</span>
        </div>
        <div className="stat-box">
          <span className="stat-value">{userCounts.admins}</span>
          <span className="stat-label">Admins</span>
        </div>
      </div> */}
      
      {filteredLocations.length > 0 ? (
        <div className="map-container">
          <MapContainer
            center={mapCenter}
            zoom={15}
            style={{ height: "500px", width: "100%" }}
            ref={mapRef}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {filteredLocations.map(location => {
              const role = getUserRole(location);
              const coordinates = getMarkerCoordinates(location);
              
              // Only show marker if we have valid coordinates
              if (coordinates[0] && coordinates[1] && 
                  !isNaN(coordinates[0]) && !isNaN(coordinates[1])) {
                return (
                  <Marker
                    key={location.id || location.user_id || location._id}
                    position={coordinates}
                    icon={createIcon(role)}
                  >
                    <Popup>
                      <div className="location-popup">
                        <strong>{location.username || location.user_name || 'Unknown User'}</strong>
                        <p>Role: {role}</p>
                        <p>Last seen: {formatTimestamp(location.timestamp)}</p>
                        <p>Coordinates: {coordinates[0].toFixed(6)}, {coordinates[1].toFixed(6)}</p>
                      </div>
                    </Popup>
                  </Marker>
                );
              }
              return null;
            })}
          </MapContainer>
        </div>
      ) : (
        <div className="no-locations">
          <p>No user locations found matching your search criteria.</p>
        </div>
      )}
      
      <div className="users-table">
        <h3>User Location Details {filteredLocations.length > 0 && `(${filteredLocations.length})`}</h3>
        {filteredLocations.length === 0 ? (
          <p>No user locations found matching your search criteria.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Last Updated</th>
                <th>Status</th>
                <th>Coordinates</th>
              </tr>
            </thead>
            <tbody>
              {filteredLocations.map(location => {
                const role = getUserRole(location);
                const coordinates = getMarkerCoordinates(location);
                const status = getLocationStatus(location.timestamp);
                
                return (
                  <tr key={location.id || location.user_id || location._id} 
                      className={`status-${status} role-${role}`}>
                    <td>{location.username || location.user_name || 'Unknown'}</td>
                    <td>{location.email || location.fullName || 'Not provided'}</td>
                    <td>
                      <span className={`role-badge role-${role}`}>{role}</span>
                    </td>
                    <td>{formatTimestamp(location.timestamp)}</td>
                    <td>
                      <span className={`status-indicator ${status}`}>
                        {status === 'active' ? 'Active now' : 
                         status === 'recent' ? 'Recently active' :
                         status === 'today' ? 'Active today' : 'Not recent'}
                      </span>
                    </td>
                    <td>
                      {coordinates[0] && coordinates[1] ? 
                        `${coordinates[0].toFixed(6)}, ${coordinates[1].toFixed(6)}` : 
                        'Invalid coordinates'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default UserLocations;

