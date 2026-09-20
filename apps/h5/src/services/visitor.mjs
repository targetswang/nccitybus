import { React } from '../runtime.mjs';
import { request } from './api.mjs';
const KEY='nc.visitor.session.v1';
export function readVisitorSession(){try{const s=JSON.parse(sessionStorage.getItem(KEY)||'null');return s?.expiresAt>Date.now()&&typeof s.token==='string'&&s.token.length>=20&&s.user?.audience==='user'?s:null;}catch{return null;}}
export function useVisitor(){
  const [session,setSession]=React.useState(readVisitorSession),[profile,setProfile]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);const lock=React.useRef(false);
  const refresh=React.useCallback(async()=>{if(!session)return null;try{const p=await request('/me/query',{method:'POST',data:{_session:session.token}});setProfile(p);setError('');return p;}catch(e){setError(e.message);return null;}},[session]);
  React.useEffect(()=>{setProfile(null);if(session)void refresh();},[session,refresh]);
  const accept=value=>{if(value?.user?.audience!=='user'||typeof value.token!=='string'||value.token.length<20)throw new Error('此页面只接受游客会话');sessionStorage.setItem(KEY,JSON.stringify(value));setSession(value);};
  const perform=async(action,data={})=>{if(!session)throw new Error('请先登录');if(lock.current)throw new Error('上一项操作仍在处理中');lock.current=true;setBusy(true);setError('');try{const r=await request('/me/action',{method:'POST',data:{...data,action,_session:session.token}});await refresh();return r;}catch(e){setError(e.message);throw e;}finally{lock.current=false;setBusy(false);}};
  const logout=async()=>{setBusy(true);try{if(session)await request('/auth/logout',{method:'POST',data:{_session:session.token}});}finally{sessionStorage.removeItem(KEY);setSession(null);setProfile(null);setBusy(false);}};
  return {session,profile,error,busy,refresh,accept,perform,logout};
}

