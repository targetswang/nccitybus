const { openPage } = require('../../services/platform');
Component({
    properties: {
        poi: Object,
        nodeName: String
    },
    methods: {
        open() {
            openPage('poi', this.properties.poi.id, 'explore');
        }
    }
});

