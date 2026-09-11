import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import '../../css/RouteManagement.css'; // Import your CSS file for styling
import api, { getApiUrl } from '../../utils/api2.js';

axios.defaults.withCredentials = true;

// Fix for default marker icon in Leaflet with React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});


function configureRoutingMachine() {
    if (typeof L !== 'undefined' && L.Routing) {
        // Modify the global routing options
        L.Routing.Itinerary.prototype.options.createGeocoderPane = false;
        L.Routing.timeout = 30 * 1000; // 30 seconds timeout

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


// Component to recenter map when needed
function MapUpdater({ center, zoom }) {
    const map = useMap();

    useEffect(() => {
        if (center) {
            map.setView(center, zoom || map.getZoom());
        }
    }, [center, zoom, map]);

    return null;
}


// Custom component to create routes that follow roads
function RoadBasedRoutes({ stops }) {
    const map = useMap();
    const controlRef = useRef(null);

    // A safer cleanup function we can call anytime
    const cleanup = useCallback(() => {
        if (controlRef.current) {
            try {
                // Always remove from map first
                if (map) map.removeControl(controlRef.current);
            } catch (e) {
                console.warn("Error removing control:", e);
            }
            controlRef.current = null;
        }
    }, [map]);

    // Set up once - clean up on unmount
    useEffect(() => {
        return cleanup;
    }, [cleanup]);

    // Handle route creation/updates
    useEffect(() => {
        if (!map || !stops) { 
            return; 
        }
        if (stops.length < 2) {
            //console.log("Not enough conditions for route drawing:", {
            //     hasMap: !!map,
            //     stopsCount: stops.length
            // });
            return;
        }

        cleanup();

        const waypoints = [];
        const orderedStops = [...stops].sort((a, b) => a.stop_order - b.stop_order);

        //console.log("Drawing routes for ordered stops:", orderedStops);

        for (const routeStop of orderedStops) {
            const lat = parseFloat(routeStop.latitude);
            const lng = parseFloat(routeStop.longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
                waypoints.push(L.latLng(lat, lng));
            }
        }

        if (waypoints.length < 2) {
            //console.log("Not enough valid waypoints for route");
            return;
        }

        // Create the OSRM routing control
        try {
            const control = L.Routing.control({
                waypoints,
                routeWhileDragging: false,
                showAlternatives: false,
                fitSelectedRoutes: false,
                show: false,
                lineOptions: {
                    styles: [{ color: '#3388ff', opacity: 0.7, weight: 5 }],
                    extendToWaypoints: true,
                    missingRouteTolerance: 10
                },
                createMarker: () => null, // No markers from routing
                addWaypoints: false,
                serviceUrl: 'https://router.project-osrm.org/route/v1'
            });

            // Handle errors silently
            control.on('routingerror', function (e) {
                console.warn("Routing error:", e);
            });

            // Store the reference
            controlRef.current = control;

            // Add the control to the map
            setTimeout(() => {
                if (map && controlRef.current) {
                    try {
                        controlRef.current.addTo(map);
                    } catch (e) {
                        console.warn("Error adding route control:", e);
                    }
                }
            }, 200);
        } catch (error) {
            console.error("Error creating routing control:", error);
        }
    }, [map, stops, cleanup]);

    return null;
}

function RouteManagement({ user }) {
    const [buses, setBuses] = useState([]);
    const [stops, setStops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedBus, setSelectedBus] = useState(null);
    const [mapCenter, setMapCenter] = useState([22.3190, 87.3091]); // IIT KGP coordinates
    const [zoom, setZoom] = useState(15);
    const mapRef = useRef(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [routes, setRoutes] = useState([]);
    const [showMapDebug, setShowMapDebug] = useState(false); // State for debugging
    const [mapLoading, setMapLoading] = useState(false); // New state for map loading
    const [startTimes, setStartTimes] = useState([]); // New state for bus start times
    const [editingStopId, setEditingStopId] = useState(null); // State to track which stop is being edited
    const [editingTimeId, setEditingTimeId] = useState(null); // State to track which start time is being edited
    const [newStartTime, setNewStartTime] = useState(''); // State for new start time input
    const [isAddingStartTime, setIsAddingStartTime] = useState(false); // State to track if adding new start time
    const [busLocation, setBusLocation] = useState(null);
    const [locationRefreshInterval, setLocationRefreshInterval] = useState(null);

    const [formData, setFormData] = useState({
        bus_id: '',
        stops: []
    });

    // State for editing individual stop time
    const [stopTimeData, setStopTimeData] = useState({
        time_from_start: ''
    });

    const [isAddingStop, setIsAddingStop] = useState(false);
    const [currentStopOrder, setCurrentStopOrder] = useState(1);

    // Add state for edit mode for stop name
    const [editingStopName, setEditingStopName] = useState(false);
    const [editFormData, setEditFormData] = useState({
        stop_id: '',
        stop_order: '',
        time_from_start: ''
    });

    useEffect(() => {
        // Initialize window-level stopsData and configuration flag
        window.enableOSRM = true; // Always use OSRM
        configureRoutingMachine();

        // Add a global diagnostics object to help with debugging
        window.routeDiagnostics = {
            stops: [],
            waypoints: [],
            logState: () => {
                //console.log("Current Map State:", {
                //     stops: window.stopsData?.length || 0,
                //     selectedBus,
                //     routeStops: formData.stops.length,
                //     mapInitialized: !!mapRef.current
                // });
            }
        };
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                setError('');

                // Fetch buses
                try {
                    const busesResponse = await axios.get(getApiUrl(api.endpoints.adminBuses), {
                        headers: { Authorization: `Bearer ${user.token}` },
                        timeout: 10000
                    });
                    setBuses(busesResponse.data);
                    //console.log("Buses loaded for routes:", busesResponse.data.length);
                } catch (err) {
                    setError('Failed to fetch buses: ' + err.message);
                    console.error("Error fetching buses for routes:", err);
                    setBuses([{ id: 'mock1', name: 'Demo Bus 1' }]); // Fallback data
                }

                // Fetch stops
                try {
                    const stopsResponse = await axios.get(getApiUrl(api.endpoints.adminStops), {
                        headers: { Authorization: `Bearer ${user.token}` },
                        timeout: 10000
                    });
                    setStops(stopsResponse.data);
                    //console.log("Stops loaded for routes:", stopsResponse.data.length);
                } catch (err) {
                    setError('Failed to fetch stops: ' + err.message);
                    console.error("Error fetching stops for routes:", err);
                    setStops([{
                        id: 'mock1',
                        name: 'Demo Stop',
                        latitude: 22.3190,
                        longitude: 87.3091
                    }]); // Fallback data
                }

                // Fetch routes and update your state
                try {
                    const routesResponse = await axios.get(getApiUrl(api.endpoints.adminRoutes), {
                        headers: { Authorization: `Bearer ${user.token}` },
                        timeout: 10000
                    });
                    // Using the fetched routes data
                    const fetchedRoutes = routesResponse.data;
                    setRoutes(fetchedRoutes);
                    //console.log("Routes loaded:", fetchedRoutes.length);
                } catch (err) {
                    setError('Failed to fetch routes: ' + err.message);
                    console.error("Error fetching routes:", err);
                    // Using default empty array for routes
                    setRoutes([]);
                }
            } catch (err) {
                setError('Error fetching data: ' + err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [user.token, refreshTrigger]);

    useEffect(() => {
        if (stops && stops.length > 0) {
            window.stopsData = stops;
        }
    }, [stops]);


    const handleBusSelect = async (busId) => {
        try {
            setSelectedBus(busId);
            setLoading(true);
            setMapLoading(true);
            setError('');

            // First fetch the stops to ensure we have the latest data
            try {
                const stopsResponse = await axios.get(
                    getApiUrl(api.endpoints.adminStops),
                    { headers: { Authorization: `Bearer ${user.token}` } }
                );
                
                // Ensure stops are properly formatted with string IDs
                const formattedStops = stopsResponse.data.map(stop => ({
                    ...stop,
                    id: stop.id.toString()
                }));
                
                setStops(formattedStops);
                window.stopsData = formattedStops;
                //console.log("Updated stops data:", formattedStops);
            } catch (err) {
                console.error("Error refreshing stops data:", err);
                setError('Error loading bus stops. Some stops might not display correctly.');
            }

            try {
                // Fetch bus routes
                const response = await axios.get(
                    getApiUrl(api.endpoints.adminRouteById(busId)),
                    { headers: { Authorization: `Bearer ${user.token}` } }
                );

                // Ensure route data is properly formatted with string IDs
                const formattedRoutes = response.data.map(route => ({
                    ...route,
                    bus_stop_id: route.bus_stop_id.toString(),
                    id: route.id.toString()
                }));

                //console.log('Formatted routes for bus:', formattedRoutes);

                // Verify all stops exist before setting state
                const missingStops = formattedRoutes.filter(route => 
                    !stops.some(stop => stop.id.toString() === route.bus_stop_id.toString())
                );

                if (missingStops.length > 0) {
                    console.warn('Missing stops for routes:', missingStops);
                    setError('Some bus stops are missing. Please refresh the page or contact administrator.');
                }

                setFormData({
                    bus_id: busId,
                    stops: formattedRoutes
                });

                // Update current stop order
                const maxOrder = Math.max(...formattedRoutes.map(stop => stop.stop_order), 0);
                setCurrentStopOrder(maxOrder + 1);

                // Update map if we have valid routes
                if (formattedRoutes.length > 0) {
                    fitRouteOnMap(formattedRoutes);
                }

                // Fetch start times for this bus
                try {
                    //console.log("Fetching start times for bus:", busId);
                    const startTimesUrl = getApiUrl(api.endpoints.adminBusStartTimes(busId));
                    //console.log("Start times URL:", startTimesUrl);
                    
                    const startTimesResponse = await axios.get(
                        startTimesUrl,
                        { headers: { Authorization: `Bearer ${user.token}` } }
                    );
                    
                    //console.log("Start times response:", startTimesResponse.data);

                    if (startTimesResponse.data && Array.isArray(startTimesResponse.data)) {
                        setStartTimes(startTimesResponse.data);
                    } else if (startTimesResponse.data && Array.isArray(startTimesResponse.data.data)) {
                        setStartTimes(startTimesResponse.data.data);
                    } else {
                        console.warn("Unexpected format for start times:", startTimesResponse.data);
                        setStartTimes([]);
                    }
                } catch (err) {
                    console.error("Error fetching start times:", err);
                    setError('Error fetching start times: ' + (err.response?.data?.message || err.message));
                    setStartTimes([]);
                }

                // Set a timer to ensure map loading state shows for at least a moment
                setTimeout(() => {
                    setMapLoading(false);
                }, 1000);

                // Fetch bus location immediately after selecting the bus
                await fetchBusLocation(busId);
            } catch (err) {
                setError('Error fetching route data: ' + err.message);
                console.error("Error fetching routes for bus:", err);
                setMapLoading(false); // End map loading on error
            }
        } catch (err) {
            setError('Error preparing bus route view: ' + err.message);
            setMapLoading(false); // End map loading on error
        } finally {
            setLoading(false);
        }
    };

    const handleAddStop = async (stopId) => {
        try {
            setError('');
            setMapLoading(true); // Start map loading for route update
            
            // Ensure we have a valid stopId
            if (!stopId || stopId === '') {
                setError('Please select a stop to add');
                setMapLoading(false);
                return;
            }
            
            const stop = stops.find(s => s.id === stopId);
            if (!stop) {
                console.error(`Stop with ID ${stopId} not found in loaded stops:`, stops);
                setError(`Stop with ID ${stopId} not found. Try refreshing the page.`);
                setMapLoading(false);
                return;
            }

            //console.log(`Adding stop ${stopId} (${stop.name}) to bus ${selectedBus} at order ${currentStopOrder}`);

            // Create new route stop entry
            const newRoute = {
                bus_id: selectedBus,
                bus_stop_id: stopId,
                stop_order: currentStopOrder,
                time_from_start: 0 // Default to 0 minutes
            };

            const response = await axios.post(
                getApiUrl(api.endpoints.adminAddRoute),
                newRoute,
                { headers: { Authorization: `Bearer ${user.token}` } }
            );

            if (response.data && response.data.id) {
                // Use the complete object returned from API
                const updatedStops = [...formData.stops, response.data];
                setFormData(prev => ({
                    ...prev,
                    stops: updatedStops
                }));

                setRoutes(prev => [...prev, response.data]);
                setCurrentStopOrder(currentStopOrder + 1);

                // Update the map to show the new route
                fitRouteOnMap(updatedStops);
            }

            setIsAddingStop(false);
            setTimeout(() => {
                setMapLoading(false);
            }, 1000);
        } catch (err) {
            setError('Failed to add stop to route: ' + (err.response?.data?.message || err.message));
            console.error("Error adding stop to route:", err);
            setMapLoading(false);
        }
    };

    const handleRemoveStop = async (routeId) => {
        if (!window.confirm('Are you sure you want to remove this stop from the route?')) {
            return;
        }

        try {
            setMapLoading(true); // Start map loading for route update
            await axios.delete(
                getApiUrl(api.endpoints.adminDeleteRoute(routeId)),
                { headers: { Authorization: `Bearer ${user.token}` } }
            );

            // Update local state
            const updatedStops = formData.stops.filter(stop => stop.id !== routeId);

            // Remove the old data to prevent stale references
            setFormData(prevData => ({ ...prevData, stops: [] }));
            setTimeout(async () => {
                const response = await axios.get(
                    getApiUrl(api.endpoints.adminRouteById(selectedBus)),
                    { headers: { Authorization: `Bearer ${user.token}` } }
                );
                const newStops = response.data;
                setFormData({ bus_id: selectedBus, stops: newStops });
                fitRouteOnMap(newStops);
            }, 0);

            setTimeout(() => {
                setMapLoading(false);
            }, 1000);
        } catch (err) {
            setError('Error removing stop: ' + err.message);
            console.error("Error removing stop from route:", err);
            setMapLoading(false);
        }
    };

    // Begin editing a stop's time
    const handleEditStopTime = (routeId) => {
        const stop = formData.stops.find(stop => stop.id === routeId);
        if (stop) {
            setEditingStopId(routeId);
            setStopTimeData({
                time_from_start: stop.time_from_start || 0
            });
        }
    };

    // Save edited stop time
    const handleSaveStopTime = async () => {
        if (!editingStopId) return;

        try {
            setMapLoading(true);

            await axios.put(
                getApiUrl(api.endpoints.adminUpdateRoute(editingStopId)),
                {
                    time_from_start: parseFloat(stopTimeData.time_from_start)
                },
                { headers: { Authorization: `Bearer ${user.token}` } }
            );

            // Update local state
            const updatedStops = formData.stops.map(stop => {
                if (stop.id === editingStopId) {
                    return {
                        ...stop,
                        time_from_start: parseFloat(stopTimeData.time_from_start)
                    };
                }
                return stop;
            });

            setFormData(prev => ({
                ...prev,
                stops: updatedStops
            }));

            // Update routes global state
            setRoutes(prev => {
                return prev.map(route => {
                    if (route.id === editingStopId) {
                        return {
                            ...route,
                            time_from_start: parseFloat(stopTimeData.time_from_start)
                        };
                    }
                    return route;
                });
            });

            // Reset edit state
            setEditingStopId(null);
            setStopTimeData({ time_from_start: '' });
        } catch (err) {
            setError('Error updating stop time: ' + err.message);
            console.error("Error updating stop time:", err);
        } finally {
            setMapLoading(false);
        }
    };

    // Cancel editing stop time
    const handleCancelEditStopTime = () => {
        setEditingStopId(null);
        setStopTimeData({ time_from_start: '' });
    };

    // Add a new start time for the bus
    const handleAddStartTime = async () => {
        if (!selectedBus || !newStartTime) {
            setError('Please select a bus and enter a valid start time.');
            return;
        }

        try {
            setMapLoading(true);
            //console.log("Adding start time:", newStartTime, "for bus:", selectedBus);

            // Get current start times to calculate next rep_no
            const currentStartTimesUrl = getApiUrl(api.endpoints.adminBusStartTimes(selectedBus));
            //console.log("Fetching current start times from:", currentStartTimesUrl);
            
            const startTimesResponse = await axios.get(
                currentStartTimesUrl,
                { headers: { Authorization: `Bearer ${user.token}` } }
            );
            
            //console.log("Current start times response:", startTimesResponse.data);
            
            // Calculate next rep_no based on existing start times
            let maxRepNo = 0;
            if (Array.isArray(startTimesResponse.data)) {
                const repNos = startTimesResponse.data
                    .map(time => parseInt(time.rep_no) || 0);
                maxRepNo = repNos.length > 0 ? Math.max(...repNos) : 0;
            }
            const newRepNo = maxRepNo + 1;
            //console.log("Using rep_no:", newRepNo);

            // Construct the API endpoint for adding a start time
            const addStartTimeUrl = getApiUrl(api.endpoints.adminBusStartTimes(selectedBus));
            //console.log("POST URL for adding start time:", addStartTimeUrl);
            
            // Add new start time
            const addResponse = await axios.post(
                addStartTimeUrl,
                { 
                    start_time: newStartTime,
                    rep_no: newRepNo
                },
                { headers: { Authorization: `Bearer ${user.token}` } }
            );
            
            //console.log("Add start time response:", addResponse.data);

            // Update bus totalRep 
            const updateBusUrl = getApiUrl(api.endpoints.adminUpdateBusTotalRep(selectedBus));
            //console.log("Updating bus totalRep at:", updateBusUrl);
            
            await axios.put(
                updateBusUrl,
                { totalRep: newRepNo },
                { headers: { Authorization: `Bearer ${user.token}` } }
            );

            // Fetch updated start times
            //console.log("Fetching updated start times");
            const updatedStartTimesResponse = await axios.get(
                getApiUrl(api.endpoints.adminBusStartTimes(selectedBus)),
                { headers: { Authorization: `Bearer ${user.token}` } }
            );

            //console.log("Updated start times:", updatedStartTimesResponse.data);
            
            if (Array.isArray(updatedStartTimesResponse.data)) {
                setStartTimes(updatedStartTimesResponse.data);
            } else if (updatedStartTimesResponse.data && Array.isArray(updatedStartTimesResponse.data.data)) {
                setStartTimes(updatedStartTimesResponse.data.data);
            }

            // Reset form
            setNewStartTime('');
            setIsAddingStartTime(false);
            
        } catch (err) {
            console.error("Error adding start time:", err);
            console.error("Error response:", err.response?.data);
            setError('Error adding start time: ' + (err.response?.data?.message || err.message));
        } finally {
            setMapLoading(false);
        }
    };

    // Handle delete start time
    const handleDeleteStartTime = async (timeId) => {
        if (!window.confirm('Are you sure you want to delete this start time?')) {
            return;
        }
        
        try {
            setMapLoading(true);
            
            await axios.delete(
                getApiUrl(api.endpoints.adminDeleteStartTime(timeId)),
                { headers: { Authorization: `Bearer ${user.token}` } }
            );
            
            // Fetch updated start times
            const startTimesResponse = await axios.get(
                getApiUrl(api.endpoints.adminBusStartTimes(selectedBus)),
                { headers: { Authorization: `Bearer ${user.token}` } }
            );
            
            if (startTimesResponse.data && startTimesResponse.data.data) {
                setStartTimes(startTimesResponse.data.data);
            } else if (Array.isArray(startTimesResponse.data)) {
                setStartTimes(startTimesResponse.data);
            }
            
            // Update bus totalRep based on max rep_no
            if (Array.isArray(startTimesResponse.data) && startTimesResponse.data.length > 0) {
                const repNos = startTimesResponse.data.map(time => parseInt(time.rep_no) || 0);
                const maxRepNo = repNos.length > 0 ? Math.max(...repNos) : 0;
                //console.log("Updated max rep_no:", maxRepNo);
                
                await axios.put(
                    getApiUrl(api.endpoints.adminUpdateBusTotalRep(selectedBus)),
                    { totalRep: maxRepNo },
                    { headers: { Authorization: `Bearer ${user.token}` } }
                );
            }
        } catch (err) {
            setError('Error deleting start time: ' + (err.response?.data?.message || err.message));
            console.error("Error deleting start time:", err);
        } finally {
            setMapLoading(false);
        }
    };

    const handleEditStartTime = (timeId) => {
        const startTime = startTimes.find(time => time.id === timeId);
        if (startTime) {
            setEditingTimeId(timeId);
            setNewStartTime(startTime.start_time);
        }
    };

    const handleSaveStartTime = async () => {
        if (!editingTimeId || !newStartTime) return;

        try {
            setMapLoading(true);

            await axios.put(
                getApiUrl(api.endpoints.adminUpdateStartTime(editingTimeId)),
                { start_time: newStartTime },
                { headers: { Authorization: `Bearer ${user.token}` } }
            );

            // Fetch updated start times
            const startTimesResponse = await axios.get(
                getApiUrl(api.endpoints.adminBusStartTimes(selectedBus)),
                { headers: { Authorization: `Bearer ${user.token}` } }
            );

            if (startTimesResponse.data && startTimesResponse.data.data) {
                setStartTimes(startTimesResponse.data.data);
            } else if (Array.isArray(startTimesResponse.data)) {
                setStartTimes(startTimesResponse.data);
            }

            // Reset edit state
            setEditingTimeId(null);
            setNewStartTime('');
        } catch (err) {
            setError('Error updating start time: ' + (err.response?.data?.message || err.message));
            console.error("Error updating start time:", err);
        } finally {
            setMapLoading(false);
        }
    };

    // Cancel editing start time
    const handleCancelEditStartTime = () => {
        setEditingTimeId(null);
        setNewStartTime('');
    };

    const fitRouteOnMap = (routeStops) => {
        if (!routeStops || routeStops.length === 0 || !mapRef.current) return;

        // Get all stop coordinates, ensuring we have proper numeric values
        const stopPositions = routeStops.map(routeStop => {
            const stop = stops.find(s => s.id === routeStop.bus_stop_id);
            if (!stop) return null;

            const lat = parseFloat(stop.latitude);
            const lng = parseFloat(stop.longitude);
            if (isNaN(lat) || isNaN(lng)) return null;

            return [lat, lng];
        }).filter(Boolean);

        if (stopPositions.length === 0) return;

        if (stopPositions.length === 1) {
            // If only one stop, center on it
            setMapCenter(stopPositions[0]);
            setZoom(16);
        } else {
            // Calculate bounds for multiple stops
            const minLat = Math.min(...stopPositions.map(pos => pos[0]));
            const maxLat = Math.max(...stopPositions.map(pos => pos[0]));
            const minLng = Math.min(...stopPositions.map(pos => pos[1]));
            const maxLng = Math.max(...stopPositions.map(pos => pos[1]));

            // Center the map on the middle of the route
            setMapCenter([
                minLat + (maxLat - minLat) / 2,
                minLng + (maxLng - minLng) / 2
            ]);

            // Calculate zoom level based on distance
            const latDiff = maxLat - minLat;
            const lngDiff = maxLng - minLng;
            const maxDiff = Math.max(latDiff, lngDiff);

            // Simple zoom calculation, adjust as needed
            if (maxDiff < 0.005) setZoom(16);
            else if (maxDiff < 0.01) setZoom(15);
            else if (maxDiff < 0.02) setZoom(14);
            else setZoom(13);
        }
    };

    const getStopById = (stopId) => {
        if (!stopId) return null;
        const searchId = stopId.toString();
        const stop = stops.find(stop => stop.id.toString() === searchId);
        if (!stop) {
            console.warn(`Stop with ID ${stopId} not found in loaded stops:`, stops);
        }
        return stop;
    };

    const getBusById = (busId) => {
        return buses.find(bus => bus.id === busId);
    };

    // Simplified version - remove the special handling for start/end stops
    // since we're treating it as a circular route
    const getStopIcon = () => {
        // Use custom bus stop icon
        return new L.Icon({
            iconUrl: '/images/bus-stop.png',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        });
    };
    

    // Begin editing a stop including name
    const handleEditStopFull = (routeId) => {
        const routeStop = formData.stops.find(stop => stop.id === routeId);
        if (routeStop) {
            setEditingStopId(routeId);
            setEditingStopName(true);
            setEditFormData({
                stop_id: routeStop.bus_stop_id,
                stop_order: routeStop.stop_order,
                time_from_start: routeStop.time_from_start || 0
            });
        }
    };

    // Save edited stop including name change
    const handleSaveStopFull = async () => {
        if (!editingStopId) return;

        try {
            setMapLoading(true);
            await axios.put(
                getApiUrl(api.endpoints.adminUpdateRoute(editingStopId)),
                {
                    bus_stop_id: Number(editFormData.stop_id), // Ensure proper numeric conversion
                    stop_order: parseInt(editFormData.stop_order),
                    time_from_start: parseFloat(editFormData.time_from_start)
                },
                { headers: { Authorization: `Bearer ${user.token}` } }
            );

            // Refresh routes after update
            const response = await axios.get(
                getApiUrl(api.endpoints.adminRouteById(selectedBus)),
                { headers: { Authorization: `Bearer ${user.token}` } }
            );
            const busRoutes = response.data;

            // First erase old data
            setFormData((prevData) => ({
                ...prevData,
                stops: []
            }));

            // Then, redraw after a short delay
            setTimeout(() => {
                setFormData({
                    bus_id: selectedBus,
                    stops: busRoutes
                });
                fitRouteOnMap(busRoutes);
            }, 0);

            // Reset edit state
            setEditingStopId(null);
            setEditingStopName(false);
            setEditFormData({
                stop_id: '',
                stop_order: '',
                time_from_start: ''
            });

            // Update map
            fitRouteOnMap(busRoutes);
        } catch (err) {
            setError('Error updating stop: ' + (err.response?.data?.message || err.message));
            console.error("Error updating stop:", err);
        } finally {
            setMapLoading(false);
        }
    };

    // Cancel editing stop
    const handleCancelStopEdit = () => {
        setEditingStopId(null);
        setEditingStopName(false);
        setEditFormData({
            stop_id: '',
            stop_order: '',
            time_from_start: ''
        });
    };

    // Enhanced function to fetch bus location with proper debugging
    const fetchBusLocation = async (busId) => {
        try {
            console.log('Fetching bus location for ID:', busId);
            
            // Use the API endpoint from api2.js instead of hardcoding the path
            const requestUrl = getApiUrl(api.endpoints.adminBusLocation(busId));
            console.log('Request URL:', requestUrl);
            
            const response = await axios.get(
                requestUrl,
                { 
                    headers: { 
                        Authorization: `Bearer ${user.token}`,
                        'Accept': 'application/json'
                    }
                }
            );
            
            console.log('Bus location response:', response.data);
            
            if (response.data) {
                // Parse latitude and longitude as numbers
                const lat = parseFloat(response.data.latitude);
                const lng = parseFloat(response.data.longitude);
                
                console.log('Parsed coordinates:', { lat, lng });
                
                if (!isNaN(lat) && !isNaN(lng)) {
                    console.log('Setting valid bus location');
                    setBusLocation({
                        latitude: lat,
                        longitude: lng,
                        timestamp: response.data.timestamp
                    });
                    
                    // Center map on bus location for better visibility
                    if (mapRef.current) {
                        console.log('Centering map on bus location');
                        const map = mapRef.current;
                        map.setView([lat, lng], map.getZoom() || 15);
                    }
                } else {
                    console.error('Invalid location coordinates in response:', response.data);
                    setBusLocation(null);
                }
            }
        } catch (err) {
            console.error('Error fetching bus location:', err);
            console.log('Error details:', err.response?.data || err.message);
            setBusLocation(null);
        }
    };

    // Set up polling for bus location when a bus is selected
    useEffect(() => {
        // Clear previous interval if it exists
        if (locationRefreshInterval) {
            clearInterval(locationRefreshInterval);
        }

        // If a bus is selected, start fetching its location
        if (selectedBus) {
            //console.log(`Setting up location polling for bus ID: ${selectedBus}`);
            
            // Fetch location immediately
            fetchBusLocation(selectedBus);
            
            // Set up interval to refresh location every 5 seconds
            const intervalId = setInterval(() => {
                //console.log(`Polling location for bus ID: ${selectedBus}`);
                fetchBusLocation(selectedBus);
            }, 5000); // 5 seconds
            
            setLocationRefreshInterval(intervalId);
            
            // Clean up interval on unmount or when bus changes
            return () => {
                //console.log('Cleaning up location interval');
                clearInterval(intervalId);
            };
        } else {
            // Reset bus location if no bus is selected
            setBusLocation(null);
        }
    }, [selectedBus, user.token]);

    // Enhanced bus icon for better visibility
    const getBusIcon = () => {
        return L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png', // Better bus icon
            iconSize: [50, 50],  // Larger size
            iconAnchor: [25, 50],
            popupAnchor: [0, -45],
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            shadowSize: [41, 41],
            shadowAnchor: [12, 41]
        });
    };

    if (loading && !buses.length && !stops.length) {
        return <div>Loading route data...</div>;
    }

    return (
        <div className="route-management">
            {/* Full-page loading overlay */}
            {mapLoading && (
                <div className="fullpage-loading-overlay">
                    <p>Loading routes...</p>
                </div>
            )}
            <h2>Route Management</h2>
            {error && <div className="error-message">{error}</div>}

            <div className="action-buttons">
                <button
                    className="refresh-button"
                    onClick={() => setRefreshTrigger(prev => prev + 1)}
                    disabled={loading}
                >
                    {loading ? 'Refreshing...' : 'Refresh Data'}
                </button>

                {/* <button onClick={() => setShowMapDebug(!showMapDebug)}>
                    {showMapDebug ? "Hide Debug Info" : "Show Debug Info"}
                </button> */}
            </div>

            {showMapDebug && (
                <div className="debug-info" style={{ padding: '10px', backgroundColor: '#f0f0f0', margin: '10px 0', borderRadius: '5px' }}>
                    <h4>Route Debug Information</h4>
                    <p>Buses Loaded: {buses.length}</p>
                    <p>Stops Loaded: {stops.length}</p>
                    <p>Selected Bus: {selectedBus ? getBusById(selectedBus)?.name : 'None'}</p>
                    <p>Route Stops: {formData.stops.length}</p>
                    <p>Map Center: {mapCenter.join(', ')}</p>
                    <button onClick={() => {
                        window.routeDiagnostics.logState();
                        //console.log("Current formData:", formData);
                    }}>
                        Log Debug Info to Console
                    </button>
                </div>
            )}

            <div className="route-management-content">
                <div className="bus-selector">
                    <h3>Select Bus to Manage Route</h3>
                    <div className="bus-selector-dropdown">
                        <select 
                            value={selectedBus || ''}
                            onChange={(e) => handleBusSelect(e.target.value)}
                            className="bus-dropdown"
                        >
                            <option value="">-- Select a Bus --</option>
                            {buses.map(bus => (
                                <option key={bus.id} value={bus.id}>
                                    {bus.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {selectedBus && (
                    <>
                        <div className="route-editor">
                            <h3>Route for {getBusById(selectedBus)?.name}</h3>

                            {/* Start Times Management Section */}
                            <div className="start-times-section">
                                <h4>Bus Start Times</h4>
                                
                                <table className="start-times-table">
                                    <thead>
                                        <tr>
                                            <th>Repetition</th>
                                            <th>Start Time</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {startTimes.length === 0 ? (
                                            <tr>
                                                <td colSpan="3">No start times defined yet.</td>
                                            </tr>
                                        ) : (
                                            startTimes.map(time => (
                                                <tr key={time.id}>
                                                    <td>{time.rep_no}</td>
                                                    <td>
                                                        {editingTimeId === time.id ? (
                                                            <input
                                                                type="time"
                                                                value={newStartTime}
                                                                onChange={(e) => setNewStartTime(e.target.value)}
                                                                required
                                                            />
                                                        ) : (
                                                            time.start_time
                                                        )}
                                                    </td>
                                                    <td>
                                                        {editingTimeId === time.id ? (
                                                            <>
                                                                <button onClick={handleSaveStartTime}>Save</button>
                                                                <button onClick={handleCancelEditStartTime}>Cancel</button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button onClick={() => handleEditStartTime(time.id)}>Edit</button>
                                                                <button 
                                                                    onClick={() => handleDeleteStartTime(time.id)}
                                                                    className="delete-time-button"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                                
                                {isAddingStartTime ? (
                                    <div className="add-start-time-form">
                                        <h5>Add New Start Time</h5>
                                        <div className="form-group">
                                            <input
                                                type="time"
                                                value={newStartTime}
                                                onChange={(e) => setNewStartTime(e.target.value)}
                                                placeholder="HH:MM"
                                                required
                                            />
                                            <div className="form-buttons">
                                                <button onClick={handleAddStartTime}>Save</button>
                                                <button onClick={() => {
                                                    setIsAddingStartTime(false);
                                                    setNewStartTime('');
                                                }}>Cancel</button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        className="add-start-time-button"
                                        onClick={() => setIsAddingStartTime(true)}
                                    >
                                        Add Start Time
                                    </button>
                                )}
                            </div>

                            <h4>Route Stops</h4>
                            {formData.stops.length === 0 ? (
                                <p>No stops assigned to this route. Add stops below.</p>
                            ) : (
                                <table className="route-stops-table">
                                    <thead>
                                        <tr>
                                            <th>Order</th>
                                            <th>Stop Name</th>
                                            <th>Time(min from start)</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...formData.stops]
                                            .sort((a, b) => a.stop_order - b.stop_order)
                                            .map(routeStop => {
                                                const stop = getStopById(routeStop.bus_stop_id);
                                                const stopName = stop ? stop.name : `Unknown Stop (ID: ${routeStop.bus_stop_id})`;
                                                return (
                                                    <tr key={`${routeStop.id}-${refreshTrigger}`}>
                                                        <td>{routeStop.stop_order}</td>
                                                        <td>
                                                            {editingStopId === routeStop.id && editingStopName ? (
                                                                <select
                                                                    value={editFormData.stop_id}
                                                                    onChange={(e) =>
                                                                        setEditFormData({
                                                                            ...editFormData,
                                                                            stop_id: e.target.value
                                                                        })
                                                                    }
                                                                >
                                                                    <option value="">Select Stop</option>
                                                                    {stops.map(s => (
                                                                        <option key={s.id} value={s.id}>
                                                                            {s.name}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                stopName
                                                            )}
                                                        </td>
                                                        <td>
                                                            {editingStopId === routeStop.id ? (
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.1"
                                                                    value={editFormData.time_from_start}
                                                                    onChange={(e) =>
                                                                        setEditFormData({
                                                                            ...editFormData,
                                                                            time_from_start: e.target.value
                                                                        })
                                                                    }
                                                                    required
                                                                />
                                                            ) : (
                                                                <span>{routeStop.time_from_start || 0}</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            {editingStopId === routeStop.id ? (
                                                                <>
                                                                    <button onClick={handleSaveStopFull}>Save</button>
                                                                    <button onClick={handleCancelStopEdit}>Cancel</button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <button onClick={() => handleEditStopFull(routeStop.id)}>
                                                                        Edit
                                                                    </button>
                                                                    <button onClick={() => handleRemoveStop(routeStop.id)}>
                                                                        Remove
                                                                    </button>
                                                                </>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            )}

                            {/* Add Stop Form */}
                            {isAddingStop ? (
                                <div className="add-stop-form">
                                    <h5>Add New Stop</h5>
                                    <div className="form-group">
                                        <select
                                            value={editFormData.stop_id}
                                            onChange={(e) => setEditFormData({
                                                ...editFormData,
                                                stop_id: e.target.value
                                            })}
                                            required
                                        >
                                            <option value="">Select Stop</option>
                                            {stops.map(stop => (
                                                <option key={stop.id} value={stop.id}>
                                                    {stop.name}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="form-buttons">
                                            <button onClick={() => handleAddStop(editFormData.stop_id)}>Add</button>
                                            <button onClick={() => setIsAddingStop(false)}>Cancel</button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    className="add-stop-button"
                                    onClick={() => setIsAddingStop(true)}
                                >
                                    Add Stop
                                </button>
                            )}

                            {/* Route status indicator */}
                            {selectedBus && (
                                <div className="route-status">
                                    <p>
                                        <strong>Route Status:</strong> {formData.stops.length < 2
                                            ? "Add at least 2 stops to create a route"
                                            : `Route with ${formData.stops.length} stops and ${startTimes.length} scheduled departure times`}
                                    </p>
                                </div>
                            )}

                            {/* Add bus location status indicator */}
                            {busLocation && (
                                <div className="route-status bus-location-status">
                                    <p>
                                        <strong>Live Bus Location:</strong> Last updated {busLocation.timestamp ? 
                                            new Date(busLocation.timestamp).toLocaleString() : 'N/A'}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Map Container - Right Side */}
                        <div className="route-map-container">
                            <MapContainer
                                center={mapCenter}
                                zoom={zoom}
                                style={{ height: '100%', width: '100%' }}
                                whenCreated={mapInstance => {
                                    console.log('Map created');
                                    mapRef.current = mapInstance;
                                }}
                            >
                                <TileLayer
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                />
                                <MapUpdater center={mapCenter} zoom={zoom} />
                                <RoadBasedRoutes stops={formData.stops} />

                                {/* Add bus location marker with better debug */}
                                {busLocation ? (
                                    <Marker 
                                        key={`bus-location-${selectedBus}-${Date.now()}`} 
                                        position={[busLocation.latitude, busLocation.longitude]}
                                        icon={getBusIcon()}
                                        zIndexOffset={1000} // Ensure it's on top of other markers
                                    >
                                        <Popup>
                                            <div>
                                                <strong>{getBusById(selectedBus)?.name}</strong>
                                                <br />
                                                <span>Live Location</span>
                                                <br />
                                                <span>Coordinates: {busLocation.latitude.toFixed(6)}, {busLocation.longitude.toFixed(6)}</span>
                                                <br />
                                                <span>Last updated: {new Date(busLocation.timestamp).toLocaleString()}</span>
                                            </div>
                                        </Popup>
                                    </Marker>
                                ) : (
                                    <div style={{ display: 'none' }}>Bus location not available</div>
                                )}

                                {stops.map(stop => {
                                    const appearances = formData.stops.filter(s => 
                                        s.bus_stop_id?.toString() === stop.id?.toString()
                                    );
                                    if (appearances.length > 0) {
                                        return (
                                            <Marker key={stop.id} position={[parseFloat(stop.latitude), parseFloat(stop.longitude)]} icon={getStopIcon()}>
                                                <Popup>
                                                    <div>
                                                        <strong>{stop.name}</strong>
                                                        <br />
                                                        {appearances.map((a, idx) => 
                                                            `Stop ${a.stop_order}: ${a.time_from_start || 0} min`
                                                        ).join(', ')}
                                                    </div>
                                                </Popup>
                                            </Marker>
                                        );
                                    }
                                    return null;
                                })}
                            </MapContainer>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default RouteManagement;
