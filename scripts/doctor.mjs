import { loadConfig, missingIvy } from '../packages/core/config.mjs';
const c = loadConfig();
console.log(JSON.stringify({
    node: process.versions.node,
    databaseDriver: c.dbDriver,
    missingIvy: missingIvy(c),
    h5MapConfigured: Boolean(c.h5MapKey),
    coordinateConversionConfigured: Boolean(c.amapKey),
    transitCodeConfigured: Boolean(c.transitAppId),
    wechatLoginConfigured: Boolean(c.wechatAppId && c.wechatAppSecret),
    notice: 'Only configuration presence is inspected; this does not prove third-party connectivity.'
}, null, 2));

