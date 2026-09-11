import L from 'leaflet';

/**
 * Create a custom icon for map markers
 * @param {string} url - URL to the icon image
 * @param {number} size - Size of the icon in pixels
 * @returns {L.Icon} Leaflet icon object
 */
export const createIcon = (url, size = 32) => {
    return new L.Icon({
        iconUrl: url,
        iconSize: [size, size],
        iconAnchor: [size/2, size],
        popupAnchor: [0, -size]
    });
};

/**
 * Validate coordinates to ensure they're usable for the map
 * @param {string|number} lat - Latitude
 * @param {string|number} lng - Longitude
 * @returns {boolean} True if coordinates are valid
 */
export const validateCoordinates = (lat, lng) => {
    if (!lat || !lng) return false;
    
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    
    if (isNaN(parsedLat) || isNaN(parsedLng)) return false;
    
    // Basic range check
    if (parsedLat < -90 || parsedLat > 90) return false;
    if (parsedLng < -180 || parsedLng > 180) return false;
    
    return true;
};

/**
 * Calculate the center point of multiple coordinates
 * @param {Array} coordinates - Array of [lat, lng] coordinates
 * @returns {Array|null} Center point as [lat, lng] or null if no valid coordinates
 */
export const calculateCenter = (coordinates) => {
    if (!coordinates || coordinates.length === 0) return null;
    
    const validCoords = coordinates.filter(coord => 
        validateCoordinates(coord[0], coord[1])
    );
    
    if (validCoords.length === 0) return null;
    
    const sumLat = validCoords.reduce((sum, coord) => sum + parseFloat(coord[0]), 0);
    const sumLng = validCoords.reduce((sum, coord) => sum + parseFloat(coord[1]), 0);
    
    return [sumLat / validCoords.length, sumLng / validCoords.length];
};
