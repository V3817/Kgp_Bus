import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import api, { getApiUrl } from '../../utils/api2.js';
import '../../css/AdminStyles.css';

axios.defaults.withCredentials = true;

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Component to recenter map when needed
function MapUpdater({ center }) {
  const map = useMap();
  
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  
  return null;
}

function StopManagement({ user }) {
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingStop, setEditingStop] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    latitude: '',
    longitude: ''
  });
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [mapCenter, setMapCenter] = useState([22.3190, 87.3091]); // Default to IIT KGP
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const mapRef = useRef(null);
  const [locationSearch, setLocationSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const fetchStops = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await axios.get(
        getApiUrl(api.endpoints.adminStops),
        {
          headers: { Authorization: `Bearer ${user.token}` },
          withCredentials: true
        }
      );
      
      if (response.data && Array.isArray(response.data)) {
        setStops(response.data);
      
        if (response.data.length > 0) {
          setMapCenter([response.data[0].latitude, response.data[0].longitude]);
        }
        ////console.log("Bus stops loaded from database:", response.data.length);
      } else {
        throw new Error("Invalid data format received");
      }
    } catch (err) {
      setError('Failed to fetch stops: ' + err.message);
      console.error("Error in fetchStops:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.token, refreshTrigger]);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Enhanced function to handle location search
  const handleLocationSearch = async () => {
    if (!locationSearch.trim()) return;
    
    setIsSearching(true);
    setShowResults(false);
    setError('');
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationSearch)}&addressdetails=1&limit=8&countrycodes=in`
      );
      
      if (!response.ok) {
        throw new Error('Search failed with status ' + response.status);
      }
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        const priorityTypes = ['building', 'amenity', 'college', 'university', 'school', 'office'];
        
        const scoredResults = data.map(item => {
          let score = 0;
          
          if (item.type && priorityTypes.includes(item.type)) score += 5;
          if (item.class && priorityTypes.includes(item.class)) score += 3;
          
          const nameLower = item.display_name.toLowerCase();
          const searchLower = locationSearch.toLowerCase();
          if (nameLower.includes(searchLower)) score += 10;
          if (nameLower.startsWith(searchLower)) score += 5;
          
          if (item.address && 
             (item.address.state === 'West Bengal' || 
              item.address.city === 'Kharagpur' || 
              nameLower.includes('kharagpur'))) {
            score += 8;
          }
          
          return { ...item, score };
        });
        
        scoredResults.sort((a, b) => b.score - a.score);
        
        const topResults = scoredResults.slice(0, 5);
        setSearchResults(topResults);
        setShowResults(true);
      } else {
        const fallbackResponse = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationSearch)}&limit=3`
        );
        
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          if (fallbackData && fallbackData.length > 0) {
            setSearchResults(fallbackData);
            setShowResults(true);
            alert('No exact matches found. Showing similar locations.');
          } else {
            alert('No locations found matching your search. Try a different search term or zoom and click on the map.');
          }
        } else {
          alert('No locations found matching your search. Try a different search term or zoom and click on the map.');
        }
      }
    } catch (err) {
      console.error('Location search error:', err);
      alert('Error searching for location: ' + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectLocation = (result) => {
    const { lat, lon, display_name } = result;
    
    const simplifiedName = display_name.split(',')[0] || display_name;
    
    setFormData({
      name: simplifiedName,
      latitude: lat,
      longitude: lon
    });
    
    setMapCenter([parseFloat(lat), parseFloat(lon)]);
    
    setShowResults(false);
    setLocationSearch('');
  };

  const handleAddStop = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      
      const response = await axios.post(
        getApiUrl(api.endpoints.adminAddStop),
        formData,
        { headers: { Authorization: `Bearer ${user.token}` }, withCredentials: true }
      );
      
      if (response.data) {
        ////console.log("Stop added successfully:", response.data);
        setRefreshTrigger(prev => prev + 1);
      } else {
        throw new Error("No data returned");
      }
      
      setFormData({ name: '', latitude: '', longitude: '' });
      setIsAddingNew(false);
    } catch (err) {
      setError('Failed to add stop: ' + err.message);
      console.error("Error in handleAddStop:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditStop = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      
      const response = await axios.put(
        getApiUrl(api.endpoints.adminUpdateStop(editingStop.id)),
        formData,
        { headers: { Authorization: `Bearer ${user.token}` }, withCredentials: true }
      );
      
      if (response.data) {
        ////console.log("Stop updated successfully:", response.data);
        setRefreshTrigger(prev => prev + 1);
      } else {
        throw new Error("No data returned");
      }
      
      setEditingStop(null);
      setFormData({ name: '', latitude: '', longitude: '' });
    } catch (err) {
      setError('Failed to update stop: ' + err.message);
      console.error("Error in handleEditStop:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStop = async (id) => {
    if (!window.confirm('Are you sure you want to delete this bus stop?')) return;
    
    try {
      setError('');
      setLoading(true);
      
      try {
        await axios.delete(
          getApiUrl(api.endpoints.adminDeleteStop(id)),
          { headers: { Authorization: `Bearer ${user.token}` }, withCredentials: true }
        );
        
        ////console.log("Stop deleted successfully");
        setRefreshTrigger(prev => prev + 1);
      } catch (apiError) {
        setError(`Failed to delete stop: ${apiError.response?.data?.message || apiError.message}`);
        console.error("Error deleting stop:", apiError);
      }
    } catch (err) {
      setError('Failed to delete stop: ' + err.message);
      console.error("Error in handleDeleteStop:", err);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (stop) => {
    setEditingStop(stop);
    setFormData({
      name: stop.name,
      latitude: stop.latitude.toString(),
      longitude: stop.longitude.toString()
    });
    setIsAddingNew(false);
    setMapCenter([stop.latitude, stop.longitude]);
  };

  const cancelAction = () => {
    setEditingStop(null);
    setFormData({ name: '', latitude: '', longitude: '' });
    setIsAddingNew(false);
    setSearchResults([]);
    setShowResults(false);
    setLocationSearch('');
  };

  function MapClickHandler() {
    useMapEvents({
      click: (e) => {
        const { lat, lng } = e.latlng;
        setFormData(prev => ({
          ...prev,
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6)
        }));
      }
    });
    return null;
  }

  const newStopPositionMarker = () => {
    if ((isAddingNew || editingStop) && formData.latitude && formData.longitude) {
      try {
        const lat = parseFloat(formData.latitude);
        const lng = parseFloat(formData.longitude);
        
        if (!isNaN(lat) && !isNaN(lng)) {
          return (
            <Marker position={[lat, lng]}>
              <Popup>
                <strong>{formData.name || "New Stop"}</strong><br />
                Coordinates: {lat.toFixed(6)}, {lng.toFixed(6)}
              </Popup>
            </Marker>
          );
        }
      } catch (err) {
        console.error("Error rendering position marker:", err);
      }
    }
    return null;
  };

  if (loading && !stops.length) return <div>Loading bus stops...</div>;

  return (
    <div className="stop-management">
      <h2>Bus Stop Management</h2>
      {error && <div className="error-message">{error}</div>}
      
      <div className="action-buttons">
        <button 
          className="add-button"
          onClick={() => {
            setIsAddingNew(true);
            setEditingStop(null);
            setFormData({ name: '', latitude: '', longitude: '' });
            setSearchResults([]);
            setShowResults(false);
          }}
          disabled={isAddingNew || editingStop}
        >
          Add New Bus Stop
        </button>
        
        <button 
          onClick={() => setRefreshTrigger(prev => prev + 1)}
          disabled={loading}
          className="refresh-button"
        >
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>
      
      <div className="stop-management-content">
        <div className="stop-form-container">
          {isAddingNew && (
            <div className="form-container">
              <h3>Add New Bus Stop</h3>
              
              <div className="location-search-container">
                <h4>Search for a Location</h4>
                <div className="search-input-container">
                  <input 
                    type="text"
                    placeholder="Search for a location by name..."
                    value={locationSearch}
                    onChange={(e) => setLocationSearch(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleLocationSearch()}
                  />
                  <button 
                    type="button" 
                    onClick={handleLocationSearch}
                    disabled={isSearching || !locationSearch.trim()}
                  >
                    {isSearching ? 'Searching...' : 'Search'}
                  </button>
                </div>
                
                {showResults && searchResults.length > 0 && (
                  <div className="search-results">
                    <h5>Select a location:</h5>
                    <ul>
                      {searchResults.map((result, index) => {
                        let displayParts = result.display_name.split(', ');
                        let mainName = displayParts[0];
                        let subLocation = displayParts.slice(1, 3).join(', ');
                        
                        return (
                          <li 
                            key={index} 
                            onClick={() => handleSelectLocation(result)}
                            className="search-result-item"
                          >
                            <div className="result-name">
                              <strong>{mainName}</strong>
                            </div>
                            <div className="result-location">
                              {subLocation}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                
                <div className="search-instructions">
                  <p>Search for a location by name, or click on the map to manually set coordinates.</p>
                </div>
              </div>
              
              <p className="instruction">You can also click on the map to set location or enter coordinates manually below.</p>
              
              <form onSubmit={handleAddStop}>
                <div className="form-group">
                  <label htmlFor="name">Stop Name</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="latitude">Latitude</label>
                  <input
                    type="text"
                    id="latitude"
                    name="latitude"
                    value={formData.latitude}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="longitude">Longitude</label>
                  <input
                    type="text"
                    id="longitude"
                    name="longitude"
                    onChange={handleInputChange}
                    value={formData.longitude}
                    required
                  />
                </div>
                <div className="form-buttons">
                  <button type="submit">Add Stop</button>
                  <button type="button" onClick={cancelAction}>Cancel</button>
                </div>
              </form>
            </div>
          )}
          
          {editingStop && (
            <div className="form-container">
              <h3>Edit Bus Stop</h3>
              <p className="instruction">Click on the map to update location or edit coordinates manually.</p>
              <form onSubmit={handleEditStop}>
                <div className="form-group">
                  <label htmlFor="name">Stop Name</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="latitude">Latitude</label>
                  <input
                    type="text"
                    id="latitude"
                    name="latitude"
                    value={formData.latitude}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="longitude">Longitude</label>
                  <input
                    type="text"
                    id="longitude"
                    name="longitude"
                    onChange={handleInputChange}
                    value={formData.longitude}
                    required
                  />
                </div>
                <div className="form-buttons">
                  <button type="submit">Update Stop</button>
                  <button type="button" onClick={cancelAction}>Cancel</button>
                </div>
              </form>
            </div>
          )}
          
          <div className="stop-list">
            <h3>Current Bus Stops</h3>
            {stops.length === 0 ? (
              <p>No bus stops found in the system.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Coordinates</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stops.map(stop => (
                    <tr key={stop.id}>
                      <td>{stop.id}</td>
                      <td>{stop.name}</td>
                      <td>
                        {stop.latitude.toFixed(6)}, {stop.longitude.toFixed(6)}
                      </td>
                      <td>
                        <button onClick={() => startEditing(stop)}>Edit</button>
                        <button onClick={() => handleDeleteStop(stop.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        
        <div className="stop-map-container">
          <MapContainer
            center={mapCenter}
            zoom={15}
            style={{ height: "500px", width: "100%" }}
            ref={mapRef}
            whenCreated={(map) => {
              mapRef.current = map; 
            }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler />
            <MapUpdater center={mapCenter} />
            
            {stops.map(stop => (
              <Marker
                key={stop.id}
                position={[stop.latitude, stop.longitude]}
              >
                <Popup>
                  <strong>{stop.name}</strong><br />
                  Coordinates: {stop.latitude.toFixed(6)}, {stop.longitude.toFixed(6)}
                </Popup>
              </Marker>
            ))}
            
            {newStopPositionMarker()}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}

export default StopManagement;
