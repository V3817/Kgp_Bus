import React from 'react';
import '../css/Footer.css';

function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="footer">
      <div className="footer-content">
        <p className="app-name">KGP_BUS</p>
        <p className="copyright">&copy; {currentYear} KGP_BUS. All rights reserved.</p>
      </div>
    </footer>
  );
}

export default Footer;