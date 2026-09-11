import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import api from '../../utils/api.js';
import '../../css/busTracking.css';

// Custom bus icon
const busIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/30/30979.png',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16]
});

// User location icon
const userIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1077/1077114.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

// Bus stop icon
const busStopIcon = new L.Icon({
  iconUrl: '/images/bus-stop.png', // File in public folder
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -24]
});

// Configure OSRM routing to load faster
function configureRoutingMachine() {
  if (typeof L !== 'undefined' && L.Routing) {
    // Modify the global routing options
    L.Routing.Itinerary.prototype.options.createGeocoderPane = false;
    L.Routing.timeout = 60 * 1000; // 60 seconds timeout (increased from 10 seconds)

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

    // Add global routing control tracker similar to BusStopSearch.js approach
    if (!window.L.Routing._routingControls) {
      window.L.Routing._routingControls = [];
    }
  }
}

// Component to handle routing between points - Improved with approach from BusStopSearch.js
const RoutingControl = ({ startPoint, endPoint, color = '#3388ff', weight = 4, onControlReady }) => {
  const map = useMap();
  const routingControlRef = useRef(null);
  const timeoutRef = useRef(null);
  const routeLayerRef = useRef(null);

  useEffect(() => {
    if (!startPoint || !endPoint) return;

    // Configure routing machine when component mounts
    configureRoutingMachine();

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
          if (window.L.Routing && window.L.Routing._routingControls) {
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
    };

    // First perform cleanup to remove any existing routes
    cleanup();

    try {
      // Create a waypoints array with explicit L.latLng objects
      const waypoints = [
        L.latLng(startPoint[0], startPoint[1]),
        L.latLng(endPoint[0], endPoint[1])
      ];

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
          missingRouteTolerance: 10 // Increased from 0 to 10 as in BusStopSearch.js
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
      });

      routingControl.on('routingerror', (e) => {
        console.warn("Routing error occurred:", e);
      });

      // Store the reference for cleanup
      routingControlRef.current = routingControl;

      // Add to map - with delay to ensure proper initialization
      setTimeout(() => {
        try {
          if (map && routingControlRef.current) {
            routingControlRef.current.addTo(map);
            // Notify parent component if callback provided
            if (onControlReady) {
              onControlReady(routingControlRef.current);
            }
          }
        } catch (err) {
          console.error("Error adding routing control to map:", err);
        }
      }, 100);

      // Set timeout for OSRM - increased to match BusStopSearch.js approach
      timeoutRef.current = setTimeout(() => {
        console.warn("OSRM routing timed out after 30 seconds");
        cleanup(); // Clean up routing control and stop loading
      }, 30000); // 30 second timeout

      return cleanup;

    } catch (error) {
      console.error("Error setting up routing:", error);
      return cleanup;
    }
  }, [map, startPoint, endPoint, color, weight, onControlReady]);

  return null;
};

// Component to recenter map when needed
const MapViewController = ({ center, zoom, busLocation }) => {
  const map = useMap();

  useEffect(() => {
    if (center && zoom) {
      map.setView(center, zoom);
    } else if (busLocation) {
      map.setView(busLocation, map.getZoom());
    }
  }, [map, center, zoom, busLocation]);

  return null;
};

// Custom location control component
const LocationButton = ({ setUserLocation }) => {
  const map = useMap();

  const handleLocationRequest = () => {
    map.locate({ setView: true, maxZoom: 16 });
  };

  useEffect(() => {
    map.on('locationfound', (e) => {
      setUserLocation([e.latlng.lat, e.latlng.lng]);
      map.flyTo(e.latlng, 16);
    });

    map.on('locationerror', (e) => {
      console.error("Location error:", e.message);
      alert("Unable to find your location. Please check your device settings.");
    });

    return () => {
      map.off('locationfound');
      map.off('locationerror');
    };
  }, [map, setUserLocation]);

  return (
    <div className="location-control">
      <button onClick={handleLocationRequest} title="Show my location">
        <i className="fas fa-location-arrow"></i>
      </button>
    </div>
  );
};

const BusStopMarker = ({ position, stop, onMarkerReady }) => {
  const markerRef = useRef(null);

  useEffect(() => {
    // Notify parent component about the created marker
    if (markerRef.current && onMarkerReady) {
      onMarkerReady(markerRef.current);
    }

    return () => {
      // No need to manually remove, React will handle this
    };
  }, [onMarkerReady]);

  return (
    <Marker
      ref={markerRef}
      position={position}
      icon={busStopIcon}
    >
      <Popup>
        <div className="stop-popup">
          <h3>{stop.name}</h3>
          {stop.estimated_time && (
            <p><strong>ETA:</strong> {stop.estimated_time}</p>
          )}
        </div>
      </Popup>
    </Marker>
  );
};

const BusTracking = ({ userLocation, setUserLocation, hideDropdown = false, selectedBus = null, onDrawingRoutes }) => {
  const [buses, setBuses] = useState([]);
  const [selectedBusState, setSelectedBusState] = useState(selectedBus);
  const [busLocation, setBusLocation] = useState(null);
  const [busStops, setBusStops] = useState([]);
  const [nextStop, setNextStop] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [currentStop, setCurrentStop] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [busInfo, setBusInfo] = useState(null);
  const [mapCenter, setMapCenter] = useState(userLocation || [22.3190, 87.3091]); // Default to IIT KGP
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const intervalRef = useRef(null);
  const [isDrawingRoutes, setIsDrawingRoutes] = useState(false); // Add this state for route drawing overlay

  // State for the custom dropdown
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);

  // States for bus status and map handling
  const [busInService, setBusInService] = useState(true);
  const [busRunning, setBusRunning] = useState(false);
  const [routesDrawn, setRoutesDrawn] = useState(false);

  // Refs to store route data for persistence
  const routeDataRef = useRef(null);
  const mapInstance = useRef(null);

  // Add reference for bus marker to update position smoothly
  const busMarkerRef = useRef(null);

  // Add reference to store routing controls and stop markers for proper cleanup
  const routingControls = useRef([]);
  const stopMarkers = useRef([]);

  // Add state for tracking currently selected stop route
  const [trackedStopId, setTrackedStopId] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [userToStopRoute, setUserToStopRoute] = useState(null);

  // Ref for user-to-stop routing control
  const userToStopRoutingRef = useRef(null);

  // Add isMountedRef to prevent state updates after unmounting
  const isMountedRef = useRef(true);

  // Function to update only bus location without affecting other data
  const updateBusLocationOnly = async (busId) => {
    try {
      const locationResponse = await api.get(`/buses/${busId}/locationOnly`);
      if (locationResponse.data && locationResponse.data.data) {
        const location = locationResponse.data.data;
        const newLocation = [parseFloat(location.latitude), parseFloat(location.longitude)];

        // Update bus location
        setBusLocation(newLocation);

        // Update last updated time
        setLastUpdated(new Date(location.timestamp));

        // Check if bus is running (has recent location data)
        const locationTime = new Date(location.timestamp);
        const now = new Date();
        const timeDiff = (now - locationTime) / (1000 * 60); // difference in minutes

        // If location data is less than 30 minutes old, consider the bus as running
        setBusRunning(timeDiff < 30);

        // If the marker reference exists, update its position smoothly
        if (busMarkerRef.current && busMarkerRef.current.leafletElement) {
          busMarkerRef.current.leafletElement.setLatLng(newLocation);
        }
      }
    } catch (err) {
      console.warn('Error updating bus location:', err);
      // Don't set error state to avoid disrupting the UI
      // Just silently fail and try again on next interval
    }
  };

  // Function to safely clear the user-to-stop route
  const clearUserToStopRoute = () => {
    if (mapInstance.current && userToStopRoutingRef.current) {
      try {
        mapInstance.current.removeControl(userToStopRoutingRef.current);
        userToStopRoutingRef.current = null;
        setTrackedStopId(null);
        setUserToStopRoute(null);
      } catch (err) {
        console.warn("Error clearing user-to-stop route:", err);
      }
    }
  };

  // Function to safely clear the map of all routes and markers
  const clearMap = useCallback(() => {
    // Clear the user-to-stop route if it exists
    clearUserToStopRoute();

    // Only attempt to clear if map is initialized
    if (mapInstance.current) {
      const map = mapInstance.current;

      // Safely remove all routing controls
      if (routingControls.current && routingControls.current.length > 0) {
        routingControls.current.forEach(control => {
          try {
            if (control) {
              map.removeControl(control);
            }
          } catch (err) {
            console.warn("Error clearing routing control:", err);
          }
        });
        routingControls.current = [];
      }

      // Clear all stop markers - this happens automatically with React state
      // Just reset the ref array
      stopMarkers.current = [];
    }
  }, []);

  const clearPreviousData = () => {
    // Clear all map routes and markers first
    clearMap();

    // Clear all previous data
    setBusLocation(null);
    setBusStops([]);
    setNextStop(null);
    setCurrentStop(null);
    setError(null);
    setLastUpdated(null);
    setBusInfo(null);
    setBusInService(true);
    setBusRunning(false);
    setRoutesDrawn(false);

    // Clear the interval if it exists
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Reset route data
    routeDataRef.current = null;
  };

  // Track path to a specific stop
  const trackPathToStop = (stop) => {
    // Don't track if user location isn't available
    if (!userLocation) {
      alert("Please enable location services to track path to bus stop.");
      return;
    }

    // Show the loading overlay while calculating the route
    setIsDrawingRoutes(true);

    // Clear previous user-to-stop route if it exists
    clearUserToStopRoute();

    // Set the tracked stop ID
    setTrackedStopId(stop.id);

    // Create a new routing control from user to stop
    try {
      const stopPosition = [parseFloat(stop.latitude), parseFloat(stop.longitude)];

      // Configure routing machine
      configureRoutingMachine();

      const routingControl = L.Routing.control({
        waypoints: [
          L.latLng(userLocation[0], userLocation[1]),
          L.latLng(stopPosition[0], stopPosition[1])
        ],
        routeWhileDragging: false,
        showAlternatives: false,
        addWaypoints: false,
        fitSelectedRoutes: true,
        show: false,
        lineOptions: {
          styles: [{ color: '#FF5722', opacity: 0.7, weight: 5 }],
          extendToWaypoints: true,
          missingRouteTolerance: 10
        },
        createMarker: () => null // No markers from routing
      });

      // Add the routing control to the map
      routingControl.addTo(mapInstance.current);

      // Store the routing control reference
      userToStopRoutingRef.current = routingControl;

      // Get the route when it's calculated
      routingControl.on('routesfound', (e) => {
        const routes = e.routes;
        if (routes && routes.length > 0) {
          setUserToStopRoute(routes[0]);
          // Hide the loading overlay once the route is drawn
          setTimeout(() => {
            setIsDrawingRoutes(false);
          }, 500);
        }
      });

      // Add a timeout to hide the overlay in case routing takes too long or fails
      setTimeout(() => {
        setIsDrawingRoutes(false);
      }, 10000); // 10 second timeout as fallback
    } catch (error) {
      console.error("Error setting up user-to-stop routing:", error);
      alert("Failed to create route to bus stop. Please try again.");
      setIsDrawingRoutes(false); // Hide loading overlay on error
    }
  };

  // Update user-to-stop route when user location changes
  useEffect(() => {
    // Only update if we have a tracked stop and user location
    if (trackedStopId && userLocation && userToStopRoutingRef.current) {
      const selectedStop = busStops.find(stop => stop.id === trackedStopId);

      if (selectedStop) {
        try {
          const stopPosition = [parseFloat(selectedStop.latitude), parseFloat(selectedStop.longitude)];

          // Update the first waypoint (user location)
          userToStopRoutingRef.current.setWaypoints([
            L.latLng(userLocation[0], userLocation[1]),
            L.latLng(stopPosition[0], stopPosition[1])
          ]);
        } catch (err) {
          console.warn("Error updating user-to-stop route:", err);
        }
      }
    }
  }, [userLocation, trackedStopId, busStops]);

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
                console.error("Error watching position:", err.message);
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

  // Fetch list of buses on mount
  useEffect(() => {
    const loadBuses = async () => {
      try {
        setLoading(true);
        const response = await api.get('/buses/getAllBuses');
        if (response.data && response.data.data) {
          setBuses(response.data.data);
        }
        setLoading(false);
      } catch (err) {
        console.error('Error fetching buses:', err);
        setError('Failed to load buses. Please try again later.');
        setLoading(false);
      }
    };

    loadBuses();
  }, []);

  // Reference callback for map
  const setMapRef = (map) => {
    if (map && !mapInstance.current) {
      mapInstance.current = map;
    }
  };

  // Handle bus marker creation
  const handleBusStopMarkerReady = (marker) => {
    stopMarkers.current.push(marker);
  };

  // Handle routing control creation
  const handleRoutingControlReady = (control) => {
    routingControls.current.push(control);
  };

  useEffect(() => {
    // Set reference for component mounted state
    return () => {
      isMountedRef.current = false;

      // Also clean up interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Add clean up of all map resources when component unmounts
  useEffect(() => {
    return () => {
      clearMap();
    };
  }, [clearMap]); // Added clearMap as a dependency

  useEffect(() => {
    if (hideDropdown && selectedBus) {
      setSelectedBusState(selectedBus);
      // Automatically fetch tracking data for the selected bus
      clearPreviousData();
      setIsDrawingRoutes(true);
      fetchBusData(selectedBus.id);
    }
    // eslint-disable-next-line
  }, [hideDropdown, selectedBus]);

  useEffect(() => {
    if (typeof onDrawingRoutes === 'function') {
      if (!isDrawingRoutes) {
        // Add 3s delay before signaling loading is done
        const timeout = setTimeout(() => onDrawingRoutes(false), 1000);
        return () => clearTimeout(timeout);
      } else {
        onDrawingRoutes(true);
      }
    }
  }, [isDrawingRoutes, onDrawingRoutes]);

  const fetchBusData = async (busId, showLoading = true, refreshDataOnly = false) => {
    try {
      if (showLoading && !refreshDataOnly) {
        setLoading(true);
        clearPreviousData();
        setIsDrawingRoutes(true); // Show route loading overlay
      }
      setError(null);

      // First, try to fetch bus info to get the driver details
      const infoResponse = await api.get(`/buses/${busId}/info`);
      if (infoResponse.data && infoResponse.data.data) {
        setBusInfo(infoResponse.data.data);
      } else {
        if (!refreshDataOnly) setBusInfo(null);
      }

      // Fetch bus location
      const locationResponse = await api.get(`/buses/${busId}/location`);
      if (locationResponse.data && locationResponse.data.data) {
        const location = locationResponse.data.data;
        setBusLocation([parseFloat(location.latitude), parseFloat(location.longitude)]);
        setLastUpdated(new Date(location.timestamp));

        // If this is the initial load or the first refresh after clicking Find
        if ((isInitialLoad || !busLocation) && !refreshDataOnly) {
          setMapCenter([parseFloat(location.latitude), parseFloat(location.longitude)]);
        }

        setBusInService(true);

        // Check if bus is running (has recent location data)
        const locationTime = new Date(location.timestamp);
        const now = new Date();
        const timeDiff = (now - locationTime) / (1000 * 60); // difference in minutes

        // If location data is less than 30 minutes old, consider the bus as running
        setBusRunning(timeDiff < 30);
      } else {
        if (!refreshDataOnly) setBusLocation(null);
        setBusInService(false);
        setBusRunning(false);
      }

      // Now fetch the route with stops if not just refreshing data
      if (!refreshDataOnly || !routeDataRef.current) {
        const routeResponse = await api.get(`/buses/${busId}/route`);
        if (routeResponse.data && routeResponse.data.data) {
          const routeData = routeResponse.data.data;
          routeDataRef.current = routeData;

          // Process stop data with new ETA information
          const stops = routeData.stops.map((stop, index) => {
            let status = 'remaining'; // Default status (blue)
            
            // Get the stops_cleared value from bus data
            const stopsCleared = parseInt(routeData.bus?.stops_cleared || 0);
            
            // Determine status based solely on index vs stopsCleared
            if (index < stopsCleared) {
              status = 'cleared'; // Green (passed)
            } else if (index === stopsCleared) {
              status = 'next'; // Red (next stop)
            }

            // Set estimated time text based on status
            let estimatedTime = '';
            
            if (status === 'cleared' && stop.eta_time) {
              // For cleared stops, show "Passed" with the time
              estimatedTime = `Passed (${stop.eta_time})`;
            } else if (status === 'next' && stop.eta_time) {
              // For next stop, show "Next" with the time
              if (stop.eta_minutes > 0) {
                estimatedTime = `Next (${stop.eta_time}) - ${stop.eta_minutes} min`;
              } else {
                estimatedTime = `Next (${stop.eta_time})`;
              }
            } else if (stop.eta_time) {
              // For remaining stops, just show the time
              if (stop.eta_minutes > 0) {
                estimatedTime = `${stop.eta_time} (${stop.eta_minutes} min)`;
              } else {
                estimatedTime = stop.eta_time;
              }
            }

            return {
              ...stop,
              status,
              estimated_time: estimatedTime
            };
          });

          setBusStops(stops);
          if (routeData.currentStop) setCurrentStop(routeData.currentStop);
          if (routeData.nextStop) setNextStop(routeData.nextStop);
        }
      } else if (refreshDataOnly && busInfo?.estimatedArrival) {
        // If we're just refreshing data but don't have new route info,
        // we'll just update the next stop ETA with the bus info data
        const updatedStops = busStops.map(stop => {
          if (stop.status === 'next') {
            return {
              ...stop,
              estimated_time: `${stop.eta_time || ''} (${busInfo.estimatedArrival} min)`
            };
          }
          return stop;
        });
        setBusStops(updatedStops);
      }

      // Set up the interval to refresh bus location every 5 seconds
      if (busInService && !intervalRef.current) {
        intervalRef.current = setInterval(() => {
          if (routesDrawn) {
            // If routes are already drawn, just update location
            updateBusLocationOnly(busId);
          } else {
            // Otherwise do a full refresh but don't re-render the UI
            fetchBusData(busId, false, true);
          }
        }, 5000); // 5 seconds
      }

      if (showLoading && !refreshDataOnly) {
        setLoading(false);

        // Set a small timeout before drawing routes to ensure the DOM is ready
        setTimeout(() => {
          setRoutesDrawn(true);
          // Hide the loading overlay after routes are drawn (add 1s delay)
          setTimeout(() => {
            setIsDrawingRoutes(false);
          }, 1000);
        }, 3000); // Increased timeout to give more time for routes to draw
      }
      setIsInitialLoad(false);
    } catch (err) {
      console.error('Error fetching bus data:', err);
      if (!refreshDataOnly) {
        setError('Failed to load bus data. Please try again.');
        setBusInService(false);
        setBusRunning(false);
      }
      if (showLoading && !refreshDataOnly) {
        setLoading(false);
        setIsDrawingRoutes(false); // Hide loading overlay on error
      }
    }
  };

  // Filter buses based on search query
  const filteredBuses = buses.filter(bus =>
    bus.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle selecting a bus from the dropdown
  const handleBusSelect = (bus) => {
    setSelectedBusState(bus);
    setSearchQuery(bus.name);
    setIsDropdownOpen(false);
    setError(null);
  };

  return (
    <div className="bus-tracking">
      {/* Add the route loading overlay */}
      {isDrawingRoutes && (
        <div className="route-loading-overlay">
          <div className="spinner"></div>
          <h3>Loading Bus Route</h3>
        </div>
      )}

      <div className="location-panel">
        <h2>Track a BUS</h2>
        {!hideDropdown && (
          <div className="bus-search">
            <div className="custom-dropdown" ref={dropdownRef}>
              <div className="dropdown-header" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  placeholder="Search for a bus..."
                  className="dropdown-search"
                  onClick={(e) => { e.stopPropagation(); setIsDropdownOpen(true); }}
                />
                <div className="dropdown-icon">
                  <i className={`fa fa-chevron-${isDropdownOpen ? 'up' : 'down'}`}></i>
                </div>
              </div>
              {isDropdownOpen && (
                <ul className="dropdown-list">
                  {filteredBuses.length > 0 ? (
                    filteredBuses.map(bus => (
                      <li
                        key={bus.id}
                        onClick={() => handleBusSelect(bus)}
                        className={selectedBusState && selectedBusState.id === bus.id ? 'selected' : ''}
                      >
                        {bus.name}
                      </li>
                    ))
                  ) : (
                    <li className="no-results">No buses found</li>
                  )}
                </ul>
              )}
            </div>
            <button
              className="track-bus-btn"
              onClick={() => {
                if (selectedBusState) {
                  // Explicitly clear the map before fetching new data
                  clearPreviousData();
                  // Show the loading overlay before fetching bus data
                  setIsDrawingRoutes(true);
                  fetchBusData(selectedBusState.id);
                }
              }}
              disabled={!selectedBusState || loading}
            >
              {loading ? 'Loading...' : 'Find'}
            </button>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {/* Bus driver information */}
        {selectedBusState && busInfo && (
          <div className="bus-driver-info">
            <h4>Driver Information</h4>
            {busInfo.driverName ? (
              <>
                <p><strong>Name:</strong> {busInfo.driverName}</p>
                <p><strong>ID:</strong> {busInfo.driver_id || 'N/A'}</p>
              </>
            ) : (
              <p className="no-driver">No driver assigned to this bus.</p>
            )}
          </div>
        )}

        {/* Bus running status */}
        {selectedBusState && busInService && (
          <div className={`bus-running-status ${busRunning ? 'running' : 'not-running'}`}>
            <p>
              <span className="status-indicator"></span>
              {busRunning
                ? 'This bus is currently running and tracking is active.'
                : 'This bus is in service but not currently tracking.'}
            </p>
          </div>
        )}

        {/* Bus not in service message */}
        {selectedBusState && !busInService && (
          <div className="bus-status-message">
            <p className="error-message">This bus is currently out of service.</p>
          </div>
        )}

        {/* Route stops with ordered list and color-coding */}
        {selectedBusState && busStops.length > 0 && (
          <div className="bus-stop-order">
            <h4>Route Stops</h4>
            <ul className="colored-stops-list">
              {[...busStops]
                .sort((a, b) => a.stop_order - b.stop_order)
                .map(stop => (
                  <li
                    key={stop.id}
                    className={`stop-item ${stop.status} ${trackedStopId === stop.id ? 'tracked' : ''}`}
                  >
                    <div className="stop-info">
                      <span className="stop-name"> {stop.name}</span>
                      {stop.estimated_time && (
                        <span className="stop-time">{stop.estimated_time}</span>
                      )}
                    </div>
                    <button
                      className="track-stop-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        trackPathToStop(stop);
                      }}
                      title="Track path to this stop"
                    >
                      {trackedStopId === stop.id ? 'Tracking' : 'Track'}
                    </button>
                  </li>
                ))
              }
            </ul>
          </div>
        )}

        {!selectedBusState && (
          <div className="initial-message">
            <p>Please select a bus from the dropdown above and click Find to track its location.</p>
          </div>
        )}
      </div>

      <div className="map-container">
        <MapContainer
          center={userLocation || [22.3190, 87.3091]}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          ref={setMapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationButton setUserLocation={setUserLocation} />
          {userLocation && (
            <Marker position={userLocation} icon={userIcon}>
              <Popup>Your location</Popup>
            </Marker>
          )}
          {(selectedBusState && busLocation) && (
            <MapViewController center={mapCenter} busLocation={busLocation} />
          )}
          {(selectedBusState && busLocation) && (
            <Marker
              position={busLocation}
              icon={busIcon}
              ref={busMarkerRef}
            >
              <Popup>
                <div className="bus-popup">
                  <h3>{selectedBusState.name}</h3>
                  {busInfo && (
                    <>
                      <p><strong>Driver:</strong> {busInfo.driverName || 'Not assigned'}</p>
                      <p><strong>Last Updated:</strong> {lastUpdated ? lastUpdated.toLocaleTimeString() : 'N/A'}</p>
                      {busInfo.estimatedArrival && nextStop && (
                        <p><strong>ETA to {nextStop.name}:</strong> {busInfo.estimatedArrival} min</p>
                      )}
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Render markers for bus stops with ETA in popup using the component with ref tracking */}
          {selectedBusState && busStops.length > 0 && (
            busStops.map(stop => (
              <BusStopMarker
                key={stop.id}
                position={[parseFloat(stop.latitude), parseFloat(stop.longitude)]}
                stop={stop}
                onMarkerReady={handleBusStopMarkerReady}
              />
            ))
          )}

          {/* Draw full route using Routing Machine */}
          {selectedBusState && busStops.length > 2 && routesDrawn && (
            [...busStops]
              .sort((a, b) => a.stop_order - b.stop_order)
              .map((stop, idx, arr) => {
                // Make sure we're not on the last stop when drawing connections
                if (idx < arr.length - 1) {
                  return (
                    <RoutingControl
                      key={`route-${stop.id}-to-${arr[idx + 1].id}`}
                      startPoint={[parseFloat(stop.latitude), parseFloat(stop.longitude)]}
                      endPoint={[parseFloat(arr[idx + 1].latitude), parseFloat(arr[idx + 1].longitude)]}
                      color="#90CAF9"
                      weight={4}
                      onControlReady={handleRoutingControlReady}
                    />
                  );
                }
                return null;
              })
          )}
        </MapContainer>

        {(selectedBusState && busLocation && busStops.length > 0) && (
          <div className="map-legend">
            <div className="legend-item">
              <div className="legend-icon" style={{ backgroundColor: '#90CAF9' }}></div>
              <span>Bus Route</span>
            </div>
            {trackedStopId && (
              <div className="legend-item">
                <div className="legend-icon" style={{ backgroundColor: '#FF5722' }}></div>
                <span>Your Path to Stop</span>
              </div>
            )}
            <div className="legend-item">
              <div className="legend-icon bus-stop-icon cleared"></div>
              <span>Cleared Stops</span>
            </div>
            <div className="legend-item">
              <div className="legend-icon bus-stop-icon next"></div>
              <span>Next Stop</span>
            </div>
            <div className="legend-item">
              <div className="legend-icon bus-stop-icon remaining"></div>
              <span>Remaining Stops</span>
            </div>
          </div>
        )}
        {!selectedBusState && (
          <div className="map-instructions-overlay">
            <p>Select a bus from the left panel to see its location and route</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BusTracking;