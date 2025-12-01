import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type PatreonTier = 'free' | 'premium' | 'ultimate';

interface PatreonUser {
  id: string;
  name: string;
  email: string;
  tier: PatreonTier;
  avatar?: string;
}

interface PatreonContextType {
  user: PatreonUser | null;
  isAuthenticated: boolean;
  deviceLimit: number;
  login: () => void;
  logout: () => void;
}

const DEVICE_LIMITS = {
  free: 5,
  premium: 25,
  ultimate: 250,
};

const PatreonContext = createContext<PatreonContextType | undefined>(undefined);

export function PatreonProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PatreonUser | null>(null);

  // Load user from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('patreon_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (error) {
        console.error('Failed to parse saved user:', error);
        localStorage.removeItem('patreon_user');
      }
    }
  }, []);

  const login = () => {
    // TODO: Implement Patreon OAuth flow
    // For now, simulate login with a free tier user
    const mockUser: PatreonUser = {
      id: 'mock_user',
      name: 'Free User',
      email: 'user@example.com',
      tier: 'free',
    };
    setUser(mockUser);
    localStorage.setItem('patreon_user', JSON.stringify(mockUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('patreon_user');
  };

  const deviceLimit = user ? DEVICE_LIMITS[user.tier] : DEVICE_LIMITS.free;

  return (
    <PatreonContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        deviceLimit,
        login,
        logout,
      }}
    >
      {children}
    </PatreonContext.Provider>
  );
}

export function usePatreon() {
  const context = useContext(PatreonContext);
  if (!context) {
    throw new Error('usePatreon must be used within PatreonProvider');
  }
  return context;
}
