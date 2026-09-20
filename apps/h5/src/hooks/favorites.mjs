import { React } from '../runtime.mjs';
import { decodeFavorites, encodeFavorites } from '../model.mjs';
const KEY='nc.favorites.v2';
export function readFavorites(){try{return decodeFavorites(localStorage.getItem(KEY)||localStorage.getItem('nc-tour-favorites'));}catch{return[];}}
export function useFavorites(visitor){
  const[local,setLocal]=React.useState(readFavorites),[error,setError]=React.useState(null);
  const ids=visitor?.session?(visitor.profile?.favorites||[]):local;
  const toggle=async id=>{setError(null);if(visitor?.session){try{await visitor.perform('favorite',{id,operation:ids.includes(id)?'remove':'add'});}catch(e){setError(e.message);}return;}const next=ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];try{localStorage.setItem(KEY,JSON.stringify(encodeFavorites(next)));setLocal(next);}catch{setError('当前浏览器不允许保存，请检查存储权限');}};
  return{ids,toggle,error};
}
