import React from 'react';
import type { Dataset } from './model';
import './journey.css';

export interface SetupStep {
  title: string;
  hint: string;
  done: boolean;
  available: boolean;
  path: string;
}

/** Derives center setup progress directly from live daycare records (SRS FR-SUB-08). */
export function getSetupSteps(data: Dataset): SetupStep[] {
  const active = (data.children || []).filter((c) => c.enrollment_status === 'active');
  const activeDuties = (data.duties || []).filter((d) => d.status !== 'revoked' && d.active !== false);
  const hasAttendanceDuty = activeDuties.some((d) => d.can_attendance);
  const hasPickupDuty = activeDuties.some((d) => d.can_pickup);
  const dutiesConfigured = activeDuties.length > 0 && (hasAttendanceDuty || hasPickupDuty);
  const centerConfigured = !!(data.daycare?.contact_phone && data.daycare?.address);
  const activeCaregivers = (data.users || []).filter((u) => u.role === 'caregiver' && u.status === 'active');
  const caregiversConfigured = activeCaregivers.length > 0;
  const caregiverIds = new Set(activeCaregivers.map((caregiver) => Number(caregiver.id)));
  const classroomsConfigured = (data.groups || []).length > 0
    && (data.groups || []).every((group) => caregiverIds.has(Number(group.lead_caregiver_id)));
  const familiesConfigured = active.length > 0
    && active.every((child) => (data.guardians || []).some((guardian) => guardian.child_id === child.id));
  const assignmentsConfigured = active.length > 0
    && active.every((child) => child.group_id && child.caregiver_id);

  return [
    {
      title: 'Confirm your center details',
      hint: 'Add your phone and address.',
      done: centerConfigured,
      available: true,
      path: 'settings',
    },
    {
      title: 'Add your caregivers',
      hint: 'Create active staff accounts.',
      done: caregiversConfigured,
      available: true,
      path: 'caregivers',
    },
    {
      title: 'Create classrooms and assign leads',
      hint: 'Choose an active caregiver for every classroom.',
      done: classroomsConfigured,
      available: caregiversConfigured,
      path: 'groups',
    },
    {
      title: 'Enroll children and link their families',
      hint: 'Add each child with a linked guardian.',
      done: familiesConfigured,
      available: classroomsConfigured,
      path: 'children',
    },
    {
      title: 'Assign children to classrooms and caregivers',
      hint: 'Check every active child’s assignment.',
      done: assignmentsConfigured,
      available: familiesConfigured,
      path: 'children',
    },
    {
      title: 'Schedule attendance and pickup duty',
      hint: 'Assign check-in and pickup coverage.',
      done: dutiesConfigured,
      available: assignmentsConfigured,
      path: 'front-desk',
    },
  ];
}

export default function SetupChecklist({ data }: { data: Dataset }) {
  const steps = getSetupSteps(data);
  const count = steps.filter((s) => s.done).length;
  // Hide the onboarding checklist automatically once all center setup milestones are satisfied.
  if (count === steps.length) return null;

  return (
    <section className="journey j-panel" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <h2>Center setup</h2>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--muted)' }}>{count} of {steps.length} complete</span>
      </div>
      <progress
        aria-label="Daycare setup progress"
        value={count}
        max={steps.length}
        style={{ width: '100%', height: 8, accentColor: '#417b61', borderRadius: 4 }}
      />
      <ol className="j-checklist" style={{ marginTop: 14 }}>
        {steps.map((s) => {
          const content = (
            <>
              <span>
                <strong>{s.title}</strong>
                <small>{s.hint}</small>
              </span>
              <span className="j-checklist-action">
                {s.done ? 'Complete' : s.available ? 'Continue →' : 'Next'}
              </span>
            </>
          );
          return (
            <li key={s.path + s.title}>
              {s.done || s.available ? (
                <a href={'/admin/' + s.path} className={s.done ? 'is-complete' : undefined}>{content}</a>
              ) : (
                <div className="j-checklist-row is-locked" aria-disabled="true">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a href="/admin/attendance" style={{ fontWeight: 600, color: 'var(--navy)', fontSize: 13 }}>
          Open today’s attendance and pickups →
        </a>
      </div>
    </section>
  );
}
