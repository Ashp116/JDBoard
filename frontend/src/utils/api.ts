/**
 * API Configuration Utility
 * Automatically detects the correct backend URL for both local and LAN access
 */

// Get the backend URL based on current location
export const getBackendUrl = () => {
  const host = window.location.hostname;
  const port = 5000; // Backend port
  
  // Use the same host but different port for backend
  const backendUrl = `http://${host}:${port}`;
  
  console.log(`Backend URL: ${backendUrl}`);
  return backendUrl;
};

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