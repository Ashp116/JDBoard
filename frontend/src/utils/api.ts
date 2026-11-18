/**
 * API Configuration Utility
 * Automatically detects the correct backend URL for both local and LAN access
 */

// The backend is always reached on the same origin under /api: the Vite dev
// server proxies it in development and nginx (deploy/nginx-jdboard.conf) does when installed.
export const getBackendUrl = () => `${window.location.origin}/api`;

// Create a configured axios instance if needed
export const createApiClient = () => {
  const baseURL = getBackendUrl();
  
  // If axios is available, create instance
  if (typeof window !== 'undefined' && (window as any).axios) {
    return (window as any).axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
  
  // Fallback: return fetch-based client
  return {
    get: async (url) => {
      const response = await fetch(`${baseURL}${url}`);
      return { data: await response.json() };
    },
    post: async (url, data) => {
      const response = await fetch(`${baseURL}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return { data: await response.json() };
    },
  };
};

// Export default backend URL
export default getBackendUrl;