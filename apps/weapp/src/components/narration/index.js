Component({
    properties: {
        audioUrl: String,
        text: String
    },
    data: {
        playing: false,
        expanded: false,
        error: ''
    },
    lifetimes: {
        detached() {
            this.release();
        }
    },
    pageLifetimes: {
        hide() {
            this.release();
        }
    },
    methods: {
        toggleText() {
            this.setData({
                expanded: !this.data.expanded
            });
        },
        release() {
            if (this.audio) {
                this.audio.stop();
                this.audio.destroy();
                this.audio = null;
            }
            this.setData({
                playing: false
            });
        },
        toggleAudio() {
            if (!this.properties.audioUrl)
                return;
            if (!this.audio) {
                this.audio = wx.createInnerAudioContext();
                this.audio.src = this.properties.audioUrl;
                this.audio.onPlay(() => this.setData({
                    playing: true,
                    error: ''
                }));
                this.audio.onPause(() => this.setData({
                    playing: false
                }));
                this.audio.onEnded(() => this.setData({
                    playing: false
                }));
                this.audio.onError(() => this.setData({
                    playing: false,
                    error: '音频暂不可用，可阅读下方讲解。',
                    expanded: true
                }));
            }
            if (this.data.playing)
                this.audio.pause();
            else
                this.audio.play();
        }
    }
});

