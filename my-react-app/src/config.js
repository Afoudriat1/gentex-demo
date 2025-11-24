const DEPLOYMENT = process.env.REACT_APP_DEPLOYMENT || 'vm';

const API_BASE_URL = DEPLOYMENT === 'vm'
  ? (process.env.REACT_APP_API_URL || 'http://34.56.119.174:5001')
  : 'http://localhost:5001';

console.log('API_BASE_URL:', API_BASE_URL);

export default API_BASE_URL;