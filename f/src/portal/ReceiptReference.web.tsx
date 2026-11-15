import React, { useState } from 'react';
import { apiError, portalApi } from './api';

export default function ReceiptReference({ id, token, onReference }: { id: string; token: string; onReference: (value: string) => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [candidates, setCandidates] = useState<string[]>([]);
  const read = async (file?: File) => {
    if (!file) return;
    setMessage(''); setCandidates([]);
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 3 * 1024 * 1024) { setMessage('Choose a JPEG or PNG image under 3 MB.'); return; }
    setBusy(true);
    try {
      const result = await portalApi.extractReceiptReference(id, token, file);
      const found = Array.isArray(result.candidates) ? result.candidates.filter((value: unknown): value is string => typeof value === 'string') : [];
      setCandidates(found);
      if (found.length === 1) { onReference(found[0]); setMessage('Check the extracted reference carefully before verifying.'); }
      else if (!found.length) setMessage('No reference was recognized. You can enter it manually.');
      else setMessage('Choose the reference shown on your receipt, then check it before verifying.');
    } catch (error) { setMessage(`${apiError(error)} You can enter the reference manually.`); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <label>
        Receipt screenshot (optional)
        <input
          type="file"
          accept="image/jpeg,image/png"
          disabled={busy}
          onChange={event => {
            void read(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </label>
      {busy && <p role="status">Reading the screenshot…</p>}
      {message && <p role="status">{message}</p>}
      {candidates.length > 1 && (
        <label>
          Recognized references
          <select defaultValue="" onChange={event => onReference(event.target.value)}>
            <option value="">Select a reference</option>
            {candidates.map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="j-muted">
        Reading a screenshot only suggests a reference; the payment must still be verified.
      </p>
    </div>
  );
}
