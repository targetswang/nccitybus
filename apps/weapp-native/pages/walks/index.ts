import { loadContent } from '../../services/content';
Page({data:{walks:[] as any[],error:''},async onLoad(){try{const c=await loadContent();this.setData({walks:c.walks||[]});}catch(e:any){this.setData({error:e.message});}}});
