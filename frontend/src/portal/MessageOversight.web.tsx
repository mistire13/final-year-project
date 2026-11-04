import React, { useEffect, useState } from 'react';
import { portalClient, apiError } from './api';
import { Button, Card } from './ui.web';

export function MessageOversight() {
  const [search,setSearch]=useState('');
  const [offset,setOffset]=useState(0);
  const [result,setResult]=useState<{data:any[];total:number}>({data:[],total:0});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;
    setLoading(true);setError('');setResult({data:[],total:0});
    const timer=setTimeout(()=>{
      portalClient.get('/communication/messages/oversight',{params:{search,offset,limit:25}})
        .then(({data})=>{if(active)setResult(data);})
        .catch(error=>{if(active)setError(apiError(error));})
        .finally(()=>{if(active)setLoading(false);});
    },250);
    return()=>{active=false;clearTimeout(timer);};
  },[search,offset,revision]);
  return <Card title="Parent–caregiver message review">
    <p>Review daycare conversations for support and accountability. Review access is recorded in the audit history. Reading here does not mark a message as read by its recipient.</p>
    <label className="p-field">Search participant, subject or message
      <input value={search} maxLength={200} onChange={e=>{setSearch(e.target.value);setOffset(0);}} />
    </label>
    <Button variant="secondary" disabled={loading} onClick={()=>setRevision(n=>n+1)}>Refresh messages</Button>
    {loading ? <p role="status">Loading messages…</p> : error ? <p role="alert">{error} <Button onClick={()=>setRevision(n=>n+1)}>Retry</Button></p> : <>
      <p>{result.total} matching messages</p>
      {!result.data.length && <p>No parent–caregiver messages match this search.</p>}
      {result.data.map(message=><article className="p-attention" key={message.id}>
        <div>
          <strong>{message.sender_name} ({message.sender_role}) → {message.recipient_name} ({message.recipient_role})</strong>
          <p><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time> · {message.read_at?'Read by recipient':'Unread by recipient'}</p>
          {message.subject && <h3>{message.subject}</h3>}
          <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{message.body}</p>
        </div>
      </article>)}
      <div className="p-pagination">
        <Button variant="secondary" disabled={offset===0} onClick={()=>setOffset(n=>Math.max(0,n-25))}>Previous</Button>
        <span>Page {Math.floor(offset/25)+1}</span>
        <Button variant="secondary" disabled={offset+25>=result.total} onClick={()=>setOffset(n=>n+25)}>Next</Button>
      </div>
    </>}
  </Card>;
}
