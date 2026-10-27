'use strict';
/**
 * src/modules/ai-guide/ai-guide.service.js
 * Rule-governed AI Parent Guide Assistant.
 * SRS Refs: FR-AI-01–10 (Medical disclaimer, safety redirects, child context isolation)
 */
const db = require('../../config/db');
const { isParentLinked } = require('../children/children.service');

const AI_DISCLAIMER = 'General informational guidance only. Not a substitute for professional medical, health, or psychological advice.';

const FORBIDDEN_MEDICAL_PATTERNS = [
  'fever', 'medicine', 'dosage', 'diagnose', 'prescription',
  'therapy', 'treatment', 'symptom', 'infection', 'rash',
  'disease', 'emergency', 'hospital', 'doctor', 'antibiotic'
];

/**
 * Generate AI guidance response with strict safety governance & domain rules.
 */
const getGuidance = async (body, user) => {
  const questionText = body.question ? body.question.toLowerCase() : '';

  // 1. Safety Guardrail: Block medical/emergency diagnosis attempts (FR-AI-05)
  const containsMedical = FORBIDDEN_MEDICAL_PATTERNS.some(pattern => questionText.includes(pattern));
  if (containsMedical) {
    return {
      question: body.question,
      answer: 'I am an AI Parenting Guide assistant designed for general daycare routines, meal ideas, and age-appropriate activities. I cannot provide medical diagnosis, dosage advice, or healthcare treatments. If your child is experiencing medical symptoms, fever, or illness, please consult a qualified healthcare professional or daycare staff immediately.',
      disclaimer: AI_DISCLAIMER,
      safety_redirected: true,
      is_medical_query: true,
    };
  }

  // 2. Child context lookup if child_id provided (FR-AI-04, FR-AI-07)
  let childContext = null;
  if (body.child_id) {
    const childId = parseInt(body.child_id, 10);
    const linked = await isParentLinked(user.id, childId);
    if (linked) {
      const { rows } = await db.query(
        `SELECT c.full_name, c.dob, g.name AS group_name
         FROM children c
         LEFT JOIN groups g ON g.id = c.group_id
         WHERE c.id = $1`,
        [childId]
      );
      if (rows.length > 0) {
        const c = rows[0];
        const ageYears = Math.floor((new Date() - new Date(c.dob)) / (1000 * 60 * 60 * 24 * 365.25));

        // Retrieve allergies and dietary restrictions from child's care profile (SRS: FR-AI-04, FR-CH-03)
        const careRes = await db.query(
          `SELECT category, instruction_text FROM care_instructions WHERE child_id = $1 AND category IN ('allergy', 'dietary')`,
          [childId]
        );
        const allergies = careRes.rows.filter(r => r.category === 'allergy').map(r => r.instruction_text);
        const dietary = careRes.rows.filter(r => r.category === 'dietary').map(r => r.instruction_text);

        childContext = {
          name: c.full_name.split(' ')[0],
          age_years: ageYears,
          group_name: c.group_name,
          allergies,
          dietary,
        };
      }
    }
  }

  // 3. Formulate domain-specific parenting response (FR-AI-03)
  const nameStr = childContext ? childContext.name : 'your child';
  const ageStr = childContext ? ` (${childContext.age_years} years old)` : '';

  let answer = '';
  if (/\b(count|counting|numbers?|math|numeracy)\b/.test(questionText)) {
    answer = `Try counting up to five large building blocks with ${nameStr}${ageStr}. Touch one block for each number, then ask how many are in the group. Let your child set the pace and stop when interest fades. Use age-appropriate objects and supervise play.`;
  } else if (/weather|cloth|dress/.test(questionText)) {
    answer = `For changing weather, pack removable layers, a spare outfit and a labelled bag for wet clothes. Check the local forecast and your daycare's clothing guidance before leaving. This guide does not read live weather.`;
  } else if (/pack|backpack|prep/.test(questionText)) {
    answer = `For daycare, prepare labelled spare clothes, a water bottle and any supplies requested by your center. Check the daycare's own list and the child's saved care instructions. Ask the office about items you are unsure of.`;
  } else if (questionText.includes('routine') || questionText.includes('morning')) {
    answer = `For smooth morning routines with ${nameStr}${ageStr}, set out clothes the night before, use visual activity cards, and allow 15 minutes of buffer time before daycare drop-off.`;
  } else if (questionText.includes('meal') || questionText.includes('food') || questionText.includes('snack')) {
    let allergyWarning = '';
    if (childContext && childContext.allergies && childContext.allergies.length > 0) {
      allergyWarning = ` (Allergy Notice: child has recorded allergies to: ${childContext.allergies.join(', ')}. Avoid these ingredients strictly). `;
    }
    answer = `Healthy daycare snack ideas for ${nameStr}${ageStr} include sliced banana with oat porridge, steamed carrots with hummus, or diced apple pieces.${allergyWarning}Always ensure snacks align with daycare center food guidelines.`;
  } else if (questionText.includes('activity') || questionText.includes('play') || questionText.includes('learn')) {
    answer = `Engaging activities for ${nameStr}${ageStr} include sensory sorting games, building block towers, finger painting with non-toxic paints, and interactive storybook reading.`;
  } else {
    answer = 'This guide currently has prepared suggestions for counting, play, morning routines and snacks. I do not have a specific answer for that question. Choose one of those topics or ask your daycare for help.';
  }

  return {
    source: 'prepared_guidance',
    provider_connected: false,
    question: body.question,
    child_context: childContext,
    answer,
    disclaimer: AI_DISCLAIMER,
    safety_redirected: false,
  };
};

module.exports = {
  getGuidance,
};
