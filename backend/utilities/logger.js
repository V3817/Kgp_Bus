/**
 * Helper utility for logging that sanitizes sensitive information
 */
export const logger = {
  // General info logs
  info: (message, data = {}) => {
    // Remove or sanitize sensitive fields
    const sanitizedData = { ...data };
    if (sanitizedData.email) sanitizedData.email = '****@****.***';
    if (sanitizedData.password) sanitizedData.password = '********';
    if (sanitizedData.token) sanitizedData.token = '********';
    
    ////console.log(`[INFO] ${message}`, sanitizedData);
  },
  
  // Error logs
  error: (message, error = null) => {
    // Avoid logging full error objects which might contain sensitive data
    if (error) {
      console.error(`[ERROR] ${message} - ${error.message || 'Unknown error'}`);
    } else {
      console.error(`[ERROR] ${message}`);
    }
  },
  
  // Warning logs
  warn: (message, data = {}) => {
    // Remove or sanitize sensitive fields
    const sanitizedData = { ...data };
    if (sanitizedData.email) sanitizedData.email = '****@****.***';
    if (sanitizedData.password) sanitizedData.password = '********';
    if (sanitizedData.token) sanitizedData.token = '********';
    
    console.warn(`[WARNING] ${message}`, sanitizedData);
  },
  
  // Debug logs - only in development
  debug: (message, data = {}) => {
    if (process.env.NODE_ENV !== 'production') {
      // Remove sensitive fields even in debug
      const sanitizedData = { ...data };
      if (sanitizedData.email) sanitizedData.email = '****@****.***';
      if (sanitizedData.password) sanitizedData.password = '********';
      if (sanitizedData.token) sanitizedData.token = '********';
      
      ////console.log(`[DEBUG] ${message}`, sanitizedData);
    }
  },
  
  // Security events should be logged carefully
  security: (message) => {
    ////console.log(`[SECURITY] ${message}`);
  }
};
