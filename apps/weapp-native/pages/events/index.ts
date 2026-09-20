import { getContent, meAction, track } from '../../services/api';
import { readProfile, readSession } from '../../services/session';
Page({
  data:{events:[] as any[],profile:null as any,session:null as any,loading:true,error:'',note:''},
  async onShow(){const session=readSession();this.setData({session,loading:true,error:'',note:''});try{const [content,profile]=await Promise.all([getContent(),session?readProfile():Promise.resolve(null)]);this.setData({events:content.events||[],profile});}catch(e:any){this.setData({error:e.message});}finally{this.setData({loading:false});}},
  login(){wx.navigateTo({url:'/pages/login/index'});},
  async register(e:any){const session=readSession();if(!session){this.login();return;}const id=e.currentTarget.dataset.id;if(!await confirm('确认报名此免费活动？这不是公交预约。'))return;try{await meAction(session.session,'register',{id,accepted:true});void track('event_register',{page:'events',objectType:'event',objectId:id});this.setData({note:'活动报名已保存'});await this.onShow();}catch(err:any){this.setData({error:err.message});}}
});
function confirm(content:string){return new Promise<boolean>(resolve=>wx.showModal({title:'请确认',content,success:r=>resolve(r.confirm),fail:()=>resolve(false)}));}
