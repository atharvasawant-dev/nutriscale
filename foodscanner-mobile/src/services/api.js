import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getToken, removeToken } from '../utils/storage';
import { resetToLogin } from '../utils/navigationRef';

const DEFAULT_PUBLIC_URL = 'https://foodscanner-ai.onrender.com';
const API_PORT = '8000';

function normalizeBaseUrl(url) {
  if (!url || typeof url !== 'string') return null;
  return url.trim().replace(/\/+$/, '');
}

function extractHost(value) {
  if (!value || typeof value !== 'string') return null;

  const rawValue = value.trim();
  if (!rawValue) return null;

  try {
    const withProtocol = rawValue.includes('://') ? rawValue : `http://${rawValue}`;
    const parsed = new URL(withProtocol);
    return parsed.hostname || null;
  } catch (_e) {
    const host = rawValue.split('/')[0].split(':')[0];
    return host || null;
  }
}

function getExpoHostIp() {
  try {
    const candidates = [
      Constants?.expoConfig?.hostUri,
      Constants?.expoGoConfig?.debuggerHost,
      Constants?.manifest?.debuggerHost,
      Constants?.manifest?.hostUri,
      Constants?.manifest2?.extra?.expoClient?.hostUri,
      Constants?.manifest2?.extra?.expoClient?.debuggerHost,
    ];

    for (const candidate of candidates) {
      const host = extractHost(candidate);
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return host;
      }
    }
  } catch (_e) {
    // Fall through to the public backend URL.
  }
  return null;
}

const envBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
const expoHostIp = getExpoHostIp();
const expoDerivedUrl = expoHostIp ? `http://${expoHostIp}:${API_PORT}` : null;
const defaultNativeUrl = expoDerivedUrl || DEFAULT_PUBLIC_URL;
export const BASE_URL =
  envBaseUrl ||
  (Platform.OS === 'web'
    ? DEFAULT_PUBLIC_URL
    : defaultNativeUrl);

let _baseUrlLogged = false;
export function getApiBaseUrl() {
  return BASE_URL;
}

export function getNetworkErrorMessage(error) {
  if (error?.response) {
    return error.response.data?.detail || error.message || 'Request failed';
  }

  if (error?.request || error?.message === 'Network Error') {
    return `Cannot reach backend at ${BASE_URL}. Please check your internet connection and try again.`;
  }

  return error?.message || 'Request failed';
}

function logBaseUrlOnce() {
  if (_baseUrlLogged) return;
  _baseUrlLogged = true;
  console.log('API BASE_URL =', BASE_URL);
}

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
});

client.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      try {
        await removeToken();
      } catch (_e) {
        // ignore
      }
      try {
        resetToLogin();
      } catch (_e) {
        // ignore
      }
    }
    return Promise.reject(error);
  }
);

export async function login(email, password) {
  logBaseUrlOnce();
  const res = await client.post('/login', { email, password });
  return res.data;
}

export async function register(email, password, name) {
  logBaseUrlOnce();
  const res = await client.post('/register', { email, password, name });
  return res.data;
}

export async function pingApi() {
  logBaseUrlOnce();
  const res = await client.get('/docs');
  return res.status;
}

export async function scanProduct(barcode, productName) {
  const res = await client.post('/scan', { barcode, product_name: productName || null });
  return res.data;
}

export async function measurePortion(sessionId, weightGrams, source = 'mock') {
  const res = await client.post(`/scan-sessions/${sessionId}/measurement`, {
    weight_grams: weightGrams,
    source,
  });
  return res.data;
}

export async function savePortion(sessionId) {
  const res = await client.post(`/scan-sessions/${sessionId}/save`);
  return res.data;
}

export async function searchProduct(query) {
  const res = await client.get('/search', { params: { query } });
  return res.data;
}

export async function getDailyReport() {
  const res = await client.get('/report/daily');
  return res.data;
}

export async function getWeeklyReport() {
  const res = await client.get('/report/weekly');
  return res.data;
}

export async function explainProduct(barcode) {
  const res = await client.get(`/explain/${encodeURIComponent(barcode)}`);
  return res.data;
}

export async function analyzeManualProduct(data) {
  const res = await client.post('/analyze', data);
  return res.data;
}

export async function scanNutritionLabel(base64Image) {
  const res = await client.post('/ocr', { image_base64: base64Image });
  return res.data;
}

export const logFoodManual = async (productName, calories) => {
  const token = await getToken();
  const response = await axios.post(
    `${BASE_URL}/food-log`,
    {
      product_name: productName,
      calories: parseFloat(calories) || 0,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export async function getUserProfile() {
  const res = await client.get('/user/profile');
  return res.data;
}

export async function updateUserProfile(data) {
  const res = await client.put('/user/profile', data);
  return res.data;
}

export async function getHistory() {
  const res = await client.get('/history');
  return res.data;
}

export async function getTodayFoods() {
  const res = await client.get('/today');
  return res.data;
}
