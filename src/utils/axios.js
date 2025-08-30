import axios from 'axios';

const VITE_APP_API_URL = 'https://mock-data-api-nextjs.vercel.app/';
const axiosServices = axios.create({ baseURL: VITE_APP_API_URL || 'http://localhost:3010/' });

// ==============================|| AXIOS - FOR MOCK SERVICES ||============================== //

axiosServices.interceptors.request.use(
  async (config) => {
    // Only attach mock Authorization in development if provided via env
    if (import.meta.env.DEV && import.meta.env.VITE_MOCK_API_TOKEN) {
      config.headers['Authorization'] = `Bearer ${import.meta.env.VITE_MOCK_API_TOKEN}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default axiosServices;

export const fetcher = async (args) => {
  const [url, config] = Array.isArray(args) ? args : [args];

  const res = await axiosServices.get(url, { ...config });

  return res.data;
};

export const fetcherPost = async (args) => {
  const [url, config] = Array.isArray(args) ? args : [args];

  const res = await axiosServices.post(url, { ...config });

  return res.data;
};
