Component({
  properties:{ title:String, subtitle:String, showBack:Boolean },
  methods:{
    back(){ const pages=getCurrentPages(); pages.length>1 ? wx.navigateBack() : wx.reLaunch({url:'/pages/home/index'}); },
    help(){ wx.navigateTo({url:'/pages/guide/index'}); }
  }
});