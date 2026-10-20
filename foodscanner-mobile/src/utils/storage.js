import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'foodscanner_token';

export async function saveToken(token) {
  if (!token) return;
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch (_e) {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(TOKEN_KEY, token);
      } catch (_err) {
        // ignore
      }
    }
  }
}

export async function getToken() {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) return token;
  } catch (_e) {
    // fallback to localStorage
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch (_err) {
      return null;
    }
  }
  return null;
}

export async function removeToken() {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch (_e) {
    // fallback to localStorage
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch (_err) {
      // ignore
    }
  }
}
