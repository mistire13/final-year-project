import type { CareInstructionInput } from '../api/parentApi';

// Keep opaque instructions from every other section byte-for-byte. The server
// still checks the supplied version and owns pickup/classroom permissions.
export function replaceCareSection(step: number, saved: CareInstructionInput[], edited: CareInstructionInput[]) {
  const categories = step === 2 ? ['allergy', 'diet', 'dietary'] : step === 3 ? ['medical_note', 'medication'] : step === 5 ? ['general', 'routine', 'note'] : [];
  return [...saved.filter(row => !categories.includes(row.category)), ...edited.filter(row => categories.includes(row.category))];
}
