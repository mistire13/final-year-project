import React from 'react';
import {Page,Card,Text,Button} from '../../components/design/System';
import {usePackageFeatures} from '../../context/PackageFeaturesContext';
export default function ShopAccess({children}:{children:React.ReactNode}){
  const {features,loading,error,refresh}=usePackageFeatures();
  if(loading)return <Page title="Daycare shop" back tabs><Card><Text>Checking shop availability…</Text></Card></Page>;
  if(error)return <Page title="Daycare shop" back tabs><Card><Text>{error}</Text><Button title="Retry" onPress={()=>void refresh()}/></Card></Page>;
  if(!features.shop)return <Page title="Daycare shop" back tabs><Card><Text weight="bold" size={21}>Shop unavailable</Text><Text>The shop is not available for this daycare. Your existing orders and receipts remain available in Order History.</Text></Card></Page>;
  return <>{children}</>;
}
