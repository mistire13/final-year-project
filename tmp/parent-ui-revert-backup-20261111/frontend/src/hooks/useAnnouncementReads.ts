import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import { validReadAnnouncementIds } from '../utils/announcements';

export function useAnnouncementReads(navigation: any) {
  const [readIds, setReadIds] = useState<number[] | null>(null);
  const [readError, setReadError] = useState('');
  const [savingIds, setSavingIds] = useState<number[]>([]);
  const mounted = useRef(false);
  const revision = useRef(0);
  const refreshReads = useCallback(async () => {
    const request = ++revision.current;
    try {
      const {data} = await apiClient.get('/notifications/preferences');
      if (mounted.current && request === revision.current) { setReadIds(ids => [...new Set([...(ids || []), ...validReadAnnouncementIds(data.read_announcement_ids)])]); setReadError(''); }
    } catch {
      if (mounted.current && request === revision.current) setReadError('Read status could not be loaded. Refresh to retry.');
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refreshReads();
    const unsubscribe = navigation?.addListener?.('focus', refreshReads);
    return () => { mounted.current = false; revision.current++; unsubscribe?.(); };
  }, [navigation, refreshReads]);
  const markRead = useCallback(async (id: number) => {
    ++revision.current;
    if (mounted.current) setSavingIds(ids => [...ids, id]);
    try {
      const {data} = await apiClient.patch('/notifications/preferences', {read_announcement_id: id});
      if (mounted.current) { setReadIds(ids => [...new Set([...(ids || []), ...validReadAnnouncementIds(data.read_announcement_ids), id])]); setReadError(''); }
      return true;
    } catch {
      if (mounted.current) setReadError('The announcement could not be marked as read. Please retry.');
      return false;
    } finally {
      if (mounted.current) setSavingIds(ids => ids.filter(value => value !== id));
    }
  }, []);
  return { readIds, readError, markRead, refreshReads, savingIds };
}
