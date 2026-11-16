'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {buildChatConversations}=require('../src/portal/chatThreads.ts');

const contacts=[
  {id:2,name:'Abel Parent',role:'parent'},
  {id:3,name:'Beth Parent',role:'parent'},
  {id:4,name:'New Parent',role:'parent'},
];
const messages=[
  {id:1,sender_id:2,recipient_id:1,body:'Morning question',created_at:'2027-01-04T08:00:00Z',read_at:null},
  {id:2,sender_id:1,recipient_id:2,body:'Morning answer',created_at:'2027-01-04T08:05:00Z',read_at:null},
  {id:3,sender_id:3,recipient_id:1,body:'Pickup update',created_at:'2027-01-04T09:00:00Z',read_at:'2027-01-04T09:01:00Z'},
  {id:4,sender_id:8,recipient_id:1,sender_name:'Unlisted Guardian',sender_role:'parent',body:'New conversation',created_at:'2027-01-04T10:00:00Z',read_at:null},
];

test('chat threads group by person, sort by latest activity, and count only incoming unread messages',()=>{
  const rows=buildChatConversations(1,contacts,messages,'');
  assert.deepEqual(rows.map(row=>row.id),[8,3,2,4]);
  assert.deepEqual(rows.find(row=>row.id===2).thread.map(message=>message.id),[1,2]);
  assert.equal(rows.find(row=>row.id===2).unread,1);
  assert.equal(rows.find(row=>row.id===8).name,'Unlisted Guardian');
  assert.equal(rows.find(row=>row.id===4).latest,undefined);
});

test('conversation search matches people and latest message text without mixing threads',()=>{
  assert.deepEqual(buildChatConversations(1,contacts,messages,'pickup').map(row=>row.id),[3]);
  assert.deepEqual(buildChatConversations(1,contacts,messages,'new parent').map(row=>row.id),[4]);
  assert.deepEqual(buildChatConversations(1,contacts,messages,'missing'),[]);
});

test('web chat includes split-pane desktop and single-pane mobile behavior',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../src/portal/portal.css'),'utf8');
  const component=fs.readFileSync(path.join(__dirname,'../src/portal/ChatInbox.web.tsx'),'utf8');
  assert.match(css,/\.p-chat-shell\s*\{[\s\S]*grid-template-columns/);
  assert.match(css,/@media \(max-width: 760px\)[\s\S]*\.p-chat-shell\.has-selection \.p-chat-sidebar/);
  assert.match(component,/aria-label="Back to conversations"/);
  assert.match(component,/\/communication\/messages\/\$\{message\.id\}\/read/);
});
