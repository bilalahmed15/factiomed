// API Configuration
// For production, use the EC2 backend URL
// For development, this will be proxied by Vite
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://3.70.248.124:3001';

export const API_BASE = `${API_BASE_URL}/api`;

