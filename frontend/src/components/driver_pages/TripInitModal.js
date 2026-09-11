import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getApiUrl } from '../../utils/api2.js';
import '../../css/TripInitModal.css';

function TripInitModal({ show, onClose, busInfo, onTripInit }) {
  const [startTimes, setStartTimes] = useState([]);
  const [stops, setStops] = useState([]);
  const [selectedStartTime, setSelectedStartTime] = useState('');
  const [selectedStopIdx, setSelectedStopIdx] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!show || !busInfo || !busInfo.bus) return;

    const fetchTripOptions = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await axios.get(
          getApiUrl(`/driver/trip-options/${busInfo.bus.id}`),
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
            }
          }
        );
        if (response.data && response.data.data) {
          const { scheduledTimes, routeStops } = response.data.data;
          setStartTimes(scheduledTimes);

          const sortedStops = [...routeStops].sort((a, b) =>
            parseInt(a.stop_order) - parseInt(b.stop_order)
          );
          setStops(sortedStops);

          if (scheduledTimes && scheduledTimes.length > 0) {
            setSelectedStartTime(scheduledTimes[0].start_time);
          }

          let defaultIdx = 0;
          if (busInfo.nextStop) {
            const idx = sortedStops.findIndex(
              stop => stop.stop_id.toString() === busInfo.nextStop.stop_id.toString()
            );
            defaultIdx = idx !== -1 ? idx : 0;
          }
          setSelectedStopIdx(defaultIdx.toString());
        } else {
          throw new Error("Invalid response format from server");
        }
        setLoading(false);
      } catch (error) {
        setError('Failed to load trip options. Please try again.');
        setLoading(false);
      }
    };

    fetchTripOptions();
  }, [show, busInfo]);

  const handleCloseModal = () => {
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const idx = parseInt(selectedStopIdx, 10);
    if (!selectedStartTime || isNaN(idx) || !stops[idx]) {
      setError('Please select both a start time and next stop.');
      return;
    }
    try {
      setLoading(true);
      const response = await axios.post(
        getApiUrl('/driver/initialize-trip'),
        {
          busId: busInfo.bus.id,
          startTime: selectedStartTime,
          nextStopId: stops[idx].stop_id,
          nextStopSequence: idx
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
          }
        }
      );
      if (response.data && response.data.success) {
        onTripInit(response.data.data);
        onClose();
      } else {
        setError(response.data?.message || 'Failed to initialize trip.');
      }
      setLoading(false);
    } catch (error) {
      setError('Failed to initialize trip. Please try again.');
      setLoading(false);
    }
  };

  if (!show) return null;

  return (
    <div className="trip-init-modal-overlay">
      <div className="trip-init-modal">
        <div className="trip-init-header">
          <h2>Initialize Trip for Bus {busInfo?.bus?.name}</h2>
          <button type="button" className="close-button" onClick={handleCloseModal}>×</button>
        </div>
        {loading ? (
          <div className="trip-init-loading">
            <div className="spinner"></div>
            <p>Loading trip options...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="trip-init-error">{error}</div>}
            <div className="form-group">
              <label htmlFor="start-time">Start Time:</label>
              <select
                id="start-time"
                value={selectedStartTime}
                onChange={(e) => setSelectedStartTime(e.target.value)}
                required
              >
                {startTimes.length > 0 ? (
                  startTimes.map((time, index) => (
                    <option key={time.id || index} value={time.start_time}>
                      {time.start_time} (Rep #{time.rep_no})
                    </option>
                  ))
                ) : (
                  <option value="">No scheduled times available</option>
                )}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="next-stop">Next Stop:</label>
              <select
                id="next-stop"
                value={selectedStopIdx}
                onChange={(e) => setSelectedStopIdx(e.target.value)}
                required
              >
                {stops.length > 0 ? (
                  stops.map((stop, idx) => (
                    <option
                      key={`${stop.stop_id}-${idx}`}
                      value={idx}
                    >
                      {`${parseInt(stop.stop_order)}. ${stop.name} (${stop.time_from_start} min)`}
                    </option>
                  ))
                ) : (
                  <option value="">No stops available</option>
                )}
              </select>
            </div>
            <div className="trip-init-actions">
              <button
                type="button"
                className="cancel-button"
                onClick={handleCloseModal}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="submit-button"
                disabled={loading}
              >
                {loading ? 'Submitting...' : 'Start Trip'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default TripInitModal;
