import { meAction } from '../../services/api';
import { readProfile, readSession } from '../../services/session';
Page({data:{session:null as any,profile:null as any,error:'',loading:true},async onShow(){const session=readSession();this.setData({session,loading:true,error:''});if(!session){this.setData({profile:null,loading:false});return;}try{this.setData({profile:await readProfile()});}catch(e:any){this.setData({error:e.message});}finally{this.setData({loading:false});}},login(){wx.navigateTo({url:'/pages/login/index'});},async read(e:any){const s=readSession();if(!s)return;try{await meAction(s.token,'readMessage',{recordId:e.currentTarget.dataset.id});await this.onShow();}catch(err:any){this.setData({error:err.message});}}});

