// Configuration for API endpoints
// Change this to switch between local and VM deployment

// Set to 'local' for local development, 'vm' for VM deployment
const DEPLOYMENT = 'vm'; // Change to 'vm' when deploying to VM

const API_BASE_URL = DEPLOYMENT === 'vm' 
  ? 'http://34.56.119.174:5001'
  : 'http://localhost:5001';

export default API_BASE_URL;

