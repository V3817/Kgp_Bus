import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Typed from 'typed.js';
import '../css/Body.css';
import backgroundImage from '../images/kgp.png';

function Body() {
  const typedElement = useRef(null);
  const typedInstance = useRef(null);

  useEffect(() => {
    typedInstance.current = new Typed(typedElement.current, {
      strings: [
        "Track your bus 🚎",
        "Track location of buses 🟢",
        "Wanna go anywhere ❓",
        "Let's travel safely 😊"
      ],
      typeSpeed: 50,
      backSpeed: 30,
      loop: true,
      showCursor: true,
      cursorChar: "|",
    });

    return () => {
      // Destroy Typed instance during cleanup to prevent memory leaks
      typedInstance.current.destroy();
    };
  }, []);

  return (
    <main className="body-container">
      <div className="background-container">
        {/* Replace video with image */}
        <div className="background-image" style={{ backgroundImage: `url(${backgroundImage})` }}></div>
        
        <div className="overlay"></div>
        
        <div className="content">
          <div className="description">
            <h1>Welcome to IIT KGP BUS SERVICES</h1>
            <h2><span ref={typedElement}></span></h2>
          </div>
          
          <div className="action-buttons">
            <Link to="/login" className="btn btn-login">Login</Link>
            <Link to="/signup" className="btn btn-signup">Sign Up</Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default Body;