import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { Page, Text, Card, Avatar, Button, Field, Notice, s } from '../../components/design/System';
import { AnnouncementPreview } from '../../components/design/AnnouncementPreview';
import { useAnnouncementReads } from '../../hooks/useAnnouncementReads';
import { filterAnnouncements } from '../../utils/announcements';
import { colors } from '../../theme/tokens';
import { getDirectMessages, getAnnouncements, getCommunicationContacts, DirectMessage, DaycareAnnouncement, CommunicationContact } from '../../api/parentApi';

const tabs = ['Messages', 'Announcements', 'Meal Plans'] as const;
type Tab = typeof tabs[number];

export function MessagesScreen({ navigation, route }: any) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('Messages');
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [announcements, setAnnouncements] = useState<DaycareAnnouncement[]>([]);
  const [contacts, setContacts] = useState<CommunicationContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const revision = useRef(0);
  const { readIds, readError, refreshReads } = useAnnouncementReads(navigation);

  useEffect(() => {
    if (tabs.includes(route?.params?.tab)) setTab(route.params.tab);
  }, [route?.params?.tab]);

  const loadData = useCallback(async () => {
    const current = ++revision.current;
    setLoading(true); setLoadError('');
    try {
      const [msgData, annData, contactsData] = await Promise.all([
        getDirectMessages(), getAnnouncements(), getCommunicationContacts(),
      ]);
      if (current !== revision.current) return;
      setMessages(msgData); setAnnouncements(annData); setContacts(contactsData);
    } catch {
      if (current === revision.current) setLoadError('Updates could not be loaded. Please retry.');
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadData();
    const unsubscribe = navigation.addListener?.('focus', loadData);
    return () => { revision.current++; unsubscribe?.(); };
  }, [navigation, loadData]);

  const query = search.trim().toLocaleLowerCase();
  const threads = contacts.map(contact => {
    const thread = messages.filter(m => m.sender_id === contact.id || m.recipient_id === contact.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { contact, latest: thread[0], unread: thread.filter(m => !m.read_at && m.sender_id === contact.id).length };
  }).filter(({contact, latest}) => `${contact.name} ${contact.title || contact.role} ${latest?.body || ''}`.toLocaleLowerCase().includes(query));
  const visible = filterAnnouncements(announcements, search, tab === 'Meal Plans');
  const retry = () => { void loadData(); void refreshReads(); };
  const empty = <Card>
    <Text size={18} weight="semibold">{query ? 'No matches' : tab === 'Messages' ? 'No contacts yet' : tab === 'Meal Plans' ? 'No meal plans yet' : 'No announcements yet'}</Text>
    <Text color={colors.textSecondary} style={{ marginTop: 8 }}>
      {query ? 'Try a different search.' : tab === 'Messages' ? 'Contact your daycare administrator to connect with staff.' : tab === 'Meal Plans' ? 'Menus published by your daycare will appear here. Individual meals are recorded in daily reports.' : 'Updates published by your daycare will appear here.'}
    </Text>
    {query && <Button title="Clear search" variant="secondary" onPress={() => setSearch('')} style={{ marginTop: 16 }} />}
  </Card>;

  return <Page title="Messages">
    <Field label={tab === 'Messages' ? 'Search conversations' : 'Search announcements'} icon={MagnifyingGlass} placeholder="Search…" value={search} onChangeText={setSearch} />
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 20 }}>
      {tabs.map(t => <Pressable key={t} accessibilityRole="tab" accessibilityLabel={t}
        accessibilityState={{selected: tab === t}} aria-selected={tab === t} onPress={() => { setTab(t); setSearch(''); }}
        style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 16, backgroundColor: tab === t ? colors.bgNavy : colors.bgMuted }}>
        <Text size={13} weight="semibold" color={tab === t ? colors.textWhite : colors.textSecondary} style={{ textAlign: 'center' }}>{t}</Text>
      </Pressable>)}
    </View>
    {loading ? <View style={{ padding: 32, alignItems: 'center' }}><ActivityIndicator color={colors.textPrimary} /><Text color={colors.textSecondary} style={{ marginTop: 12 }}>Loading updates…</Text></View>
      : loadError ? <><Notice tone="error">{loadError}</Notice><Button title="Retry" onPress={retry} /></>
      : tab === 'Messages' ? threads.length ? threads.map(({contact, latest, unread}) => <Card key={contact.id} style={{ marginBottom: 14, padding: 18 }}
        onPress={() => navigation.navigate('CaregiverChat', { recipientId: contact.id, recipientName: contact.name, recipientRole: contact.role })}>
        <View style={[s.row, { alignItems: 'flex-start' }]}>
          <Avatar initials={contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()} size={48} />
          <View style={{ flex: 1 }}>
            <Text size={18} weight="semibold">{contact.name}</Text>
            <Text size={13} color={colors.textSecondary}>{contact.title || (contact.role === 'caregiver' ? 'Caregiver' : 'Daycare office')}</Text>
            <Text numberOfLines={2} color={colors.textSecondary} style={{ marginTop: 6 }}>{latest?.body || 'Start a conversation'}</Text>
            {latest && <Text size={13} color={colors.textSecondary} style={{ marginTop: 8 }}>{new Date(latest.created_at).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} · {new Date(latest.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</Text>}
          </View>
          {unread > 0 && <Text size={13} weight="bold" accessibilityLabel={`${unread} unread messages`}>{unread}</Text>}
        </View>
      </Card>) : empty : <>
        {readError && <><Notice tone="error">{readError}</Notice><Button title="Retry read status" variant="outline" onPress={() => { void refreshReads(); }} /></>}
        {visible.length ? visible.map(item => <AnnouncementPreview key={item.id} item={item} unread={readIds !== null && !readIds.includes(item.id)} onOpen={() => navigation.navigate('AnnouncementDetail', {announcementId: item.id})} />) : empty}
        {tab === 'Meal Plans' && <Button title="Ask the AI guide about dinner ideas" variant="outline" onPress={() => navigation.navigate('AIGuide', {initialPrompt: 'Can you suggest simple dinner ideas to complement my child’s daycare meals?'})} style={{ marginTop: 12 }} />}
      </>}
  </Page>;
}
