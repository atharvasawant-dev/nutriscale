import React, { createContext, useContext, useEffect, useState } from 'react';

import { getToken, removeToken, saveToken } from '../utils/storage';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(null);

  useEffect(() => {
    let mounted = true;
    getToken()
      .then((token) => {
        if (mounted) setIsLoggedIn(!!token);
      })
      .catch((_e) => {
        if (mounted) setIsLoggedIn(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (token) => {
    await saveToken(token);
    setIsLoggedIn(true);
  };

  const logout = async () => {
    try {
      await removeToken();
    } catch (_e) {
      // ignore
    }
    setIsLoggedIn(false);
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
