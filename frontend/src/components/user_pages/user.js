import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../css/user.css';
import BusTracking from './BusTracking';
import BusStopsView from './SearchBus';
import BusStopSearch from './BusStopSearch';
import api from '../../utils/api'; // Import the api utility instead of axios

const User = () => {
    const [userLocation, setUserLocation] = useState(null);
    const [authError, setAuthError] = useState(null);
    const [activeTab, setActiveTab] = useState('searchStops'); // Changed from 'busStops' to 'searchStops'
    const navigate = useNavigate();

    // Function to check if JWT token is expired
    const checkTokenExpiration = useCallback(() => {
        const token = localStorage.getItem('jwtToken');
        
        if (!token) {
            setAuthError('You must be logged in to access this feature');
            return false;
        }

        try {
            // JWT tokens are split into three parts by dots
            const payload = token.split('.')[1];
            // Decode the base64 encoded payload
            const decodedPayload = JSON.parse(atob(payload));
            
            // Check if token has expired
            if (decodedPayload.exp && decodedPayload.exp * 1000 < Date.now()) {
                // Token has expired
                localStorage.removeItem('jwtToken'); // Remove the expired token
                alert('Session timed out. Please login again.');
                navigate('/login'); // Redirect to login page
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('Error checking token expiration:', error);
            setAuthError('Authentication error. Please login again.');
            return false;
        }
    }, [navigate]);

    // Function to update user location in the database - use api instead of axios
    const updateUserLocationInDB = useCallback(async () => {
        if (!userLocation) return;
        
        const token = localStorage.getItem('jwtToken');
        if (!token) return;
        
        try {
            await api.post('/bus_stops/updateLocation', {
                latitude: userLocation[0],
                longitude: userLocation[1]
            }, { withCredentials: true });
            //console.log('User location updated in the database');
        } catch (error) {
            console.error('Error updating user location:', error);
        }
    }, [userLocation]);

    // Get user's location and update state live for pin movement (high accuracy)
    useEffect(() => {
        let geoWatchId;
        if (navigator.geolocation) {
            geoWatchId = navigator.geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    setUserLocation([latitude, longitude]);
                },
                (err) => {
                    console.error("Geolocation error:", err.message);
                    setUserLocation([22.3149, 87.3104]);
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
            );
        }
        return () => {
            if (geoWatchId && navigator.geolocation) {
                navigator.geolocation.clearWatch(geoWatchId);
            }
        };
    }, []);

    // Update user location in the database every 10 minutes (was 5 seconds)
    useEffect(() => {
        // Only proceed if user is authenticated and location is available
        if (!localStorage.getItem('jwtToken') || !userLocation) return;
        
        // Update location immediately when component mounts
        updateUserLocationInDB();
        
        // Set up interval to update location every 10 minutes
        const locationInterval = setInterval(() => {
            // Get fresh location before updating
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        setUserLocation([latitude, longitude]);
                        updateUserLocationInDB();
                    },
                    (err) => {
                        console.error("Geolocation refresh error:", err.message);
                        // Use existing location if fresh location can't be obtained
                        updateUserLocationInDB();
                    }
                );
            } else {
                // If geolocation is not available, update with existing location
                updateUserLocationInDB();
            }
        }, 10 * 60 * 1000); // 10 minutes in milliseconds
        
        // Clean up interval on component unmount
        return () => {
            clearInterval(locationInterval);
        };
    }, [userLocation, updateUserLocationInDB]);

    // Check if user is logged in and set up token expiration check
    useEffect(() => {
        // Initial check
        const isValid = checkTokenExpiration();
        
        if (!isValid) {
            return;
        }
        
        // Set up periodic token check (every 5 minutes)
        const intervalId = setInterval(() => {
            checkTokenExpiration();
        }, 5 * 60 * 1000); // 5 minutes in milliseconds
        
        // Clean up on component unmount
        return () => {
            clearInterval(intervalId);
        };
    }, [checkTokenExpiration]);

    return (
        <div className="map-interface">
            <div className="header-panel">                
                {authError && (
                    <div className="auth-error-message">
                        <p>{authError}</p>
                        <button onClick={() => window.location.href = '/login'}>
                            Go to Login
                        </button>
                    </div>
                )}
                
                <div className="tab-navigation">
                    <button 
                        className={`tab-button ${activeTab === 'searchStops' ? 'active' : ''}`}
                        onClick={() => setActiveTab('searchStops')}
                    >
                        Search Bus Stops
                    </button>
                    <button 
                        className={`tab-button ${activeTab === 'busStops' ? 'active' : ''}`}
                        onClick={() => setActiveTab('busStops')}
                    >
                        Search Buses
                    </button>
                    <button 
                        className={`tab-button ${activeTab === 'trackBus' ? 'active' : ''}`}
                        onClick={() => setActiveTab('trackBus')}
                    >
                        Track Bus
                    </button>
                </div>
            </div>
            
            <div className="content-area">
                {activeTab === 'busStops' ? (
                    <BusStopsView userLocation={userLocation} setUserLocation={setUserLocation} />
                ) : activeTab === 'trackBus' ? (
                    <BusTracking userLocation={userLocation} setUserLocation={setUserLocation} />
                ) : (
                    <BusStopSearch userLocation={userLocation} setUserLocation={setUserLocation} />
                )}
            </div>
        </div>
    );
};

export default User;