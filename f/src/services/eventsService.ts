import { apiClient } from '../api/client';
import { CenterEvent } from '../types';

export const eventsService = {
  async getEvents(): Promise<CenterEvent[]> {
    try {
      const response = await apiClient.get<CenterEvent[]>('/events');
      return response.data;
    } catch {
      // Fallback Mock Events
      return [
        {
          id: 1,
          title: 'Annual Sunflower Cultural Parade & Picnic',
          description: 'Children costume parade and family outdoor picnic lunch.',
          event_date: '2026-10-15',
          start_time: '09:00 AM',
          end_time: '01:00 PM',
          location: 'Main Daycare Playground & Courtyard',
          is_cancelled: false,
          created_at: new Date().toISOString(),
        },
        {
          id: 2,
          title: 'Parent-Teacher Progress Meeting',
          description: 'Individual 15-minute consultations regarding child developmental progress.',
          event_date: '2026-10-22',
          start_time: '02:00 PM',
          end_time: '05:00 PM',
          location: 'Conference Room 2',
          is_cancelled: false,
          created_at: new Date().toISOString(),
        },
        {
          id: 3,
          title: 'National Holiday (Daycare Closed)',
          description: 'Daycare facility closed for national holiday observed.',
          event_date: '2026-10-28',
          start_time: 'All Day',
          end_time: 'All Day',
          location: 'Daycare Facility Closed',
          is_cancelled: false,
          created_at: new Date().toISOString(),
        },
      ];
    }
  },
};
