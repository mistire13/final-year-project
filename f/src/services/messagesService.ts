import { apiClient } from '../api/client';
import { DirectMessage } from '../types';

export const messagesService = {
  async getThreadMessages(recipientId: number): Promise<DirectMessage[]> {
    try {
      const response = await apiClient.get<DirectMessage[]>(`/messages/thread/${recipientId}`);
      return response.data;
    } catch {
      // Fallback Mock Messages Thread
      return [
        {
          id: 1,
          thread_id: 1,
          sender_id: 5,
          sender_name: 'Sara Mekonnen',
          is_caregiver: true,
          content: 'Good morning Hana! Liya arrived safely and is happily playing with the art set.',
          created_at: '08:35 AM',
        },
        {
          id: 2,
          thread_id: 1,
          sender_id: 24,
          sender_name: 'Hana Tesfaye',
          is_caregiver: false,
          content: 'Thank you Sara! Please remind her to take her afternoon water bottle.',
          created_at: '08:40 AM',
        },
        {
          id: 3,
          thread_id: 1,
          sender_id: 5,
          sender_name: 'Sara Mekonnen',
          is_caregiver: true,
          content: 'Will do! She slept for 1 hour and 45 minutes during nap time today.',
          created_at: '02:15 PM',
        },
      ];
    }
  },

  async sendMessage(recipientId: number, body: string): Promise<DirectMessage> {
    try {
      const response = await apiClient.post<DirectMessage>('/messages', {
        recipient_id: recipientId,
        body,
      });
      return response.data;
    } catch {
      // Mock Sent Message Return
      return {
        id: Date.now(),
        thread_id: 1,
        sender_id: 24,
        sender_name: 'Hana Tesfaye',
        is_caregiver: false,
        content: body,
        created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    }
  },
};
