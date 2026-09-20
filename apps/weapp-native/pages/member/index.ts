import { getContent, meAction, track } from '../../services/api';
import { readProfile, readSession } from '../../services/session';
Page({
  data:{plans:[] as any[],profile:null as any,session:null as any,loading:true,error:'',note:''},
  async onShow(){const session=readSession();this.setData({session,loading:true,error:'',note:''});try{const [content,profile]=await Promise.all([getContent(),session?readProfile():Promise.resolve(null)]);this.setData({plans:content.membershipPlans||[],profile});}catch(e:any){this.setData({error:e.message});}finally{this.setData({loading:false});}},
  login(){wx.navigateTo({url:'/pages/login/index'});},
  async join(e:any){const session=readSession();if(!session){this.login();return;}const id=e.currentTarget.dataset.id;if(!await confirm('确认自愿加入该免费会员方案并同意规则？'))return;try{await meAction(session.token,'join',{id,accepted:true});void track('member_join',{page:'member',objectType:'membershipPlan',objectId:id});this.setData({note:'会员记录已保存'});await this.onShow();}catch(err:any){this.setData({error:err.message});}}
});
function confirm(content:string){return new Promise<boolean>(resolve=>wx.showModal({title:'请确认',content,success:r=>resolve(r.confirm),fail:()=>resolve(false)}));}

