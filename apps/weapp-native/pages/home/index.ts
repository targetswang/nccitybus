import { loadContent } from '../../services/content';
import { openTransitCode } from '../../services/transit';
import { track } from '../../services/api';
Page({
  data:{catalog:null as any,mode:'walks',walks:[] as any[],pois:[] as any[],error:'',loading:true},
  async onLoad(){await this.refresh();},
  async onPullDownRefresh(){await this.refresh(true);wx.stopPullDownRefresh();},
  async refresh(force=false){this.setData({loading:true,error:''});try{const c=await loadContent(force);const ids=c.home?.featuredWalkIds||[];this.setData({catalog:c,walks:(ids.length?c.walks.filter((w:any)=>ids.includes(w.id)):c.walks).slice(0,4),pois:(c.pois||[]).slice(0,5)});void track('page_view',{page:'home',contentVersion:c.version});}catch(e:any){this.setData({error:e.message});}finally{this.setData({loading:false});}},
  transit(){void track('transit_code_open',{page:'home'});openTransitCode();},live(){wx.reLaunch({url:'/pages/live/index'});},guide(){wx.navigateTo({url:'/pages/guide/index'});},route(){wx.navigateTo({url:'/pages/route/index'});},explore(){wx.reLaunch({url:'/pages/explore/index'});},switchMode(e:any){this.setData({mode:e.currentTarget.dataset.mode});},banner(e:any){const b=e.currentTarget.dataset.banner;void track('banner_click',{page:'home',objectType:'banner',objectId:b.id,contentVersion:this.data.catalog?.version,properties:{targetType:b.targetType}});const map:any={event:'/pages/events/index',walk:'/pages/walk/index',poi:'/pages/poi/index',station:'/pages/station/index',benefit:'/pages/rights/index',guide:'/pages/guide/index'};const base=map[b.targetType];if(base)wx.navigateTo({url:base+(b.targetType==='guide'?'':`?id=${encodeURIComponent(b.targetId)}`)});}
});
