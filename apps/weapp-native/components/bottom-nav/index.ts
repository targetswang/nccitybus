Component({
  properties:{ active:String },
  methods:{
    go(e:any){
      const page=e.currentTarget.dataset.page;
      wx.reLaunch({url:`/pages/${page}/index`});
    }
  }
});