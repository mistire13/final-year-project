'use strict';
/**
 * Seed 003 — Groups, Children, Emergency Contacts, Care Instructions, Guardian Links
 * SRS Refs: FR-CH-01–05
 */

exports.seed = async (knex) => {
  // Idempotent clean up in reverse foreign key dependency order
  await knex('guardian_verification_events').del().catch(() => {});
  await knex('report_activities').del().catch(() => {});
  await knex('report_meals').del().catch(() => {});
  await knex('daily_reports').del().catch(() => {});
  await knex('attendance').del().catch(() => {});
  await knex('health_records').del().catch(() => {});
  await knex('guardian_links').del().catch(() => {});
  await knex('care_instructions').del().catch(() => {});
  await knex('emergency_contacts').del().catch(() => {});
  await knex('children').del().catch(() => {});
  await knex('groups').del().catch(() => {});

  // Reset sequences if needed
  await knex.raw('ALTER SEQUENCE groups_id_seq RESTART WITH 1');
  await knex.raw('ALTER SEQUENCE children_id_seq RESTART WITH 1');

  // Insert Groups
  const [toddlersGroup, preKGroup] = await knex('groups')
    .insert([
      { name: 'Toddlers (1-2 yrs)', description: 'Nursery and early toddler care', daycare_id: 1 },
      { name: 'Pre-K (3-5 yrs)', description: 'Early learning and activity group', daycare_id: 1 },
    ])
    .returning(['id', 'name']);

  // Fetch caregiver and parent IDs
  const caregiver = await knex('users').where('email', 'caregiver@ankelba.dev').first();
  const parent = await knex('users').where('email', 'parent@ankelba.dev').first();
  const admin = await knex('users').where('email', 'admin@ankelba.dev').first();

  const caregiverId = caregiver ? caregiver.id : 2;
  const parentId = parent ? parent.id : 3;
  const adminId = admin ? admin.id : 1;

  // Insert Children
  const [child1, child2] = await knex('children')
    .insert([
      {
        full_name: 'Abebe Kebede',
        dob: '2024-03-15',
        gender: 'male',
        group_id: toddlersGroup.id,
        caregiver_id: caregiverId,
        enrollment_status: 'active',
        daycare_id: 1,
        monthly_care_fee: 3500.00,
      },
      {
        full_name: 'Sara Tadesse',
        dob: '2022-08-10',
        gender: 'female',
        group_id: preKGroup.id,
        caregiver_id: null,
        enrollment_status: 'active',
        daycare_id: 1,
        monthly_care_fee: 4000.00,
      },
    ])
    .returning(['id', 'full_name']);

  // Emergency Contacts
  await knex('emergency_contacts').insert([
    {
      child_id: child1.id,
      name: 'Tigist Kebede',
      relationship: 'Aunt',
      phone: '+251911223344',
    },
    {
      child_id: child2.id,
      name: 'Mulugeta Tadesse',
      relationship: 'Uncle',
      phone: '+251922334455',
    },
  ]);

  // Care Instructions (including peanut allergy for Abebe)
  await knex('care_instructions').insert([
    {
      child_id: child1.id,
      category: 'allergy',
      instruction_text: 'Severe peanut and tree nut allergy. Keep EpiPen in backpack.',
    },
    {
      child_id: child1.id,
      category: 'dietary',
      instruction_text: 'Lactose intolerant. Provide oat milk alternative during snacks.',
    },
    {
      child_id: child2.id,
      category: 'medical_note',
      instruction_text: 'Wears glasses for reading activities.',
    },
  ]);

  // Guardian Link (Test Parent -> Abebe Kebede)
  await knex('guardian_links').insert([
    {
      child_id: child1.id,
      user_id: parentId,
      relationship: 'Father',
      pickup_authorized: true,
      created_by: adminId,
    },
  ]);

  console.log('✅ Seed 003 completed: Groups, Children with care fees, Contacts, Instructions, Guardian Links.');
};
