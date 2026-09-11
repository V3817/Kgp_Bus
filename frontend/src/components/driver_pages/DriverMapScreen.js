import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { getApiUrl } from '../../utils/api2.js';
import '../../css/DriverMapScreen.css';
import TripInitModal from './TripInitModal';

axios.defaults.withCredentials = true;

// Fix for default marker icon in Leaflet with React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Custom bus icon
const busIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/30/30979.png',
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40]
});

// Bus stop icon
const busStopIcon = new L.Icon({
  iconUrl: '/images/bus-stop.png',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -24]
});

// Next stop icon (highlighted)
const nextStopIcon = new L.Icon({
  iconUrl: '/images/bus-stop.png',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -24]
});

// Component to handle map centering
const MapController = ({ center, zoom }) => {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center, zoom || map.getZoom());
    }
  }, [center, zoom, map]);

  return null;
};

// Configure OSRM routing to load faster - similar to BusStopSearch.js approach
function configureRoutingMachine() {
  if (typeof L !== 'undefined' && L.Routing) {
    L.Routing.Itinerary.prototype.options.createGeocoderPane = false;
    L.Routing.timeout = 30 * 1000;

    if (L.Routing.ErrorControl && L.Routing.ErrorControl.prototype) {
      L.Routing.ErrorControl.prototype._routingErrorHandler = function (e) {
        console.warn("Handled routing error:", e);
      };
    }

    if (L.Routing.Line && L.Routing.Line.prototype) {
      const originalClearLines = L.Routing.Line.prototype._clearLines;
      L.Routing.Line.prototype._clearLines = function () {
        try {
          if (this._map && this._route && this._route._layers) {
            originalClearLines.call(this);
          }
        } catch (e) {
          console.warn("Protected from _clearLines error:", e);
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

    if (!window.L.Routing._routingControls) {
      window.L.Routing._routingControls = [];
    }
  }
}

// Improved OSRM routes component using BusStopSearch.js approach
const OsrmRoutes = ({ stops, currentPosition, lastClearedStopIndex, nextStopIndex }) => {
  const map = useMap();
  const routeRef = useRef(null);
  const nextSegmentRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const routingControlsRef = useRef([]);
  const isInitialRenderRef = useRef(true);

  const clearAllRoutingControls = useCallback(() => {
    if (routingControlsRef.current.length > 0) {
      routingControlsRef.current.forEach(control => {
        try {
          if (map && control && map.hasLayer(control)) {
            control.remove();
          }
        } catch (e) {
          console.warn("Error removing routing control:", e);
        }
      });
      routingControlsRef.current = [];
    }
  }, [map]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllRoutingControls();
    };
  }, [clearAllRoutingControls]);

  useEffect(() => {
    configureRoutingMachine();
  }, []);

  useEffect(() => {
    if (!stops || stops.length < 2 || !map) return;

    if (!isInitialRenderRef.current && routeRef.current) {
      return;
    }

    const fetchAndDrawFullRoute = async () => {
      try {
        setIsLoading(true);

        // Clear previously drawn routes before adding new ones
        clearAllRoutingControls();

        if (routeRef.current) {
          try {
            if (map.hasLayer(routeRef.current)) {
              map.removeLayer(routeRef.current);
            }
          } catch (err) {
            console.warn("Protected from removeLayer error:", err);
          }
          routeRef.current = null;
        }

        const waypoints = stops.map(stop => [
          parseFloat(stop.latitude),
          parseFloat(stop.longitude)
        ]).filter(coords => !isNaN(coords[0]) && !isNaN(coords[1]));

        if (waypoints.length < 2) {
          console.warn("Not enough valid waypoints for route");
          setIsLoading(false);
          return;
        }

        try {
          const routingControl = L.Routing.control({
            waypoints: waypoints.map(coords => L.latLng(coords[0], coords[1])),
            routeWhileDragging: false,
            showAlternatives: false,
            addWaypoints: false,
            fitSelectedRoutes: false,
            show: false,
            lineOptions: {
              styles: [{ color: '#3388ff', opacity: 0.7, weight: 4 }],
              extendToWaypoints: true,
              missingRouteTolerance: 10
            },
            createMarker: () => null,
            serviceUrl: 'https://router.project-osrm.org/route/v1'
          });

          if (window.L.Routing._routingControls) {
            window.L.Routing._routingControls.push(routingControl);
          }

          routingControlsRef.current.push(routingControl);

          routingControl.on('routesfound', (e) => {
            if (e.routes && e.routes.length > 0) {
              setIsLoading(false);
            }
          });

          routingControl.on('routingerror', (e) => {
            console.warn("Routing error occurred:", e);
            setIsLoading(false);
          });

          setTimeout(() => {
            if (map && routingControl) {
              try {
                routingControl.addTo(map);
                isInitialRenderRef.current = false;
              } catch (err) {
                console.error("Error adding routing control to map:", err);
                setIsLoading(false);
              }
            }
          }, 100);
        } catch (err) {
          console.error("Error creating routing control:", err);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error setting up full route:', error);
        setIsLoading(false);
      }
    };

    fetchAndDrawFullRoute();

  }, [map, stops, clearAllRoutingControls]);

  return isLoading ? (
    <div className="osrm-loading-overlay">
      <div className="osrm-loading-content">
        <div className="osrm-spinner"></div>
        <p>Drawing routes...</p>
      </div>
    </div>
  ) : null;
};

// Improved location tracking with high accuracy and aggressive options
const DriverLocationTracker = ({ setPosition }) => {
  const map = useMapEvents({
    locationfound(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
    locationerror(e) {
      console.error('Location error:', e.message);
      alert('Could not get your location. Please enable location services and reload.');
    }
  });

  useEffect(() => {
    // Aggressive options for best accuracy
    const locationOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000
    };

    // Use browser geolocation API directly for best results
    let watchId;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          setPosition([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.warn('Geolocation error:', error);
        },
        locationOptions
      );
    }

    // Also use leaflet locate as fallback
    map.locate({ ...locationOptions, watch: true });

    return () => {
      if (watchId && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
      map.stopLocate();
    };
  }, [map, setPosition]);

  return null;
};

// Component to update driver's location in the database
const LocationUpdater = ({ driverId, busId, position }) => {
  useEffect(() => {
    if (!position || !busId) return;

    const updateLocation = async () => {
      try {
        await axios.post(
          getApiUrl('/driver/update-location'),
          {
            busId,
            latitude: position[0],
            longitude: position[1]
          },
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
            }
          }
        );
      } catch (error) {
        console.error('Error updating location:', error);
      }
    };

    updateLocation();

    const interval = setInterval(updateLocation, 5000); // 5 seconds

    return () => clearInterval(interval);
  }, [position, busId, driverId]);

  return null;
};

// Component to detect proximity to next bus stop
const ProximityDetector = ({ busId, position, nextStop, busInfo, onStopReached }) => {
  useEffect(() => {
    if (!position || !nextStop || !busId || !busInfo) return;

    const checkProximity = () => {
      const nextStopPosition = [
        parseFloat(nextStop.latitude),
        parseFloat(nextStop.longitude)
      ];

      const distance = L.latLng(position).distanceTo(L.latLng(nextStopPosition));

      if (distance <= 30 && nextStop.stop_id === busInfo.nextStop?.stop_id) {
        onStopReached(busId, nextStop.stop_id);
      }
    };

    const interval = setInterval(checkProximity, 1000);

    return () => clearInterval(interval);
  }, [position, nextStop, busId, busInfo, onStopReached]);

  return null;
};

// Component to keep bus in view
const KeepBusInView = ({ position, userZoomed, setUserZoomed }) => {
  const map = useMap();
  const [lastPosition, setLastPosition] = useState(null);
  const initialSetupRef = useRef(true);

  // Add map event handler for zoom changes
  useMapEvents({
    zoomend: () => {
      // Only mark as user zoomed if not initial setup
      if (!initialSetupRef.current) {
        setUserZoomed(true);
      }
    },
    dragend: () => {
      setUserZoomed(true);
    }
  });

  useEffect(() => {
    if (!position || !map) return;

    // Set maximum zoom on initial position
    if (initialSetupRef.current) {
      map.setView(position, 19); // Maximum zoom on first position
      initialSetupRef.current = false;
      return;
    }

    // Check if position has changed significantly
    if (lastPosition &&
      position[0] === lastPosition[0] &&
      position[1] === lastPosition[1]) {
      return; // Position hasn't changed, do nothing
    }

    setLastPosition(position);

    // If user hasn't manually zoomed, follow the bus with max zoom
    if (!userZoomed) {
      map.setView(position, 19); // Use max zoom level (19)
    } else {
      // If user has zoomed but bus is outside view, recenter but maintain zoom
      const bounds = map.getBounds();
      const isInBounds = bounds.contains(position);

      if (!isInBounds) {
        map.setView(position, map.getZoom());
      }
    }
  }, [map, position, lastPosition, userZoomed]);

  return null;
};

// Component to update next stop distance in the UI
const NextStopDistanceUpdater = ({ position, nextStop }) => {
  useEffect(() => {
    if (!position || !nextStop) return;

    const updateDistance = () => {
      const nextStopPosition = [
        parseFloat(nextStop.latitude),
        parseFloat(nextStop.longitude)
      ];

      // Calculate distance between driver and next stop (in meters)
      const distance = L.latLng(position).distanceTo(L.latLng(nextStopPosition));

      // Update the distance display in the UI
      const distanceElement = document.getElementById('next-stop-distance');
      if (distanceElement) {
        distanceElement.textContent = `${Math.round(distance)} meters`;
      }
    };

    // Update immediately and then every second
    updateDistance();
    const interval = setInterval(updateDistance, 1000);

    return () => clearInterval(interval);
  }, [position, nextStop]);

  return null;
};

// Simplified permanent directions component
const PermanentDirections = ({ stops, currentPosition, lastClearedStopIndex, nextStopIndex }) => {
  const [direction, setDirection] = useState(null);
  const [distance, setDistance] = useState(null);

  useEffect(() => {
    if (!stops || !currentPosition || lastClearedStopIndex === null || nextStopIndex === null) return;

    // Use nextStop directly
    const nextStop = stops[nextStopIndex];

    // Calculate heading and distance continuously
    const calculateDirections = () => {
      const currentPos = L.latLng(currentPosition);
      const nextStopPos = L.latLng(
        parseFloat(nextStop.latitude),
        parseFloat(nextStop.longitude)
      );

      // Calculate distance to next stop
      const distanceToNext = currentPos.distanceTo(nextStopPos);
      setDistance(Math.round(distanceToNext));

      // Get route from current position to next stop
      const bearing = calculateBearing(currentPos, nextStopPos);

      // Determine direction based on bearing
      if (bearing >= 337.5 || bearing < 22.5) {
        setDirection('north');
      } else if (bearing >= 22.5 && bearing < 67.5) {
        setDirection('northeast');
      } else if (bearing >= 67.5 && bearing < 112.5) {
        setDirection('east');
      } else if (bearing >= 112.5 && bearing < 157.5) {
        setDirection('southeast');
      } else if (bearing >= 157.5 && bearing < 202.5) {
        setDirection('south');
      } else if (bearing >= 202.5 && bearing < 247.5) {
        setDirection('southwest');
      } else if (bearing >= 247.5 && bearing < 292.5) {
        setDirection('west');
      } else {
        setDirection('northwest');
      }
    };

    // Calculate initially and then every second
    calculateDirections();
    const interval = setInterval(calculateDirections, 1000);

    return () => clearInterval(interval);
  }, [stops, currentPosition, lastClearedStopIndex, nextStopIndex]);

  // Helper function to calculate bearing between two points
  const calculateBearing = (start, end) => {
    const startLat = start.lat * Math.PI / 180;
    const startLng = start.lng * Math.PI / 180;
    const endLat = end.lat * Math.PI / 180;
    const endLng = end.lng * Math.PI / 180;

    const y = Math.sin(endLng - startLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) -
      Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    if (bearing < 0) bearing += 360;

    return bearing;
  };

  // Always render the directions panel
  return (
    <div className="permanent-directions">
      <div className="direction-icon">
        {direction === 'north' && <i className="fas fa-arrow-up"></i>}
        {direction === 'northeast' && <i className="fas fa-arrow-up" style={{ transform: 'rotate(45deg)' }}></i>}
        {direction === 'east' && <i className="fas fa-arrow-right"></i>}
        {direction === 'southeast' && <i className="fas fa-arrow-down" style={{ transform: 'rotate(-45deg)' }}></i>}
        {direction === 'south' && <i className="fas fa-arrow-down"></i>}
        {direction === 'southwest' && <i className="fas fa-arrow-down" style={{ transform: 'rotate(45deg)' }}></i>}
        {direction === 'west' && <i className="fas fa-arrow-left"></i>}
        {direction === 'northwest' && <i className="fas fa-arrow-up" style={{ transform: 'rotate(-45deg)' }}></i>}
      </div>
      <div className="direction-text">
        <p>Head <strong>{direction}</strong> for {distance} meters</p>
        <p>Next stop: <strong>{stops[nextStopIndex].name}</strong></p>
      </div>
    </div>
  );
};

function DriverMapScreen() {
  const [position, setPosition] = useState(null);
  const [center, setCenter] = useState(null);
  const [zoom, setZoom] = useState(19); // Start with maximum zoom level (19)
  const [busInfo, setBusInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userZoomed, setUserZoomed] = useState(false); // Track if user manually zoomed
  const [showTripInitModal, setShowTripInitModal] = useState(false);
  const [initModalShown, setInitModalShown] = useState(false);
  const navigate = useNavigate();

  const mapRef = useRef(null);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        if (error.response && (error.response.status === 401 || error.response.data?.expired)) {
          localStorage.removeItem('jwtToken');
          localStorage.removeItem('user');
          navigate('/login');
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [navigate]);

  useEffect(() => {
    const fetchDriverBus = async () => {
      try {
        setLoading(true);

        const response = await axios.get(
          getApiUrl('/driver/my-bus'),
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
            }
          }
        );

        if (response.data && response.data.data) {
          setBusInfo(response.data.data);

          // Only show the modal on first login, not on page refreshes
          if (!initModalShown) {
            setShowTripInitModal(true);
            setInitModalShown(true);
          }
        } else {
          setError('No bus assigned to you');
        }
      } catch (error) {
        console.error('Error fetching driver bus:', error);
        setError('Failed to load your bus information');
      } finally {
        setLoading(false);
      }
    };

    fetchDriverBus();

    const interval = setInterval(fetchDriverBus, 60000);

    return () => clearInterval(interval);
  }, [initModalShown]);

  useEffect(() => {
    if (position && !center) {
      setCenter(position);
    }
  }, [position, center]);

  const handleStopReached = async (busId, stopId) => {
    try {
      const response = await axios.post(
        getApiUrl('/driver/clear-stop'),
        { busId, stopId },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
          }
        }
      );

      if (response.data) {
        setBusInfo(prev => ({
          ...prev,
          bus: response.data.data,
          stopsCleared: parseInt(response.data.data.stops_cleared)
        }));

        const fetchDriverBus = async () => {
          try {
            const response = await axios.get(
              getApiUrl('/driver/my-bus'),
              {
                headers: {
                  Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
                }
              }
            );

            if (response.data && response.data.data) {
              setBusInfo(response.data.data);
            }
          } catch (error) {
            console.error('Error refreshing driver bus info:', error);
          }
        };

        fetchDriverBus();
      }
    } catch (error) {
      console.error('Error auto-clearing stop:', error);
    }
  };

  const handleTripInitialized = (updatedBusInfo) => {
    // Update the bus info with the data returned from trip initialization
    setBusInfo(prevInfo => ({
      ...prevInfo,
      ...updatedBusInfo
    }));
  };

  const handleCloseTripModal = () => {
    setShowTripInitModal(false);
  };

  const getStopIndices = () => {
    if (!busInfo || !busInfo.route || busInfo.route.length === 0) {
      return { lastClearedStopIndex: null, nextStopIndex: null };
    }

    const stops = busInfo.route;
    const stopsCleared = busInfo.stopsCleared || 0;

    if (stopsCleared === 0) {
      return {
        lastClearedStopIndex: null,
        nextStopIndex: 0
      };
    }

    return {
      lastClearedStopIndex: stopsCleared - 1,
      nextStopIndex: stopsCleared % stops.length
    };
  };

  const { lastClearedStopIndex, nextStopIndex } = getStopIndices();

  if (loading) {
    return (
      <div className="driver-map-loading">
        <div className="spinner"></div>
        <p>Loading your bus information...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="driver-map-error driver-map-container">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (!busInfo || !busInfo.bus) {
    return (
      <div className="driver-map-error driver-map-container">
        <h2>No Bus Assigned</h2>
        <p>You do not have a bus assigned to you. Please contact an administrator.</p>
      </div>
    );
  }

  const handleCenterMap = (newCenter) => {
    setCenter(newCenter);
    setZoom(19); // Use maximum zoom level
    setUserZoomed(false); // Reset user zoom preference when manually centering
  };

  return (
    <div className="driver-map-screen">
      {/* Trip Initialization Modal */}
      <TripInitModal
        show={showTripInitModal}
        onClose={handleCloseTripModal}
        busInfo={busInfo}
        onTripInit={handleTripInitialized}
      />

      <div className="driver-map-container">
        <MapContainer
          center={center || [22.3190, 87.3091]}
          zoom={zoom}
          className="driver-map"
          ref={mapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapController center={center} zoom={zoom} />

          <DriverLocationTracker setPosition={setPosition} />

          {position && (
            <KeepBusInView
              position={position}
              userZoomed={userZoomed}
              setUserZoomed={setUserZoomed}
            />
          )}

          {position && busInfo && (
            <LocationUpdater
              driverId={localStorage.getItem('userId')}
              busId={busInfo.bus.id}
              position={position}
            />
          )}

          {position && busInfo && busInfo.nextStop && (
            <ProximityDetector
              busId={busInfo.bus.id}
              position={position}
              nextStop={busInfo.nextStop}
              busInfo={busInfo}
              onStopReached={handleStopReached}
            />
          )}

          {position && (
            <Marker position={position} icon={busIcon}>
              <Popup>
                <div className="driver-popup">
                  <strong>Your Location (Bus {busInfo.bus.name})</strong>
                  <p>You are here.</p>
                </div>
              </Popup>
            </Marker>
          )}

          {busInfo && busInfo.route && busInfo.route.map((stop, idx) => (
            <Marker
              key={stop.id}
              position={[parseFloat(stop.latitude), parseFloat(stop.longitude)]}
              icon={idx === nextStopIndex ? nextStopIcon : busStopIcon}
            >
              <Popup>
                <div className="stop-popup">
                  <strong>{stop.name}</strong>
                  <p>Stop #{idx + 1} in route</p>
                  {idx === nextStopIndex && (
                    <p className="next-stop-label">This is your next stop</p>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          {busInfo && busInfo.route && position && (
            <OsrmRoutes
              stops={busInfo.route}
              currentPosition={position}
              lastClearedStopIndex={lastClearedStopIndex}
              nextStopIndex={nextStopIndex}
            />
          )}

          {position && busInfo && busInfo.nextStop && (
            <NextStopDistanceUpdater
              position={position}
              nextStop={busInfo.nextStop}
            />
          )}

          <div className="location-button-container">
            <button
              className="location-button"
              onClick={() => handleCenterMap(position ||
                (busInfo && busInfo.nextStop ?
                  [parseFloat(busInfo.nextStop.latitude), parseFloat(busInfo.nextStop.longitude)] :
                  (busInfo && busInfo.route && busInfo.route.length > 0 ?
                    [parseFloat(busInfo.route[0].latitude), parseFloat(busInfo.route[0].longitude)] :
                    [22.3190, 87.3091])))}
              title={position ? "Center map on your location" : "Center map on route"}
            >
              <i className="fas fa-location-arrow"></i> {position ? "Your Location" : "Center Map"}
            </button>
          </div>
        </MapContainer>

        {busInfo && busInfo.route && position && (
          <PermanentDirections
            stops={busInfo.route}
            currentPosition={position}
            lastClearedStopIndex={lastClearedStopIndex}
            nextStopIndex={nextStopIndex}
          />
        )}

        <div className="bus-info-panel">
          <h3>Bus: {busInfo.bus.name}</h3>
          {busInfo.nextStop && (
            <div className="next-stop-info">
              <p><strong>Next Stop:</strong> {busInfo.nextStop.name}</p>
              <p><strong>Distance:</strong> <span id="next-stop-distance">Calculating...</span></p>
            </div>
          )}
          {/* Trip reinitialization button */}
          <button
            className="trip-init-button"
            onClick={() => setShowTripInitModal(true)}
          >
            Change Trip
          </button>
        </div>
      </div>
    </div>
  );
}

export default DriverMapScreen;
