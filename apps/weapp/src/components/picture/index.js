Component({
    properties: {
        src: {
            type: String,
            value: '',
            observer() {
                this.setData({
                    failed: false
                });
            }
        },
        alt: String,
        label: String
    },
    data: {
        failed: false
    },
    methods: {
        failedImage() {
            this.setData({
                failed: true
            });
        }
    }
});

