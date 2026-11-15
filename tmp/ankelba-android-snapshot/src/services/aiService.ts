import { apiClient } from '../api/client';
import { AIGuideResponse } from '../types';

export const aiService = {
  async queryGuide(question: string, childId?: number): Promise<AIGuideResponse> {
    try {
      const response = await apiClient.post<AIGuideResponse>('/ai/guide/query', {
        question,
        child_id: childId,
      });
      return response.data;
    } catch {
      // Fallback Mock AI Response
      let answer = `Based on standard early childhood growth guidelines: a afternoon nap of 1.5 to 2 hours is very healthy for cognitive retention and mood regulation!`;
      if (question.includes('snack') || question.includes('Ethiopian')) {
        answer = `Nutritious daycare snack ideas include: roasted barley (Kolo), steamed sweet potatoes, avocado mash with injera strips, and fresh papaya cubes. These provide long-lasting energy for active play!`;
      } else if (question.includes('bilingual') || question.includes('Amharic')) {
        answer = `Bilingual language growth is enriched when parents speak Amharic at home while daycare reinforces English during group storytelling. Reading bilingual picture books before bedtime works wonders!`;
      }

      return {
        question,
        child_context: {
          name: 'Liya Hana',
          age_years: 4,
          group_name: 'Sunflower Group',
        },
        answer,
        disclaimer:
          'AI recommendations are for educational guidance only. Always consult medical professionals or lead daycare caregivers for health advice.',
        safety_redirected: false,
        is_medical_query: false,
      };
    }
  },
};
