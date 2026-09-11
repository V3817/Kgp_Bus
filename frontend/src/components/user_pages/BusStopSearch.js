import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import api from '../../utils/api';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import '../../css/user.css';

// Bus stop icon
const busStopIcon = new L.Icon({
    iconUrl: '/images/bus-stop.png', // Make sure this file exists in public folder
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24]
});

// User location icon - BLUE color as requested
const userIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Search marker icon - RED color as requested
const searchMarkerIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Configure OSRM routing to load faster - similar to BusTracking.js
function configureRoutingMachine() {
  if (typeof L !== 'undefined' && L.Routing) {
    // Modify the global routing options - increased timeout like in RouteManagement.js
    L.Routing.Itinerary.prototype.options.createGeocoderPane = false;
    L.Routing.timeout = 30 * 1000; // 30 seconds timeout - increased from 15s to match RouteManagement.js

    // Override the error handling globally
    if (L.Routing.ErrorControl && L.Routing.ErrorControl.prototype) {
      L.Routing.ErrorControl.prototype._routingErrorHandler = function (e) {
        console.warn("Handled routing error:", e);
        // No UI updates or errors thrown
      };
    }

    // Fix issues with the layer removal
    if (L.Routing.Line && L.Routing.Line.prototype) {
      const originalClearLines = L.Routing.Line.prototype._clearLines;
      L.Routing.Line.prototype._clearLines = function () {
        try {
          // Safety check before calling the original function
          if (this._map && this._route && this._route._layers) {
            originalClearLines.call(this);
          }
        } catch (e) {
          console.warn("Protected from _clearLines error:", e);
          // Manual cleanup as fallback
          if (this._map && this._route) {
            try {
              this._map.removeLayer(this._route);
            } catch (e) {
              console.warn("Also failed with manual cleanup:", e);
            }
          }
        }
      };
    }
    
    // Add global routing control tracker similar to RouteManagement.js approach
    if (!window.L.Routing._routingControls) {
      window.L.Routing._routingControls = [];
    }
  }
}

// Component to handle routing between points - Improved with approach from RouteManagement.js
const RoutingControl = ({ startPoint, endPoint, color = '#3388ff', weight = 4, setIsPathLoading }) => {
  const map = useMap();
  const routingControlRef = useRef(null);
  const timeoutRef = useRef(null);
  const routeLayerRef = useRef(null);

  useEffect(() => {
    if (!startPoint || !endPoint) return;

    // Configure routing machine when component mounts
    configureRoutingMachine();

    // Indicate loading has started
    setIsPathLoading(true);

    // Clean up function to handle all cleanup tasks
    const cleanup = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      // Proper cleanup for routing control
      if (routingControlRef.current) {
        try {
          // Remove from global tracking if it exists
          if (window.L.Routing._routingControls) {
            const idx = window.L.Routing._routingControls.indexOf(routingControlRef.current);
            if (idx >= 0) window.L.Routing._routingControls.splice(idx, 1);
          }
          
          // Check if this is a routing control
          if (map.hasLayer(routingControlRef.current)) {
            map.removeControl(routingControlRef.current);
          }
        } catch (err) {
          console.warn("Error during route control cleanup:", err);
        }
        routingControlRef.current = null;
      }
      
      // Clean up any route layers we've tracked
      if (routeLayerRef.current && map.hasLayer(routeLayerRef.current)) {
        try {
          map.removeLayer(routeLayerRef.current);
        } catch (err) {
          console.warn("Error removing route layer:", err);
        }
        routeLayerRef.current = null;
      }
      
      // Reset loading state
      setIsPathLoading(false);
    };

    // First perform cleanup to remove any existing routes
    cleanup();

    try {
      // Create a waypoints array with explicit L.latLng objects
      const waypoints = [
        L.latLng(startPoint[0], startPoint[1]),
        L.latLng(endPoint[0], endPoint[1])
      ];
      
      ////console.log("Creating OSRM route with waypoints:", waypoints);
      
      const routingControl = L.Routing.control({
        waypoints: waypoints,
        routeWhileDragging: false,
        showAlternatives: false,
        addWaypoints: false,
        fitSelectedRoutes: false,
        show: false,
        lineOptions: {
          styles: [{ color, opacity: 0.7, weight }],
          extendToWaypoints: true,
          missingRouteTolerance: 10 // Increased from 0 to 10 as in RouteManagement.js
        },
        createMarker: () => null, // No markers from routing
        serviceUrl: 'https://router.project-osrm.org/route/v1' // Explicitly set OSRM service
      });

      // Add to global tracking
      if (window.L.Routing._routingControls) {
        window.L.Routing._routingControls.push(routingControl);
      }

      // Add listeners to handle loading state
      routingControl.on('routesfound', (e) => {
        ////console.log("OSRM routes found:", e);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        
        // Try to store reference to the route layer
        if (e.routes && e.routes.length > 0) {
          // Keep reference to the actual route layer for easier cleanup
          setTimeout(() => {
            map.eachLayer(layer => {
              if (layer._route && !routeLayerRef.current) {
                routeLayerRef.current = layer;
              }
            });
          }, 100);
        }
        
        // Add a longer delay before hiding the loading overlay
        // This ensures routes are fully rendered before the overlay disappears
        setTimeout(() => {
          ////console.log("Routes should be fully rendered now, hiding loading overlay");
          setIsPathLoading(false);
        }, 1000); // 1 second after routes are drawn
      });
      
      routingControl.on('routingerror', (e) => {
        console.warn("Routing error occurred:", e);
        // Ensure loading overlay is hidden on error
        setIsPathLoading(false);
      });

      // Store the reference for cleanup
      routingControlRef.current = routingControl;
      
      // Add to map - with delay to ensure proper initialization
      setTimeout(() => {
        try {
          if (map && routingControlRef.current) {
            routingControlRef.current.addTo(map);
          }
        } catch (err) {
          console.error("Error adding routing control to map:", err);
          setIsPathLoading(false);
        }
      }, 100);

      // Set timeout for OSRM - increased to match RouteManagement.js approach
      timeoutRef.current = setTimeout(() => {
        ////console.log("OSRM routing timed out after 30 seconds");
        cleanup(); // Clean up routing control and stop loading
      }, 30000); // Increased timeout to 30 seconds to match RouteManagement.js

      return cleanup;
      
    } catch (error) {
      console.error("Error setting up routing:", error);
      // Make sure loading state is reset if there's an error
      setIsPathLoading(false);
      return cleanup;
    }
  }, [map, startPoint, endPoint, color, weight, setIsPathLoading]);

  return null;
};

// Component to update map center when user location changes
const MapController = ({ center, zoom }) => {
    const map = useMap();
    
    useEffect(() => {
        if (center) {
            map.setView(center, zoom || map.getZoom());
        }
    }, [map, center, zoom]);
    
    return null;
};

// Button to center on user's location
const LocationButton = ({ userLocation, onClick }) => {
    return (
        <button 
            className="location-button" 
            onClick={onClick}
            disabled={!userLocation}
            title="Center map on your location"
        >
            <i className="fas fa-location-arrow"></i> Your Current Location
        </button>
    );
};

const BusStopSearch = ({ userLocation, setUserLocation }) => {
    const [busStops, setBusStops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [mapCenter, setMapCenter] = useState(userLocation || [22.3190, 87.3091]); // Default to user location if available
    const [zoom, setZoom] = useState(15);
    const [coordinates, setCoordinates] = useState({
        latitude: '',
        longitude: ''
    });
    const [searchMarker, setSearchMarker] = useState(userLocation || [22.3190, 87.3091]);
    const [searchResults, setSearchResults] = useState([]);
    const [hasSearched, setHasSearched] = useState(false);
    const [isPathLoading, setIsPathLoading] = useState(false);
    const [selectedStop, setSelectedStop] = useState(null);
    const [routeStartLocation, setRouteStartLocation] = useState(null); // Store the user location used for routing
    
    const [locationQuery, setLocationQuery] = useState('');
    const [locationSearching, setLocationSearching] = useState(false);
    const [locationError, setLocationError] = useState(null);
    
    const [locationResults, setLocationResults] = useState([]);
    const [showLocationResults, setShowLocationResults] = useState(false);
    
    const mapRef = useRef(null);
    const markerRefs = useRef({});
    
    const registerMarker = (id, markerRef) => {
        if (markerRef) {
            markerRefs.current[id] = markerRef;
        }
    };

    const clearExistingRoutes = () => {
        const map = mapRef.current?._leaflet_map;
        if (!map) return;
        
        ////console.log("Clearing all existing routes");
        try {
            if (map._container) {
                const routingContainers = map._container.querySelectorAll('.leaflet-routing-container');
                routingContainers.forEach(container => {
                    container.remove();
                });
            }
            
            if (window.L && window.L.Routing && window.L.Routing._routingControls) {
                window.L.Routing._routingControls.forEach(control => {
                    try {
                        if (map.hasLayer(control)) {
                            map.removeControl(control);
                        }
                    } catch (err) {
                        console.warn("Error removing global routing control:", err);
                    }
                });
                window.L.Routing._routingControls = [];
            }
            
            const layersToRemove = [];
            
            map.eachLayer(layer => {
                try {
                    const isRoutingLayer = 
                        layer._route || 
                        layer._routing ||
                        (layer instanceof L.Polyline) ||
                        (layer._leaflet_id && layer._path) || 
                        (layer.options && (
                            layer.options.dashArray === '5, 10' || 
                            layer.options.color === "#ff6b6b" ||
                            (layer._latlngs && Array.isArray(layer._latlngs))
                        ));
                        
                    if (isRoutingLayer) {
                        ////console.log("Marking layer for removal:", layer);
                        layersToRemove.push(layer);
                    }
                } catch (err) {
                    console.warn("Error checking layer for removal:", err);
                }
            });
            
            layersToRemove.forEach(layer => {
                try {
                    map.removeLayer(layer);
                } catch (err) {
                    console.warn("Error removing layer:", err);
                    if (layer._container && layer._container.parentNode) {
                        layer._container.parentNode.removeChild(layer._container);
                    }
                }
            });
        } catch (err) {
            console.error("Error during route clearing:", err);
        } finally {
            setSelectedStop(null);
            setIsPathLoading(false);
        }
    };

    useEffect(() => {
        if (userLocation) {
            setCoordinates({
                latitude: userLocation[0].toFixed(6),
                longitude: userLocation[1].toFixed(6)
            });
            setMapCenter(userLocation);
            setSearchMarker(userLocation);
            // Do NOT update routeStartLocation here
        }
    }, [userLocation]);

    // Add this effect to update user location every second for live pin movement (high accuracy)
    useEffect(() => {
        let geoWatchId;
        if (navigator.geolocation && typeof setUserLocation === 'function') {
            geoWatchId = navigator.geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    setUserLocation([latitude, longitude]);
                },
                (err) => {
                    // Handle error if needed
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
            );
        }
        return () => {
            if (geoWatchId && navigator.geolocation) {
                navigator.geolocation.clearWatch(geoWatchId);
            }
        };
    }, [setUserLocation]);
    
    const fetchBusStops = async () => {
        try {
            ////console.log('Fetching bus stops from API');
            const response = await api.get('/bus_stops/getAllBusStops');
            
            if (response.data && response.data.data) {
                return response.data.data;
            } else {
                console.error('Invalid response format:', response.data);
                return [];
            }
        } catch (error) {
            console.error('Error fetching bus stops from database:', error);
            throw error;
        }
    };
    
    useEffect(() => {
        const loadBusStops = async () => {
            try {
                setLoading(true);
                const data = await fetchBusStops();
                
                const busStopsArray = Array.isArray(data) ? data : [];
                
                const cleanedData = busStopsArray.map(stop => ({
                    ...stop,
                    latitude: parseFloat(stop.latitude),
                    longitude: parseFloat(stop.longitude)
                }));
                
                setBusStops(cleanedData);
                setError(null);
            } catch (err) {
                console.error("Error loading bus stops:", err);
                setError("Failed to load bus stops. Please try again later.");
            } finally {
                setLoading(false);
            }
        };
        
        loadBusStops();
    }, []);
    
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setCoordinates(prev => ({
            ...prev,
            [name]: value
        }));
    };
    
    const handleCenterOnUser = () => {
        if (userLocation) {
            setMapCenter(userLocation);
            setZoom(19);

            setCoordinates({
                latitude: userLocation[0].toFixed(6),
                longitude: userLocation[1].toFixed(6)
            });
        }
    };
    
    const handleSearch = () => {
        try {
            const lat = parseFloat(coordinates.latitude);
            const lng = parseFloat(coordinates.longitude);
            
            if (isNaN(lat) || isNaN(lng) || 
                lat < -90 || lat > 90 || 
                lng < -180 || lng > 180) {
                setError("Please enter valid coordinates");
                return;
            }
            
            clearExistingRoutes();
            setSelectedStop(null);
            setRouteStartLocation(null);
            
            setError(null);
            setSearchMarker([lat, lng]);
            
            if (!Array.isArray(busStops) || busStops.length === 0) {
                setError("No bus stops data available");
                setSearchResults([]);
                setHasSearched(true);
                return;
            }
            
            const results = busStops.map(stop => {
                if (stop === null || typeof stop !== 'object' || 
                    typeof stop.latitude !== 'number' || 
                    typeof stop.longitude !== 'number' || 
                    isNaN(stop.latitude) || isNaN(stop.longitude)) {
                    return null;
                }
                
                const distance = calculateDistance(
                    lat, lng,
                    stop.latitude, stop.longitude
                );
                
                return {
                    ...stop,
                    distance: distance
                };
            }).filter(stop => stop !== null);
            
            const sortedResults = [...results].sort((a, b) => a.distance - b.distance);
            setSearchResults(sortedResults);
            setHasSearched(true);
            
            setMapCenter([lat, lng]);
            setZoom(16);
        } catch (error) {
            console.error("Search error:", error);
            setError("An error occurred during search. Please try again.");
        }
    };
    
    const handleStopSelect = (stop) => {
        try {
            ////console.log("Stop selected:", stop);
            
            // First, explicitly call clearExistingRoutes to remove any existing routes
            clearExistingRoutes();
            setIsPathLoading(true);
            setTimeout(() => {
                setSelectedStop(stop);
                setRouteStartLocation(searchMarker ? [...searchMarker] : null); // Use red pin for routing
                const marker = markerRefs.current[stop.id];
                if (marker) {
                    marker.openPopup();
                }
            }, 500);
        } catch (err) {
            setIsPathLoading(false);
        }
    };

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
            return Infinity;
        }
        
        try {
            const R = 6371e3;
            const φ1 = lat1 * Math.PI / 180;
            const φ2 = lat2 * Math.PI / 180;
            const Δφ = (lat2 - lat1) * Math.PI / 180;
            const Δλ = (lon2 - lon1) * Math.PI / 180;
            
            const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                    Math.cos(φ1) * Math.cos(φ2) *
                    Math.sin(Δλ/2) * Math.sin(Δλ/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            
            return R * c;
        } catch (error) {
            console.error("Error calculating distance:", error);
            return Infinity;
        }
    };
    
    const formatDistance = (meters) => {
        if (meters < 1000) {
            return `${Math.round(meters)} meters`;
        } else {
            return `${(meters / 1000).toFixed(2)} km`;
        }
    };
    
    const handleLocationSearch = async () => {
        if (!locationQuery.trim()) {
            setLocationError("Please enter a location to search");
            return;
        }
        
        try {
            setLocationSearching(true);
            setLocationError(null);
            
            clearExistingRoutes();
            
            setLocationResults([]);
            setShowLocationResults(false);
            
            const response = await axios.get(`https://nominatim.openstreetmap.org/search`, {
                params: {
                    q: locationQuery,
                    format: 'json',
                    limit: 5,
                    addressdetails: 1
                },
                headers: {
                    'Accept-Language': 'en-US,en;q=0.9',
                    'User-Agent': 'KGP_Bus_Application'
                },
                withCredentials: true
            });
            
            if (response.data && response.data.length > 0) {
                ////console.log('Location search results:', response.data);
                
                // Store all location results
                setLocationResults(response.data);
                setShowLocationResults(true);
                
                if (response.data.length === 1) {
                    handleLocationSelect(response.data[0]);
                }
            } else {
                setLocationError("No location found with that name. Try being more specific.");
            }
        } catch (error) {
            console.error("Error searching for location:", error);
            setLocationError("Failed to search location. Please try again later.");
        } finally {
            setLocationSearching(false);
        }
    };
    
    const handleLocationSelect = (location) => {
        const lat = parseFloat(location.lat);
        const lng = parseFloat(location.lon);
        
        setCoordinates({
            latitude: lat.toFixed(6),
            longitude: lng.toFixed(6)
        });
        
        setSearchMarker([lat, lng]);
        
        setMapCenter([lat, lng]);
        setZoom(15);
        
        setShowLocationResults(false);
        ////console.log(`Selected location: ${location.display_name} at ${lat}, ${lng}`);
    };

    return (
        <div className="bus-stop-search">
            {isPathLoading && (
                <div className="full-page-loading-overlay">
                    <div className="spinner"></div>
                    <div>Please wait, routes are being fetched...</div>
                </div>
            )}
            
            <div className="location-panel">
                <div className="location-panel-top">
                    <h2>Search Bus Stops</h2>
                    
                    <div className="location-search-container">
                        <div className="form-group">
                            <label htmlFor="location-search">Search by Location Name:</label>
                            <div className="search-input-group">
                                <input
                                    type="text"
                                    id="location-search"
                                    className="form-control"
                                    placeholder="TATA Sports Complex"
                                    value={locationQuery}
                                    onChange={(e) => setLocationQuery(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleLocationSearch()}
                                />
                                <button 
                                    className="location-search-btn"
                                    onClick={handleLocationSearch}
                                    disabled={locationSearching}
                                >
                                    {locationSearching ? 'Searching...' : 'Find'}
                                </button>
                            </div>
                            {locationError && <div className="error-message">{locationError}</div>}
                            <p className="help-text">Enter a location name, address, or landmark to search</p>
                            
                            {showLocationResults && locationResults.length > 0 && (
                                <div className="location-results">
                                    <h4>Select a location:</h4>
                                    <div className="results-list">
                                        {locationResults.map((location, index) => (
                                            <div 
                                                key={index} 
                                                className="result-item location-result-item"
                                                onClick={() => handleLocationSelect(location)}
                                            >
                                                <div className="result-index">{index + 1}</div>
                                                <div className="result-details">
                                                    <h4>{location.name || location.display_name.split(',')[0]}</h4>
                                                    <p className="location-address">
                                                        {location.display_name}
                                                    </p>
                                                    <p className="coordinates">
                                                        {parseFloat(location.lat).toFixed(6)}, {parseFloat(location.lon).toFixed(6)}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {error && <div className="error-message">{error}</div>}
                    
                    <div className="search-form">
                        <div className="form-group">
                            <label htmlFor="latitude">Latitude:</label>
                            <input 
                                type="text" 
                                id="latitude" 
                                name="latitude" 
                                value={coordinates.latitude} 
                                onChange={handleInputChange} 
                                placeholder="e.g. 22.3190"
                            />
                        </div>
                        
                        <div className="form-group">
                            <label htmlFor="longitude">Longitude:</label>
                            <input 
                                type="text" 
                                id="longitude" 
                                name="longitude" 
                                value={coordinates.longitude} 
                                onChange={handleInputChange} 
                                placeholder="e.g. 87.3091"
                            />
                        </div>
                        
                        <p className="help-text">Click on the map to set coordinates or use your current location</p>
                        
                        <button 
                            className="search-btn"
                            onClick={handleSearch}
                            disabled={loading}
                        >
                            {loading ? 'Loading...' : 'Find Nearest Bus Stops'}
                        </button>
                    </div>
                </div>
                
                <div className="location-panel-bottom">
                    {hasSearched && searchResults.length > 0 && (
                        <div className="search-results">
                            <h3>Nearest Bus Stops</h3>
                            <div className="results-list">
                                {searchResults.map((stop, index) => (
                                    <div 
                                        key={stop.id} 
                                        className="result-item"
                                        onClick={() => handleStopSelect(stop)}
                                    >
                                        <div className="result-index">{index + 1}</div>
                                        <div className="result-details">
                                            <h4>{stop.name}</h4>
                                            <p className="distance">Distance: {formatDistance(stop.distance)}</p>
                                            <p className="coordinates">
                                                {stop.latitude.toFixed(6)}, {stop.longitude.toFixed(6)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {hasSearched && searchResults.length === 0 && (
                        <div className="no-results">
                            <p>No bus stops found near the selected location.</p>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="map-container">
                <MapContainer
                    center={mapCenter}
                    zoom={zoom}
                    style={{ height: "100%", width: "100%" }}
                    ref={(ref) => {
                        if (ref) {
                            mapRef.current = { _leaflet_map: ref };
                        }
                    }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    
                    <MapController center={mapCenter} zoom={zoom} />
                    <MapEvents setCoordinates={setCoordinates} setSearchMarker={setSearchMarker} clearExistingRoutes={clearExistingRoutes} setSelectedStop={setSelectedStop} />
                    
                    {userLocation && (
                        <Marker position={userLocation} icon={userIcon}>
                            <Popup>
                                <div>
                                    <strong>Your Location</strong><br />
                                    {userLocation[0].toFixed(6)}, {userLocation[1].toFixed(6)}
                                </div>
                            </Popup>
                        </Marker>
                    )}
                    
                    {searchMarker && (
                        <Marker position={searchMarker} icon={searchMarkerIcon}>
                            <Popup>
                                <div>
                                    <strong>Search Location</strong><br />
                                    {searchMarker[0].toFixed(6)}, {searchMarker[1].toFixed(6)}
                                </div>
                            </Popup>
                        </Marker>
                    )}
                    
                    {busStops.map(stop => (
                        <Marker
                            key={stop.id}
                            position={[stop.latitude, stop.longitude]}
                            icon={busStopIcon}
                            ref={(ref) => registerMarker(stop.id, ref)}
                        >
                            <Popup>
                                <div>
                                    <strong>{stop.name}</strong><br />
                                    {searchMarker && (
                                        <span>
                                            Distance: {formatDistance(
                                                calculateDistance(
                                                    searchMarker[0], searchMarker[1],
                                                    stop.latitude, stop.longitude
                                                )
                                            )}
                                        </span>
                                    )}
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                    
                    {routeStartLocation && selectedStop && (
                        <RoutingControl
                            key={`route-${selectedStop.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`}
                            startPoint={routeStartLocation}
                            endPoint={[selectedStop.latitude, selectedStop.longitude]}
                            color="#ff6b6b"
                            weight={4}
                            setIsPathLoading={setIsPathLoading}
                        />
                    )}
                    
                    <div className="map-controls">
                        <LocationButton
                            userLocation={userLocation}
                            onClick={handleCenterOnUser}
                        />
                    </div>
                </MapContainer>
            </div>
        </div>
    );
};

const MapEvents = ({ setCoordinates, setSearchMarker, clearExistingRoutes, setSelectedStop }) => {
    useMapEvents({
        click: (e) => {
            const { lat, lng } = e.latlng;
            
            if (typeof clearExistingRoutes === 'function') {
                clearExistingRoutes();
            }
            
            if (typeof setSelectedStop === 'function') {
                setSelectedStop(null);
            }
            
            setCoordinates({
                latitude: lat.toFixed(6),
                longitude: lng.toFixed(6)
            });
            setSearchMarker([lat, lng]);
        }
    });
    
    return null;
};

export default BusStopSearch;
