import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { apiClient } from '../api/client';

export type ReminderEvent = { id: number; event_date: string; event_time?: string | null };
const TOKEN_KEY = 'ankelba_expo_push_token';
const REMINDER_PREFIX = 'ankelba-event-';
let remoteRegistered = false;
let registrationGeneration = 0;
let registration: Promise<void> | null = null;
let registrationIdentity: string | undefined;

Notifications.setNotificationHandler({ handleNotification: async () => ({
  shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
}) });

async function permission(ask: boolean): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', { name:'Messages', importance:Notifications.AndroidImportance.DEFAULT });
    await Notifications.setNotificationChannelAsync('activity', { name:'Daycare updates', importance:Notifications.AndroidImportance.DEFAULT });
    await Notifications.setNotificationChannelAsync('reminders', { name:'Event reminders', importance:Notifications.AndroidImportance.DEFAULT });
  }
  let result=await Notifications.getPermissionsAsync();
  if (!result.granted && ask && result.canAskAgain) result=await Notifications.requestPermissionsAsync();
  return result.granted;
}

export async function setupNotifications(askPermission=true, identity?:string): Promise<void> {
  if (registration && registrationIdentity === identity) return registration;
  const generation=++registrationGeneration;
  const previous=registration;
  registrationIdentity=identity;
  const current=(async()=>{
    if(previous) await previous;
    if(generation===registrationGeneration) await register(generation,askPermission);
  })();
  registration=current;
  try { await current; }
  finally { if(registration===current) { registration=null; registrationIdentity=undefined; } }
}

async function register(generation:number,askPermission:boolean): Promise<void> {
  remoteRegistered=false;
  try {
    if (!await permission(askPermission)) return;
    const projectId=Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId || generation!==registrationGeneration) return;
    const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
    if (generation!==registrationGeneration) return;
    const old=await SecureStore.getItemAsync(TOKEN_KEY);
    if (generation!==registrationGeneration) return;
    if (old && old!==token) await apiClient.delete('/notifications/devices',{data:{token:old}}).catch(()=>{});
    if (generation!==registrationGeneration) return;
    await apiClient.post('/notifications/devices',{token});
    await SecureStore.setItemAsync(TOKEN_KEY,token);
    remoteRegistered=generation===registrationGeneration;
  } catch { remoteRegistered=false; }
}

export async function unregisterNotifications(): Promise<void> {
  const generation=++registrationGeneration;
  const previous=registration;
  registrationIdentity=undefined;
  const current=(async()=>{
    if(previous) await previous;
    if(generation!==registrationGeneration) return;
    remoteRegistered=false;
    const token=await SecureStore.getItemAsync(TOKEN_KEY).catch(()=>null);
    if(generation!==registrationGeneration) return;
    if (token) {
      // Retain the token if offline, so the next signed-in registration can
      // transfer ownership or remove the previous token after rotation.
      const removed=await apiClient.delete('/notifications/devices',{data:{token}}).then(()=>true).catch(()=>false);
      if(removed) await SecureStore.deleteItemAsync(TOKEN_KEY).catch(()=>{});
    }
    await clearAccountReminders();
  })();
  registration=current;
  try { await current; }
  finally { if(registration===current) { registration=null; registrationIdentity=undefined; } }
}

export function subscribeNotificationResponses(onResponse:(data:Record<string,unknown>)=>void):()=>void {
  const subscription=Notifications.addNotificationResponseReceivedListener(response=>onResponse(response.notification.request.content.data ?? {}));
  void Notifications.getLastNotificationResponseAsync().then(response=>{
    if(response) { onResponse(response.notification.request.content.data ?? {}); void Notifications.clearLastNotificationResponseAsync(); }
  }).catch(()=>{});
  return ()=>subscription.remove();
}

export async function notifyIncomingMessage(kind:'message'|'health'='message'): Promise<void> {
  if (remoteRegistered || AppState.currentState !== 'active') return;
  try {
    const {data}=await apiClient.get('/notifications/preferences');
    const category=kind==='health'?'activity':'messages';
    if (data?.notifications?.[category]===false || !await permission(false)) return;
    await Notifications.scheduleNotificationAsync({
      content:{title:'Ankelba',body:kind==='health'?'Your daycare shared a health update.':'You have a new message.',data:{type:'message'},sound:'default'},
      trigger: Platform.OS==='android' ? {channelId:category,type:Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,seconds:1} : null,
    });
  } catch { /* Live in-app messaging remains available if alerts are disabled. */ }
}

function reminderId(eventId:number,userId:number,daycareId:number):string {
  return `${REMINDER_PREFIX}${daycareId}-${userId}-${eventId}`;
}

export async function scheduleEventReminder(event:ReminderEvent,userId:number,daycareId:number):Promise<void> {
  if (!await permission(true)) throw new Error('Allow notifications in Android settings to receive event reminders.');
  const day=String(event.event_date).slice(0,10);
  const time=event.event_time ? String(event.event_time).slice(0,5) : '09:00';
  const eventAt=new Date(`${day}T${time}:00+03:00`).getTime();
  if (!Number.isFinite(eventAt) || eventAt<=Date.now()) throw new Error('This event has already started or its time is unavailable.');
  const date=new Date(Math.max(Date.now()+5000,eventAt-60*60*1000));
  const identifier=reminderId(event.id,userId,daycareId);
  await Notifications.cancelScheduledNotificationAsync(identifier);
  await Notifications.scheduleNotificationAsync({ identifier,
    content:{title:'Ankelba event reminder',body:'An event is coming up. Open Ankelba for details.',data:{type:'event',eventId:event.id}},
    trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date,channelId:'reminders'},
  });
}

export async function cancelEventReminder(eventId:number,userId:number,daycareId:number):Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(reminderId(eventId,userId,daycareId));
}

export async function clearAccountReminders():Promise<void> {
  const scheduled=await Notifications.getAllScheduledNotificationsAsync().catch(()=>[]);
  await Promise.all(scheduled.filter(item=>item.identifier.startsWith(REMINDER_PREFIX))
    .map(item=>Notifications.cancelScheduledNotificationAsync(item.identifier)));
}
