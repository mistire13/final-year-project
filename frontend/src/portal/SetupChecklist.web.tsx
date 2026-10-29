import React, { useState } from 'react';
import type { Dataset } from './model';
import './journey.css';

export default function SetupChecklist({ data }: { data: Dataset }) {
  const [collapsed, setCollapsed] = useState(false);
  const active = (data.children || []).filter((c) => c.enrollment_status === 'active');
  const activeDuties = (data.duties || []).filter((d) => d.status !== 'revoked' && d.active !== false);
  const hasAttendanceDuty = activeDuties.some((d) => d.can_attendance);
  const hasPickupDuty = activeDuties.some((d) => d.can_pickup);
  const dutiesConfigured = activeDuties.length > 0 && (hasAttendanceDuty || hasPickupDuty);

  const steps = [
    {
      title: 'Confirm your center details',
      hint: 'Add the contact phone and address families will use.',
      done: !!(data.daycare?.contact_phone && data.daycare?.address),
      path: 'settings',
    },
    {
      title: 'Create your classrooms',
      hint: 'Organize children into the groups your team manages.',
      done: (data.groups || []).length > 0,
      path: 'groups',
    },
    {
      title: 'Add your caregivers',
      hint: 'Create named staff accounts for attributable care records.',
      done: (data.users || []).some((u) => u.role === 'caregiver' && u.status === 'active'),
      path: 'caregivers',
    },
    {
      title: 'Enroll children and link their families',
      hint: 'Each active child needs an enrolled profile and linked family.',
      done: active.length > 0 && active.every((c) => (data.guardians || []).some((g) => g.child_id === c.id)),
      path: 'children',
    },
    {
      title: 'Assign children to classrooms and caregivers',
      hint: 'Assignments determine which children staff can care for.',
      done: active.length > 0 && active.every((c) => c.group_id && c.caregiver_id),
      path: 'children',
    },
    {
      title: 'Schedule attendance and pickup duty',
      hint: 'Assign staff to front-desk check-in or pickup coverage.',
      done: dutiesConfigured,
      path: 'front-desk',
    },
  ];

  const count = steps.filter((s) => s.done).length;
  const allDone = count === steps.length;

  if (collapsed && allDone) {
    return (
      <section
        className="journey j-panel"
        style={{
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#F0FDF4',
          borderColor: '#BBF7D0',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#166534', fontSize: 18, fontWeight: 700 }}>✓</span>
          <strong style={{ color: '#166534', fontSize: 14 }}>
            Center Setup Complete ({count}/{steps.length} milestones verified)
          </strong>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#008794',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          View Checklist
        </button>
      </section>
    );
  }

  return (
    <section className="journey j-panel" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="j-tag">YOUR CENTER SETUP · {count} OF {steps.length}</span>
        {allDone && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748B',
              fontSize: 12,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Collapse Checklist
          </button>
        )}
      </div>
      <h2>{allDone ? 'Your center is fully set up and ready for care.' : 'Prepare your center for its first day.'}</h2>
      <p style={{ margin: '4px 0 12px' }}>
        {allDone
          ? 'All core records, classrooms, caregiver assignments and front-desk shifts are on file.'
          : 'Progress comes from saved records. You can leave and return without losing completed setup.'}
      </p>
      <progress
        aria-label="Daycare setup progress"
        value={count}
        max={steps.length}
        style={{ width: '100%', height: 8, accentColor: '#417b61', borderRadius: 4 }}
      />
      <ol className="j-checklist" style={{ marginTop: 14 }}>
        {steps.map((s) => (
          <li key={s.path + s.title}>
            <a href={'/admin/' + s.path} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <strong>{s.title}</strong>
                <small>{s.hint}</small>
              </span>
              <span
                style={{
                  color: s.done ? '#166534' : '#008794',
                  fontWeight: 700,
                  fontSize: 12.5,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: s.done ? '#DCFCE7' : '#F0FDFA',
                }}
              >
                {s.done ? 'Complete ✓' : 'Continue →'}
              </span>
            </a>
          </li>
        ))}
      </ol>
      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a href="/admin/attendance" style={{ fontWeight: 600, color: 'var(--navy)', fontSize: 13 }}>
          Open today’s attendance and pickups →
        </a>
      </div>
    </section>
  );
}
