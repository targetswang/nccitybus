const { openPage } = require('../../services/platform');
Component({
    properties: {
        walk: Object,
        cover: String
    },
    methods: {
        open() {
            openPage('walk', this.properties.walk.id, 'explore');
        }
    }
});

