'use strict';
/**
 * src/modules/ai-guide/ai-guide.service.js
 * Rule-governed AI Parent Guide Assistant with NVIDIA NIM integration.
 * SRS Refs: FR-AI-01–10 (Medical disclaimer, safety redirects, child context isolation, graceful degradation)
 */
const db = require('../../config/db');
const logger = require('../../config/logger');
const { isParentLinked } = require('../children/children.service');

const AI_DISCLAIMER = 'General informational guidance only. Not a substitute for professional medical, health, or psychological advice.';

const FORBIDDEN_MEDICAL_PATTERNS = [
  'fever', 'medicine', 'dosage', 'diagnose', 'prescription',
  'therapy', 'treatment', 'symptom', 'infection', 'rash',
  'disease', 'emergency', 'hospital', 'doctor', 'antibiotic'
];

const NVIDIA_PRIMARY_MODEL = process.env.NVIDIA_MODEL || 'meta/llama-3.2-11b-vision-instruct';
const NVIDIA_FALLBACK_MODEL = process.env.NVIDIA_FALLBACK_MODEL || 'meta/llama-3.2-90b-vision-instruct';
const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

/**
 * Fallback rule-based domain engine when offline or degrading gracefully (FR-AI-09).
 */
const generateRuleBasedAnswer = (questionText, childContext) => {
  const nameStr = childContext ? childContext.name : 'your child';
  const ageStr = childContext ? ` (${childContext.age_years} years old)` : '';

  if (/\b(count|counting|numbers?|math|numeracy)\b/.test(questionText)) {
    return `Try counting up to five large building blocks with ${nameStr}${ageStr}. Touch one block for each number, then ask how many are in the group. Let your child set the pace and stop when interest fades. Use age-appropriate objects and supervise play.`;
  }
  if (/weather|cloth|dress/.test(questionText)) {
    return `For changing weather, pack removable layers, a spare outfit and a labelled bag for wet clothes. Check the local forecast and your daycare's clothing guidance before leaving. This guide does not read live weather.`;
  }
  if (/pack|backpack|prep/.test(questionText)) {
    return `For daycare, prepare labelled spare clothes, a water bottle and any supplies requested by your center. Check the daycare's own list and the child's saved care instructions. Ask the office about items you are unsure of.`;
  }
  if (questionText.includes('routine') || questionText.includes('morning')) {
    return `For smooth morning routines with ${nameStr}${ageStr}, set out clothes the night before, use visual activity cards, and allow 15 minutes of buffer time before daycare drop-off.`;
  }
  if (questionText.includes('meal') || questionText.includes('food') || questionText.includes('snack')) {
    let allergyWarning = '';
    if (childContext && childContext.allergies && childContext.allergies.length > 0) {
      allergyWarning = ` (Allergy Notice: child has recorded allergies to: ${childContext.allergies.join(', ')}. Avoid these ingredients strictly). `;
    }
    return `Healthy daycare snack ideas for ${nameStr}${ageStr} include sliced banana with oat porridge, steamed carrots with hummus, or diced apple pieces.${allergyWarning}Always ensure snacks align with daycare center food guidelines.`;
  }
  if (questionText.includes('activity') || questionText.includes('play') || questionText.includes('learn')) {
    return `Engaging activities for ${nameStr}${ageStr} include sensory sorting games, building block towers, finger painting with non-toxic paints, and interactive storybook reading.`;
  }
  return 'This guide currently has prepared suggestions for counting, play, morning routines and snacks. Choose one of those topics or ask your daycare for help.';
};

/**
 * Call NVIDIA NIM Chat Completions API with child context and parenting persona.
 */
const callNvidiaNIM = async (question, childContext) => {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || apiKey.startsWith('placeholder')) {
    return null;
  }

  // System persona instructions strictly aligned with SRS FR-AI-01–06
  let systemPrompt = [
    'You are the Ankelba AI Parent Guide assistant, dedicated to supporting parents with children in daycare centers.',
    'Provide warm, practical, age-appropriate, encouraging parenting guidance regarding everyday daycare routines, gentle transitions, fun learning activities, nutritious snack ideas, outfit choices, and social-emotional growth.',
    'CRITICAL SAFETY RULES:',
    '- Never provide medical diagnoses, treatment instructions, or drug dosages. If a medical concern is mentioned, advise consulting a healthcare professional or daycare staff immediately.',
    '- Keep answers concise, clear, and well-structured with bullet points where appropriate (under 160 words).',
    '- Maintain a supportive, respectful, and family-centered tone.',
  ].join(' ');

  if (childContext) {
    let childInfo = `Context: The parent is inquiring about their child ${childContext.name}, who is ${childContext.age_years} years old`;
    if (childContext.group_name) {
      childInfo += ` and attends the "${childContext.group_name}" group`;
    }
    if (childContext.allergies && childContext.allergies.length > 0) {
      childInfo += `. ALLERGIES: ${childContext.allergies.join(', ')} (strictly avoid in any food ideas)`;
    }
    if (childContext.dietary && childContext.dietary.length > 0) {
      childInfo += `. Dietary preferences: ${childContext.dietary.join(', ')}`;
    }
    systemPrompt += `\n${childInfo}. Personalize your response gently using this context.`;
  }

  const modelsToTry = [NVIDIA_PRIMARY_MODEL];
  if (NVIDIA_FALLBACK_MODEL && NVIDIA_FALLBACK_MODEL !== NVIDIA_PRIMARY_MODEL) {
    modelsToTry.push(NVIDIA_FALLBACK_MODEL);
  }

  for (const model of modelsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question }
          ],
          max_tokens: 220,
          temperature: 0.6,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) {
          return {
            answer: content,
            model,
          };
        }
      } else {
        const errorText = await response.text().catch(() => '');
        logger.warn(`NVIDIA NIM returned status ${response.status} for model ${model}`, { errorText: errorText.slice(0, 150) });
      }
    } catch (err) {
      logger.warn(`NVIDIA NIM request failed for model ${model}`, { error: err.message });
      if (err.name === 'AbortError') {
        break; // Network latency exceeded timeout, proceed directly to prepared guidance
      }
    }
  }

  return null;
};

/**
 * Generate AI guidance response with strict safety governance, child context & NVIDIA NIM.
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

  // 3. Connect to NVIDIA NIM (SRS: FR-AI-01–04)
  const nvidiaResult = await callNvidiaNIM(body.question, childContext);
  if (nvidiaResult && nvidiaResult.answer) {
    return {
      source: 'nvidia_nim',
      model: nvidiaResult.model,
      provider_connected: true,
      question: body.question,
      child_context: childContext,
      answer: nvidiaResult.answer,
      disclaimer: AI_DISCLAIMER,
      safety_redirected: false,
    };
  }

  // 4. Graceful degradation: Fall back to rule-based domain guidance (FR-AI-09)
  const fallbackAnswer = generateRuleBasedAnswer(questionText, childContext);
  return {
    source: 'prepared_guidance',
    provider_connected: false,
    question: body.question,
    child_context: childContext,
    answer: fallbackAnswer,
    disclaimer: AI_DISCLAIMER,
    safety_redirected: false,
  };
};

module.exports = {
  getGuidance,
  callNvidiaNIM,
};
