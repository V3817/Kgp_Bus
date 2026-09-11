import React, { useState, useEffect, useRef } from 'react';
import '../../css/SearchBus.css';
import api from '../../utils/api';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import BusTracking from './BusTracking';

// Custom icons for the map
const busIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/30/30979.png',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16]
});

const busStopIcon = new L.Icon({
  iconUrl: '/images/bus-stop.png',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -24]
});

// Component to recenter map when needed
const MapViewController = ({ center }) => {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center, 15);
    }
  }, [map, center]);

  return null;
};
function configureRoutingMachine() {
  if (typeof L !== 'undefined' && L.Routing) {
    // Modify the global routing options
    L.Routing.Itinerary.prototype.options.createGeocoderPane = false;
    L.Routing.timeout = 10 * 1000; // 10 seconds timeout

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
  }
}

const BusStopsView = ({ userLocation }) => {
  const [fromStop, setFromStop] = useState('');
  const [toStop, setToStop] = useState('');
  const [fromStopId, setFromStopId] = useState(null);
  const [toStopId, setToStopId] = useState(null);
  const [busStops, setBusStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [fromDropdownOpen, setFromDropdownOpen] = useState(false);
  const [toDropdownOpen, setToDropdownOpen] = useState(false);
  const [filteredFromStops, setFilteredFromStops] = useState([]);
  const [filteredToStops, setFilteredToStops] = useState([]);
  const [buses, setBuses] = useState([]);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [searchingBuses, setSearchingBuses] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [busInfo, setBusInfo] = useState(null);
  const [nextStop, setNextStop] = useState(null);
  const [currentStop, setCurrentStop] = useState(null);
  const [isPathLoading, setIsPathLoading] = useState(false);

  const [showMap, setShowMap] = useState(false);
  const [trackingBus, setTrackingBus] = useState(null);
  const [busLocation, setBusLocation] = useState(null);
  const [busStopsRoute, setBusStopsRoute] = useState([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState(null);

  const [showTrackPopup, setShowTrackPopup] = useState(false);
  const [trackBusObj, setTrackBusObj] = useState(null);
  const [isPopupLoading, setIsPopupLoading] = useState(false); // Track loading state for popup

  const RoutingControl = ({ startPoint, endPoint, color = '#3388ff', weight = 4, setIsPathLoading }) => {
    const map = useMap();
    const routingControlRef = useRef(null);

    useEffect(() => {
      if (!startPoint || !endPoint) return;

      configureRoutingMachine();

      setIsPathLoading(true);

      if (routingControlRef.current && map && map.hasLayer(routingControlRef.current)) {
        map.removeControl(routingControlRef.current);
        routingControlRef.current = null;
      }

      try {
        const routingControl = L.Routing.control({
          waypoints: [
            L.latLng(startPoint[0], startPoint[1]),
            L.latLng(endPoint[0], endPoint[1])
          ],
          routeWhileDragging: false,
          showAlternatives: false,
          addWaypoints: false,
          fitSelectedRoutes: false,
          show: false,
          lineOptions: {
            styles: [{ color, opacity: 0.7, weight }],
            extendToWaypoints: true,
            missingRouteTolerance: 0
          },
          createMarker: () => null,
          serviceUrl: 'https://router.project-osrm.org/route/v1'
        });

        routingControl.on('routesfound', () => {
          setTimeout(() => setIsPathLoading(false), 300);
        });

        routingControl.on('routingerror', () => {
          console.warn("Routing error occurred");
          setIsPathLoading(false);
        });

        routingControl.addTo(map);
        routingControlRef.current = routingControl;

        const timeout = setTimeout(() => {
          setIsPathLoading(false);
        }, 10000);

        return () => {
          clearTimeout(timeout);
          if (routingControlRef.current && map && map.hasLayer(routingControlRef.current)) {
            map.removeControl(routingControlRef.current);
          }
          setIsPathLoading(false);
        };
      } catch (error) {
        console.error("Error setting up routing:", error);
        setIsPathLoading(false);
      }
    }, [map, startPoint, endPoint, color, weight, setIsPathLoading]);

    return null;
  };

  useEffect(() => {
    const fetchBusStops = async () => {
      setLoading(true);
      try {
        const response = await api.get('/busStopsView/bus-stops');
        if (response.data && response.data.data) {
          setBusStops(response.data.data);
          setFilteredFromStops(response.data.data);
          setFilteredToStops(response.data.data);
        }
        setErrorMessage(null);
      } catch (err) {
        console.error('Error fetching bus stops:', err);
        setErrorMessage('Failed to load bus stops. Please try again later.');
        alert('Failed to load bus stops');
      } finally {
        setLoading(false);
      }
    };

    fetchBusStops();
  }, []);

  useEffect(() => {
    if (fromStop.trim() === '') {
      setFilteredFromStops(busStops);
    } else {
      const filtered = busStops.filter(stop =>
        stop.name.toLowerCase().includes(fromStop.toLowerCase())
      );
      setFilteredFromStops(filtered);
    }
  }, [fromStop, busStops]);

  useEffect(() => {
    if (toStop.trim() === '') {
      setFilteredToStops(busStops);
    } else {
      const filtered = busStops.filter(stop =>
        stop.name.toLowerCase().includes(toStop.toLowerCase())
      );
      setFilteredToStops(filtered);
    }
  }, [toStop, busStops]);

  const handleFromStopSelect = (stop) => {
    setFromStop(stop.name);
    setFromStopId(stop.id);
    setFromDropdownOpen(false);
  };

  const handleToStopSelect = (stop) => {
    setToStop(stop.name);
    setToStopId(stop.id);
    setToDropdownOpen(false);
  };

  const handleTrackBus = (busId) => {
    const selectedBus = buses.find(bus => bus.id === busId);
    setTrackBusObj(selectedBus);
    setShowTrackPopup(true);
  };

  const handleSearch = async () => {
    if (!fromStopId || !toStopId) {
      alert('Please select both From and To bus stops');
      return;
    }

    setSearchingBuses(true);
    setBuses([]);

    try {
      const response = await api.get(`/busStopsView/buses?fromStopId=${fromStopId}&toStopId=${toStopId}`);

      if (response.data && response.data.data) {
        setBuses(response.data.data);
        setSearchPerformed(true);
      } else {
        alert('No buses found for this route');
      }
    } catch (err) {
      console.error('Error searching buses:', err);
      if (err.response && err.response.status === 404) {
        alert('No buses found for this route');
        setSearchPerformed(true);
      } else {
        alert('Failed to search buses. Please try again.');
      }
    } finally {
      setSearchingBuses(false);
    }
  };

  const formatTime = (timeString) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const handleResetSearch = () => {
    setSearchPerformed(false);
    setBuses([]);
    setFromStop('');
    setToStop('');
    setFromStopId(null);
    setToStopId(null);
  };

  const BusTrackingMap = ({ bus, busLocation, busStops, onClose }) => {
    return (
      <div className="tracking-overlay">
        <div className="tracking-container">
          <div className="tracking-header">
            <h3>Tracking {bus.name}</h3>
            <button className="close-btn" onClick={onClose}>
              <i className="fas fa-times"></i>
            </button>
          </div>

          <div className="tracking-content">
            <div className="bus-stop-list">
              <h4>Route Stops</h4>
              {lastUpdated && (
                <p className="last-updated">
                  <strong>Last updated:</strong> {lastUpdated.toLocaleTimeString()}
                </p>
              )}
              {currentStop && (
                <p className="current-stop">
                  <strong>Last Stop:</strong> {currentStop.name}
                </p>
              )}
              {nextStop && busInfo && busInfo.estimatedArrival && (
                <p className="next-stop">
                  <strong>Next Stop:</strong> {nextStop.name}
                  <span className="eta"> (ETA: {busInfo.estimatedArrival} min)</span>
                </p>
              )}
              <ul>
                {busStops.length > 0 ? (
                  [...busStops]
                    .sort((a, b) => a.stop_order - b.stop_order)
                    .map(stop => (
                      <li key={stop.id} style={{ color: stop.cleared ? '#00ff00' : '#0000ff' }}>
                        {stop.stop_order}. {stop.name}
                        {(
                          <span className="stop-time"> - {stop.estimated_time}</span>
                        )}
                      </li>
                    ))
                ) : (
                  <li>No stops available</li>
                )}
              </ul>
            </div>

            <div className="tracking-map">
              <MapContainer
                center={busLocation || [22.3190, 87.3091]}
                zoom={15}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {busLocation && <MapViewController center={busLocation} />}

                {busLocation && (
                  <Marker position={busLocation} icon={busIcon}>
                    <Popup>
                      <div className="bus-popup">
                        <h3>{bus.name}</h3>
                        {lastUpdated && (
                          <p><strong>Last Updated:</strong> {lastUpdated.toLocaleTimeString()}</p>
                        )}
                        {busInfo && busInfo.driverName && (
                          <p><strong>Driver:</strong> {busInfo.driverName || 'Not assigned'}</p>
                        )}
                        {nextStop && busInfo && busInfo.estimatedArrival && (
                          <p><strong>ETA to {nextStop.name}:</strong></p>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                )}

                {busStops.length > 0 && (
                  busStops.map(stop => (
                    <Marker
                      key={stop.id}
                      position={[parseFloat(stop.latitude), parseFloat(stop.longitude)]}
                      icon={busStopIcon}
                    >
                      <Popup>
                        <div className="stop-popup">
                          <h3>{stop.name}</h3>
                          <p>Stop Order: {stop.stop_order}</p>
                          <p style={{ color: stop.cleared ? 'green' : 'blue' }}>
                            {stop.cleared ? 'Cleared' : 'Not Cleared Yet'}
                          </p>
                          {nextStop && nextStop.id === stop.id && busInfo && busInfo.estimatedArrival && (
                            <p><strong>ETA:</strong></p>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  ))
                )}

                {busStops.length > 1 && (
                  [...busStops]
                    .sort((a, b) => a.stop_order - b.stop_order)
                    .map((stop, idx, arr) => {
                      if (idx < arr.length - 1) {
                        return (
                          <RoutingControl
                            key={`${stop.id}-${arr[idx + 1].id}`}
                            startPoint={[parseFloat(stop.latitude), parseFloat(stop.longitude)]}
                            endPoint={[parseFloat(arr[idx + 1].latitude), parseFloat(arr[idx + 1].longitude)]}
                            color="#3388ff"
                            weight={4}
                            setIsPathLoading={setIsPathLoading}
                          />
                        );
                      }
                      return null;
                    })
                )}
              </MapContainer>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bus-stops-view">
      <div className="control-panel">
        <h2>Search Buses by Route</h2>

        <div className="form-group">
          <label htmlFor="fromStop">From Bus Stop</label>
          <div className="dropdown-input-container">
            <input
              type="text"
              id="fromStop"
              placeholder="Enter from stop"
              value={fromStop}
              onChange={(e) => setFromStop(e.target.value)}
              onFocus={() => setFromDropdownOpen(true)}
              onBlur={() => setTimeout(() => setFromDropdownOpen(false), 200)}
            />
            <button
              className="dropdown-toggle-btn"
              onClick={() => setFromDropdownOpen(!fromDropdownOpen)}
            >
              <i className="fas fa-caret-down"></i>
            </button>
          </div>

          {fromDropdownOpen && (
            <ul className="dropdown-list">
              {filteredFromStops.length > 0 ? (
                filteredFromStops.map(stop => (
                  <li key={stop.id} onMouseDown={() => handleFromStopSelect(stop)}>
                    {stop.name}
                  </li>
                ))
              ) : (
                <li className="loading-item">No matches found</li>
              )}
            </ul>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="toStop">To Bus Stop</label>
          <div className="dropdown-input-container">
            <input
              type="text"
              id="toStop"
              placeholder="Enter to stop"
              value={toStop}
              onChange={(e) => setToStop(e.target.value)}
              onFocus={() => setToDropdownOpen(true)}
              onBlur={() => setTimeout(() => setToDropdownOpen(false), 200)}
            />
            <button
              className="dropdown-toggle-btn"
              onClick={() => setToDropdownOpen(!toDropdownOpen)}
            >
              <i className="fas fa-caret-down"></i>
            </button>
          </div>

          {toDropdownOpen && (
            <ul className="dropdown-list">
              {filteredToStops.length > 0 ? (
                filteredToStops.map(stop => (
                  <li key={stop.id} onMouseDown={() => handleToStopSelect(stop)}>
                    {stop.name}
                  </li>
                ))
              ) : (
                <li className="loading-item">No matches found</li>
              )}
            </ul>
          )}
        </div>

        {errorMessage && (
          <div className="error-message">{errorMessage}</div>
        )}

        <button
          className="search-btn"
          onClick={handleSearch}
          disabled={!fromStopId || !toStopId || searchingBuses}
        >
          {searchingBuses ? 'Searching...' : 'Find Buses'}
        </button>

        {searchPerformed && (
          <button
            className="search-btn"
            onClick={handleResetSearch}
            style={{ marginTop: '10px', backgroundColor: '#757575' }}
          >
            Reset Search
          </button>
        )}
      </div>

      <div className="results-panel">
        {loading || searchingBuses ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>{searchingBuses ? 'Finding buses...' : 'Loading bus stops...'}</p>
          </div>
        ) : searchPerformed ? (
          buses.length > 0 ? (
            <>
              <h2>Available Buses</h2>
              <div className="bus-list">
                {buses.map((bus, index) => (
                  <div className="bus-card" key={`${bus.id}-${index}`}>
                    <div className="bus-header">
                      <h3>{bus.name}</h3>
                      <span className="trip-badge">Trip {bus.currentTrip}/{bus.totalTrips}</span>
                    </div>

                    <div className="bus-route">
                      <div className="route-stop">
                        <div className="stop-time">{formatTime(bus.times.departureTime)}</div>
                        <div className="stop-marker from-marker"></div>
                        <div className="stop-name">{bus.route.fromStop.name}</div>
                      </div>

                      <div className="route-line">
                        <span className="duration">{bus.times.durationMinutes} min</span>
                      </div>

                      <div className="route-stop">
                        <div className="stop-time">{formatTime(bus.times.arrivalTime)}</div>
                        <div className="stop-marker to-marker"></div>
                        <div className="stop-name">{bus.route.toStop.name}</div>
                      </div>
                    </div>

                    <div className="bus-info-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
                      <div className="bus-info">
                        <div className="bus-detail">
                          <i className="fas fa-clock"></i>
                          <span>Bus Start: {formatTime(bus.times.busStart)}</span>
                        </div>
                        <div className="bus-detail">
                          <i className="fas fa-map-marker-alt"></i>
                          <span>Bus ID: {bus.id}</span>
                        </div>
                      </div>
                      <button
                        className="track-bus-btn"
                        onClick={() => handleTrackBus(bus.id)}
                        style={{ marginLeft: '16px' }}
                      >
                        <i className="fas fa-location-arrow"></i> Track Bus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="no-results">
              <i className="fas fa-exclamation-circle"></i>
              <p>No buses found for this route. Please try different stops.</p>
            </div>
          )
        ) : (
          <div className="help-text-container">
            <div className="help-text bus-selection-help center-text">
              <i className="fas fa-info-circle"></i>
              <span>Select your starting point and destination to find buses that travel between those stops.</span>
            </div>
          </div>
        )}
      </div>

      {showMap && trackingBus && (
        <BusTrackingMap
          bus={trackingBus}
          busLocation={busLocation}
          busStops={busStopsRoute}
          onClose={() => setShowMap(false)}
        />
      )}

      {trackingLoading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>Loading bus tracking data...</p>
        </div>
      )}

      {trackingError && !trackingLoading && showMap && (
        <div className="tracking-error-message">
          {trackingError}
        </div>
      )}

      {showTrackPopup && trackBusObj && (
        <div className="tracking-overlay">
          <div className="tracking-popup-container">
            <button 
              className="tracking-popup-close-btn"
              onClick={() => { setShowTrackPopup(false); setTrackBusObj(null); }}
              aria-label="Close"
              disabled={isPopupLoading}
              style={isPopupLoading ? { opacity: 0.5, pointerEvents: 'none' } : {}}
            >
              <i className="fas fa-times"></i>
            </button>
            {trackBusObj && (
              <BusTracking
                hideDropdown={true}
                selectedBus={trackBusObj}
                userLocation={userLocation}
                setUserLocation={() => { }}
                onDrawingRoutes={setIsPopupLoading}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BusStopsView;