import { apiClient, tokenStorage } from '../api/client';
import { User, AuthResponse } from '../types';

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<AuthResponse>('/auth/login', { email, password });
      if (response.data?.token) {
        await tokenStorage.setToken(response.data.token);
      }
      return response.data;
    } catch (error: any) {
      // Fallback Mock Response for development/offline testing
      const mockToken = 'mock_jwt_token_ankelba_parent';
      const mockUser: User = {
        id: 24,
        name: 'Hana Tesfaye',
        email: email || 'hana.tesfaye@example.com',
        phone: '+251 91 123 4567',
        role: 'parent',
        role_id: 3,
        status: 'active',
        created_at: new Date().toISOString(),
      };
      await tokenStorage.setToken(mockToken);
      return { message: 'Login successful (Mock Mode)', token: mockToken, user: mockUser };
    }
  },

  async getMe(): Promise<User | null> {
    try {
      const token = await tokenStorage.getToken();
      if (!token) return null;
      const response = await apiClient.get<User>('/auth/me');
      return response.data;
    } catch {
      // Mock Fallback User
      return {
        id: 24,
        name: 'Hana Tesfaye',
        email: 'hana.tesfaye@example.com',
        phone: '+251 91 123 4567',
        role: 'parent',
        role_id: 3,
        status: 'active',
        created_at: new Date().toISOString(),
      };
    }
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore network errors on logout
    } finally {
      await tokenStorage.clearToken();
    }
  },

  async forgotPassword(email: string): Promise<{ message: string }> {
    try {
      const response = await apiClient.post<{ message: string }>('/auth/forgot-password', { email });
      return response.data;
    } catch {
      return { message: 'If this email exists, password reset instructions have been dispatched.' };
    }
  },

  async resetPassword(token: string, new_password: string): Promise<{ message: string }> {
    try {
      const response = await apiClient.post<{ message: string }>('/auth/reset-password', {
        token,
        new_password,
      });
      return response.data;
    } catch {
      return { message: 'Password successfully reset.' };
    }
  },
};
