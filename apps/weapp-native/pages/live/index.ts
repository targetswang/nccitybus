import { loadContent } from '../../services/content';
import { getTransit, track } from '../../services/api';
import { openTransitCode } from '../../services/transit';
function isPoint(p:any){return p?.crs==='GCJ02'&&Number.isFinite(p.lat)&&Number.isFinite(p.lng);}
Page({
  data:{catalog:null as any,snapshot:null as any,layer:'vehicles',layers:[{key:'vehicles',label:'车辆'},{key:'stations',label:'站点'},{key:'sights',label:'景点'},{key:'food',label:'美食'},{key:'shopping',label:'商业'}],mapLat:30.777329,mapLng:106.083909,markers:[] as any[],polyline:[] as any[],items:[] as any[],message:'正在读取公交信息',error:''},
  async onLoad(){await this.refresh();},async onPullDownRefresh(){await this.refresh();wx.stopPullDownRefresh();},
  async refresh(){this.setData({error:''});try{const [catalog,snapshot]=await Promise.all([loadContent(true),getTransit()]);this.setData({catalog,snapshot,message:this.message(snapshot)});this.build(this.data.layer);}catch(e:any){this.setData({error:e.message,message:'实时数据连接失败，请重试',markers:[],polyline:[],items:[]});}},
  message(s:any){if(!s)return'正在读取公交信息';if(s.integration?.state==='not_configured')return'实时公交接入中，暂不显示车辆和到站时间';if(['error','stopped'].includes(s.integration?.state))return'实时数据连接中断，仅保留最后有效信息';if(!s.routeVersion)return'尚未收到完整线路数据';if(s.freshness==='no_data')return'尚未收到车辆定位';if(s.freshness==='unavailable')return'定位已过期，暂不提供到站判断';if(s.freshness==='stale')return'定位数据延迟，请留意更新时间';return'车辆位置来自公交系统';},
  switchLayer(e:any){const layer=e.currentTarget.dataset.key;this.setData({layer});void track('map_layer_change',{page:'live',properties:{layer}});this.build(layer);},
  build(layer:string){const c:any=this.data.catalog,s:any=this.data.snapshot;const markers:any[]=[];const items:any[]=[];const polyline:any[]=[];for(const b of s?.route?.branches||[]){if(b.mapTrack?.length>=2)polyline.push({points:b.mapTrack.map((p:any)=>({latitude:p.lat,longitude:p.lng})),color:'#28745e',width:5});}
    if(layer==='vehicles'){for(const v of s?.vehicles||[]){items.push({id:v.id,name:v.label,subtitle:v.freshness});if(isPoint(v.mapPoint)&&v.freshness!=='unavailable')markers.push({id:markers.length+1,latitude:v.mapPoint.lat,longitude:v.mapPoint.lng,title:v.label,width:28,height:28});}}
    else if(layer==='stations'){for(const n of c?.nodes||[]){items.push({id:n.id,name:n.name,subtitle:n.persona});if(isPoint(n.mapPoint))markers.push({id:markers.length+1,latitude:n.mapPoint.lat,longitude:n.mapPoint.lng,title:n.name,width:26,height:26});}}
    else{const categories=layer==='sights'?['看什么']:layer==='food'?['吃什么','喝什么']:['玩什么','休息'];for(const p of c?.pois||[]){if(!categories.includes(p.category))continue;items.push({id:p.id,name:p.name,subtitle:p.subcategory});if(isPoint(p.mapPoint))markers.push({id:markers.length+1,latitude:p.mapPoint.lat,longitude:p.mapPoint.lng,title:p.name,width:26,height:26});}}
    const first=markers[0];this.setData({markers,polyline,items,...(first?{mapLat:first.latitude,mapLng:first.longitude}:{})});},
  stationsPage(){wx.navigateTo({url:'/pages/stations/index'});},transit(){void track('transit_code_open',{page:'live'});openTransitCode();},openItem(e:any){const id=e.currentTarget.dataset.id;if(this.data.layer==='stations')wx.navigateTo({url:`/pages/station/index?id=${encodeURIComponent(id)}`});else if(!['vehicles'].includes(this.data.layer))wx.navigateTo({url:`/pages/poi/index?id=${encodeURIComponent(id)}`});}
});
