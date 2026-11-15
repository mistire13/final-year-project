import { apiClient } from '../api/client';
import { Child, ChildSummary, GuardianLink } from '../types';

export const childrenService = {
  async getLinkedChildren(): Promise<ChildSummary[]> {
    try {
      const response = await apiClient.get<ChildSummary[]>('/children/linked');
      return response.data;
    } catch {
      // Fallback Mock Linked Children
      return [
        {
          id: 1,
          full_name: 'Liya Hana',
          dob: '2022-04-12',
          gender: 'female',
          enrollment_status: 'active',
          group_name: 'Sunflower Group',
          relationship: 'Mother',
        },
      ];
    }
  },

  async getChildDetails(childId: number): Promise<Child> {
    try {
      const response = await apiClient.get<Child>(`/children/${childId}`);
      return response.data;
    } catch {
      // Fallback Mock Child Details
      return {
        id: childId,
        full_name: 'Liya Hana',
        dob: '2022-04-12',
        gender: 'female',
        enrollment_status: 'active',
        group_id: 2,
        group_name: 'Sunflower Group',
        caregiver_id: 5,
        caregiver_name: 'Sara Mekonnen',
        emergency_contacts: [
          {
            id: 1,
            name: 'Solomon Haile',
            relationship: 'Uncle',
            phone: '+251 91 876 5432',
            is_primary: true,
          },
        ],
        care_instructions: [
          {
            id: 10,
            category: 'allergy',
            instruction_text: 'Mild Peanut Allergy — Keep epinephrine auto-injector in cubby',
            instruction_type: 'allergy',
            description: 'Mild Peanut Allergy — Keep epinephrine auto-injector in cubby',
            created_at: new Date().toISOString(),
          },
          {
            id: 11,
            category: 'general',
            instruction_text: 'Prefers quiet blanket for afternoon nap around 01:00 PM',
            instruction_type: 'general',
            description: 'Prefers quiet blanket for afternoon nap around 01:00 PM',
            created_at: new Date().toISOString(),
          },
        ],
        created_at: new Date().toISOString(),
      };
    }
  },

  async getGuardians(childId: number): Promise<GuardianLink[]> {
    try {
      const response = await apiClient.get<GuardianLink[]>(`/guardians/child/${childId}`);
      return response.data;
    } catch {
      // Fallback Mock Guardian Links
      return [
        {
          id: 1,
          child_id: childId,
          parent_user_id: 24,
          parent_name: 'Hana Tesfaye',
          parent_email: 'hana.tesfaye@example.com',
          parent_phone: '+251 91 123 4567',
          relationship: 'Mother',
          is_primary: true,
          can_pickup: true,
          biometric_enrolled: true,
          created_at: new Date().toISOString(),
        },
        {
          id: 2,
          child_id: childId,
          parent_user_id: 30,
          parent_name: 'Solomon Haile',
          parent_email: 'solomon@example.com',
          parent_phone: '+251 91 876 5432',
          relationship: 'Uncle',
          is_primary: false,
          can_pickup: true,
          biometric_enrolled: false,
          created_at: new Date().toISOString(),
        },
      ];
    }
  },
};
