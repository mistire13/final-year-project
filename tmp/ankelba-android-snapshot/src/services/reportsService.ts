import { apiClient } from '../api/client';
import { DailyReport, AttendanceSummaryChild } from '../types';

export const reportsService = {
  async getReportsForChild(childId: number): Promise<DailyReport[]> {
    try {
      const response = await apiClient.get<DailyReport[]>(`/reports/child/${childId}`);
      return response.data;
    } catch {
      // Fallback Mock Daily Reports List
      return [
        {
          id: 1,
          child_id: childId,
          child_name: 'Liya Hana',
          caregiver_id: 5,
          caregiver_name: 'Sara Mekonnen',
          report_date: 'Today, Oct 14',
          mood: 'happy',
          sleep_duration_min: 105,
          activities_summary: 'Participated in group art storytelling and outdoor sandbox play.',
          general_notes: 'Liya was very cheerful and ate all her lunch.',
          submitted_at: '04:30 PM',
        },
        {
          id: 2,
          child_id: childId,
          child_name: 'Liya Hana',
          caregiver_id: 5,
          caregiver_name: 'Sara Mekonnen',
          report_date: 'Yesterday, Oct 13',
          mood: 'playful',
          sleep_duration_min: 90,
          activities_summary: 'Building blocks, Amharic nursery rhymes, and afternoon nap.',
          general_notes: 'Great interaction with peers during building blocks.',
          submitted_at: '04:30 PM',
        },
      ];
    }
  },

  async getReportDetails(reportId: number): Promise<DailyReport> {
    try {
      const response = await apiClient.get<DailyReport>(`/reports/${reportId}`);
      return response.data;
    } catch {
      // Fallback Mock Full Daily Report Payload
      return {
        id: reportId,
        child_id: 1,
        child_name: 'Liya Hana',
        caregiver_id: 5,
        caregiver_name: 'Sara Mekonnen',
        report_date: 'Wednesday, October 14, 2026',
        mood: 'happy',
        sleep_duration_min: 105,
        activities_summary: 'Group art, outdoor playground, and bilingual storytime.',
        general_notes:
          'Liya had a wonderful day! She completed her drawing exercise with great enthusiasm and shared her crayons with friends.',
        submitted_at: '04:30 PM',
      };
    }
  },

  async getAttendanceSummary(childId: number): Promise<AttendanceSummaryChild> {
    try {
      const response = await apiClient.get<AttendanceSummaryChild>(`/attendance/summary/child/${childId}`);
      return response.data;
    } catch {
      return {
        child_id: childId,
        child_name: 'Liya Hana',
        total_days_evaluated: 24,
        days_present: 22,
        days_absent: 2,
        attendance_rate_percent: 92,
        average_daily_stay_hours: 7.5,
      };
    }
  },
};
