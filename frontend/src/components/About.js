import React from 'react';
import '../css/About.css';

function About() {
  return (
    <div className="about-page">
      
      <main className="about-content">
        <h1>About KGP_BUS</h1>
        <p>
          Welcome to KGP_BUS, your premier transportation service for the KGP campus and surroundings.
          Our mission is to provide reliable, safe and efficient bus services to all students, faculty and staff.
        </p>
        
        <h2>Our Service</h2>
        <p>
          KGP_BUS offers regular shuttle services across all major locations within and around the campus.
          With our modern fleet of buses and dedicated staff, we ensure punctuality and comfort for all passengers.
        </p>
        
        <h2>Contact Information</h2>
        <p>
          Email: info@kgpbus.com<br />
          Phone: +91-123-456-7890<br />
          Address: Transportation Office, KGP Campus
        </p>
      </main>
      
    </div>
  );
}

export default About;