'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('a realtime refresh during a send does not leave a delivered message in the composer', async () => {
  const slots=[]; let cursor=0, effects=[], listener, resolveSend;
  const same=(a,b)=>a && b && a.length===b.length && a.every((v,i)=>v===b[i]);
  const react={
    createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useRef(initial){const i=cursor++;return slots[i]||(slots[i]={current:initial});},
    useCallback(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={fn,deps};return slots[i].fn;},
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn();});}},
  }; react.default=react;
  const api={getDirectMessages:async()=>[],getCommunicationContacts:async()=>[],markMessageAsRead:async()=>{},sendDirectMessage:()=>new Promise(resolve=>{resolveSend=resolve;})};
  const source=fs.readFileSync(path.join(__dirname,'../src/screens/messages/CaregiverChatScreen.tsx'),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  const m={exports:{}};
  vm.runInNewContext(code,{module:m,exports:m.exports,Date,Promise,Number,Set,setTimeout,clearTimeout,require(name){
    if(name==='react')return react;
    if(name==='react-native')return {View:'View',TextInput:'TextInput',Pressable:'Pressable',Image:'Image',ActivityIndicator:'ActivityIndicator'};
    if(name.startsWith('phosphor-react-native'))return new Proxy({},{get:()=>()=>null});
    if(name.endsWith('/System'))return {Page:'Page',Text:'Text',Avatar:'Avatar',IconButton:'IconButton',Notice:'Notice',s:{row:{},inputWrap:{},input:{}}};
    if(name.endsWith('/assets'))return {artwork:{}};
    if(name.endsWith('/parentApi'))return api;
    if(name.endsWith('/AuthContext'))return {useAuth:()=>({user:{id:1},token:'token'})};
    if(name.endsWith('/useRealtime'))return {useRealtime:fn=>{listener=fn;}};
    if(name.endsWith('/realtime'))return {sendTyping:()=>{}};
    throw Error(`Unexpected import ${name}`);
  }});
  const props={navigation:{goBack(){}},route:{params:{recipientId:2,recipientName:'Caregiver'}}};
  function render(){cursor=0;effects=[];const tree=m.exports.CaregiverChatScreen(props);for(const effect of effects)effect();return tree;}
  function find(node,type,label){if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const item of node){const result=find(item,type,label);if(result)return result;}return null;}if(node.type===type && (!label||node.props?.accessibilityLabel===label))return node;for(const value of Object.values(node.props||{})){const result=find(value,type,label);if(result)return result;}return null;}
  render(); await Promise.resolve(); await Promise.resolve();
  let tree=render();find(tree,'TextInput','Message').props.onChangeText('Hello');
  tree=render();const sent=find(tree,'Pressable','Send message').props.onPress();
  listener({type:'message.changed',messageId:42,senderId:1,recipientId:2});
  await Promise.resolve();
  resolveSend({id:42,sender_id:1,recipient_id:2,body:'Hello',created_at:new Date().toISOString()});
  await sent; await Promise.resolve();
  tree=render();assert.equal(find(tree,'TextInput','Message').props.value,'');
});
