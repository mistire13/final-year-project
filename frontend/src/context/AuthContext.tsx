import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { Platform } from "react-native";
import { apiClient, tokenStorage, onSessionExpired } from "../api/client";
import { User, AuthResponse, UserProfileMe } from "../types";

interface AuthContextType {
  user: UserProfileMe | null;
  token: string | null;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string; role?: string; profileComplete?: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  enablePreview: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to extract detailed error messages from backend response
const extractErrorMessage = (err: any): string => {
  if (err.response?.data?.fields && Array.isArray(err.response.data.fields) && err.response.data.fields.length > 0) {
    return err.response.data.fields.map((f: any) => f.message).join(". ");
  }
  return (
    err.response?.data?.error ||
    err.response?.data?.message ||
    err.message ||
    "Invalid credentials or connection error"
  );
};

// Default mock parent for development preview matching Figma ("Hana Tesfaye")
export const DEFAULT_PREVIEW_USER: UserProfileMe = {
  id: 24,
  name: "Hana Tesfaye",
  email: "hana.tesfaye@example.com",
  phone: "+251 91 123 4567",
  role: "parent",
  role_id: 3,
  status: "active",
  created_at: "2026-08-15T08:30:00.000Z",
  linked_children: [
    {
      id: 1,
      full_name: "Liya Hana",
      dob: "2022-05-12",
      gender: "female",
      enrollment_status: "active",
      relationship: "Mother",
      group_name: "Sunflower Group",
    },
  ],
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<UserProfileMe | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const generation = useRef(0);

  useEffect(() => onSessionExpired(() => {
    generation.current++;
    setToken(null);
    setUser(null);
    setIsLoading(false);
  }), []);

  const refreshUser = async () => {
    const requestGeneration = generation.current;
    try {
      const response = await apiClient.get<{ user: UserProfileMe }>("/auth/me");
      if (requestGeneration !== generation.current) return;
      if (response.data?.user) {
        setUser(response.data.user);
      }
    } catch {
      if (requestGeneration !== generation.current) return;
      await tokenStorage.clearToken();
      setToken(null);
      setUser(null);
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      const requestGeneration = generation.current;
      try {
        const savedToken = await tokenStorage.getToken();
        if (requestGeneration !== generation.current) return;
        if (savedToken) {
          setToken(savedToken);
          const response = await apiClient.get<{ user: UserProfileMe }>("/auth/me");
          if (requestGeneration !== generation.current) return;
          if (response.data?.user) {
            const fetchedUser = response.data.user;
            if (fetchedUser.role === "super_admin") {
              if (Platform.OS === "web" && typeof window !== "undefined") {
                if (!window.localStorage.getItem("ankelba_operator_token")) {
                  window.localStorage.setItem("ankelba_operator_token", savedToken);
                }
              }
              await tokenStorage.clearToken();
              setToken(null);
              setUser(null);
            } else if (fetchedUser.role !== "parent" && Platform.OS === "web") {
              if (typeof window !== "undefined") {
                if (!window.localStorage.getItem("ankelba_portal_token")) {
                  window.localStorage.setItem("ankelba_portal_token", savedToken);
                }
              }
              await tokenStorage.clearToken();
              setToken(null);
              setUser(null);
            } else {
              setUser(fetchedUser);
            }
          } else {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } catch (err) {
        if (requestGeneration !== generation.current) return;
        console.warn("Auth initialization failed", err);
        await tokenStorage.clearToken();
        setToken(null);
        setUser(null);
      } finally {
        if (requestGeneration === generation.current) setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const requestGeneration = ++generation.current;
    setIsLoading(true);
    try {
      const response = await apiClient.post<AuthResponse>("/auth/login", {
        email,
        password,
      });
      const { token: receivedToken, user: receivedUser } = response.data;
      if (requestGeneration !== generation.current) return { success: false, error: "Sign-in was cancelled." };

      if (receivedUser.role === "super_admin") {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.localStorage.setItem("ankelba_operator_token", receivedToken);
        }
        await tokenStorage.clearToken();
        setIsLoading(false);
        return {
          success: true,
          role: receivedUser.role,
          profileComplete: (receivedUser as UserProfileMe).profile_complete,
        };
      }

      if (Platform.OS === "web" && (receivedUser.role === "admin" || receivedUser.role === "caregiver")) {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("ankelba_portal_token", receivedToken);
        }
        await tokenStorage.clearToken();
        setIsLoading(false);
        return {
          success: true,
          role: receivedUser.role,
          profileComplete: (receivedUser as UserProfileMe).profile_complete,
        };
      }

      await tokenStorage.setToken(receivedToken);
      if (requestGeneration !== generation.current) return { success: false, error: "Sign-in was cancelled." };
      setToken(receivedToken);
      setUser(receivedUser as UserProfileMe);
      setIsLoading(false);
      return {
        success: true,
        role: receivedUser.role,
        profileComplete: (receivedUser as UserProfileMe).profile_complete,
      };
    } catch (err: any) {
      if (requestGeneration !== generation.current) return { success: false, error: "Sign-in was cancelled." };
      setIsLoading(false);
      const errorMsg = extractErrorMessage(err);
      return { success: false, error: errorMsg };
    }
  };

  const logout = async () => {
    const requestGeneration = ++generation.current;
    setIsLoading(true);
    try {
      await apiClient.post("/auth/logout").catch(() => {});
    } finally {
      if (requestGeneration !== generation.current) return;
      await tokenStorage.clearToken();
      setToken(null);
      setUser(null);
      setIsLoading(false);
    }
  };

  const enablePreview = () => {
    if (!__DEV__) return;
    generation.current++;
    setUser(DEFAULT_PREVIEW_USER);
  };

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, logout, refreshUser, enablePreview }}
    >
      <React.Fragment key={user ? `${user.id}:${user.daycare_id}:${user.role}` : "signed-out"}>
        {children}
      </React.Fragment>
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
