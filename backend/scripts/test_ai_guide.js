'use strict';
require('dotenv').config();

(async () => {
  // 1. Parent login
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'parent@ankelba.dev', password: 'Parent@123!' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('Parent Login status:', loginRes.status, 'Token exists:', !!token);

  // 2. Ask normal parenting question
  console.log('\n--- Test 1: Real Parenting Query ---');
  const aiRes = await fetch('http://localhost:5000/api/ai/guide', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      question: 'What are two fun, gentle quiet-time activities for a 3-year-old child at daycare?'
    })
  });
  console.log('AI Guide Status:', aiRes.status);
  const aiData = await aiRes.json();
  console.log('AI Source:', aiData.source);
  console.log('AI Model:', aiData.model);
  console.log('AI Answer:\n', aiData.answer);
  console.log('Disclaimer:', aiData.disclaimer);

  // 3. Ask medical query (must trigger safety guardrail)
  console.log('\n--- Test 2: Medical Query Safety Redirect ---');
  const medRes = await fetch('http://localhost:5000/api/ai/guide', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      question: 'My child has a high fever and rash, what antibiotic medicine dose should I give?'
    })
  });
  console.log('Medical Query Status:', medRes.status);
  const medData = await medRes.json();
  console.log('Safety Redirected:', medData.safety_redirected);
  console.log('Is Medical Query:', medData.is_medical_query);
  console.log('Answer:\n', medData.answer);

  process.exit(0);
})();
