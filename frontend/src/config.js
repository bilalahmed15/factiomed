// API Configuration
// For production (Vercel), use relative path - Vercel will proxy to EC2 backend
// For development, this will be proxied by Vite
const isProduction = import.meta.env.PROD;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (isProduction ? '' : 'http://3.70.248.124:3001');

export const API_BASE = `${API_BASE_URL}/api`;

