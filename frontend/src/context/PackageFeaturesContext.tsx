import React,{createContext,useCallback,useContext,useEffect,useState} from 'react';
import {AppState} from 'react-native';
import {apiClient} from '../api/client';
export type PackageFeatures={shop:boolean;business_analytics:boolean;billing_automation:boolean;staff_scheduling:boolean};
const none:PackageFeatures={shop:false,business_analytics:false,billing_automation:false,staff_scheduling:false};
const Context=createContext({features:none,loading:true,error:'',refresh:async()=>{}});
export function PackageFeaturesProvider({enabled,actorKey,children}:{enabled:boolean;actorKey:string;children:React.ReactNode}){
  const [features,setFeatures]=useState(none),[loading,setLoading]=useState(enabled),[error,setError]=useState('');
  const refresh=useCallback(async()=>{
    if(!enabled){setFeatures(none);setLoading(false);setError('');return;}
    setLoading(true);setError('');
    try{const {data}=await apiClient.get('/saas/features');setFeatures(Object.fromEntries(Object.keys(none).map(key=>[key,data.features?.[key]===true])) as PackageFeatures);}
    catch{setFeatures(none);setError('Could not check daycare features. Please retry.');}
    finally{setLoading(false);}
  },[enabled,actorKey]);
  useEffect(()=>{void refresh();const listener=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});return()=>listener.remove();},[refresh]);
  return <Context.Provider value={{features,loading,error,refresh}}>{children}</Context.Provider>;
}
export const usePackageFeatures=()=>useContext(Context);
