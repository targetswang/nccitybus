Component({
    properties: { text: String, audioUrl: String },
    data: { playing: false, error: '' },
    audio: null as any,
    pageLifetimes: { hide() { this.dispose(); } },
    lifetimes: { detached() { this.dispose(); } },
    methods: {
        dispose() { if (this.audio) {
            this.audio.destroy();
            this.audio = null;
        } this.setData({ playing: false }); },
        toggle() {
            if (!this.properties.audioUrl)
                return;
            if (!this.audio) {
                const audio = wx.createInnerAudioContext();
                this.audio = audio;
                audio.src = this.properties.audioUrl;
                audio.onPlay(() => this.setData({ playing: true, error: '' }));
                audio.onPause(() => this.setData({ playing: false }));
                audio.onEnded(() => this.setData({ playing: false }));
                audio.onError(() => this.setData({ playing: false, error: '音频加载失败，请阅读文字讲解' }));
            }
            if (this.data.playing)
                this.audio.pause();
            else
                this.audio.play();
        }
    }
});
