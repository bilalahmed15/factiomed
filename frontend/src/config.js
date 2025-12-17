// API Configuration
// For production (Vercel), use relative path - Vercel will proxy to EC2 backend
// For development, use localhost
const isProduction = import.meta.env.PROD;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (isProduction ? '' : 'http://localhost:3001');

export const API_BASE = `${API_BASE_URL}/api`;

