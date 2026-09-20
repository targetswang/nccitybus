import { loadDriver } from '../core/drivers.mjs';
import fs from 'node:fs';
import { normalizeEvent } from './events.mjs';
import { log } from '../core/log.mjs';
/** Bounded, durable processing: acknowledgement occurs after repository.acceptEvent resolves. */
export function createMessageHandler({ config, repository, converter, now = Date.now }) {
    let queued = 0, tail = Promise.resolve();
    return {
        get queued() {
            return queued;
        },
        drain: () => tail,
        handle(packet, done) {
            if (++queued > 500) {
                queued--;
                done(new Error('QUEUE_OVERLOAD'));
                return;
            }
            tail = tail.then(async () => {
                try {
                    if (![
                        config.ivy.locationTopic,
                        config.ivy.stopTopic
                    ].includes(packet.topic))
                        return;
                    if (packet.payload.length > 2 * 1024 * 1024)
                        throw Object.assign(new Error('TOO_LARGE'), {
                            code: 'TOO_LARGE'
                        });
                    let wire;
                    try {
                        wire = JSON.parse(packet.payload.toString('utf8'));
                    }
                    catch {
                        throw Object.assign(new Error('BAD_JSON'), {
                            code: 'BAD_JSON'
                        });
                    }
                    const event = await normalizeEvent(config, wire, converter, now());
                    const expected = packet.topic === config.ivy.locationTopic ? 'location' : 'stop';
                    if (event.stream !== expected)
                        throw Object.assign(new Error('TOPIC_TYPE_MISMATCH'), {
                            code: 'TOPIC_TYPE_MISMATCH'
                        });
                    const result = await repository.acceptEvent(event, now(), { key: `ivy:${config.transit.operatorId}`, owner: config.workerId });
                    log({
                        event: 'mqtt-event',
                        code: result
                    });
                }
                catch (e) {
                    if (e.code && [
                        'BAD_JSON',
                        'TOO_LARGE',
                        'BAD_SIGNATURE',
                        'BAD_NONCE',
                        'SIGNATURE_EXPIRED',
                        'BAD_APP_KEY',
                        'INVALID_COORDINATE',
                        'FUTURE_EVENT',
                        'OUT_OF_SCOPE',
                        'TOPIC_TYPE_MISMATCH',
                        'UNKNOWN_EVENT',
                        'UNKNOWN_ACC_STATUS',
                        'INVALID_STOP',
                        'INVALID_ACTION',
                        'INVALID_ROUTE',
                        'INVALID_DIRECTION',
                        'INVALID_BRANCH',
                        'INVALID_VEHICLE',
                        'BAD_PADDING',
                        'BAD_CIPHERTEXT',
                        'BAD_LENGTH',
                        'INVALID_PAYLOAD'
                    ].includes(e.code)) {
                        await repository.recordAudit('mqtt-rejected', e.code, now());
                        log({
                            event: 'mqtt-rejected',
                            code: e.code
                        });
                        return;
                    }
                    throw e;
                }
            }).then(() => done(), e => {
                log({
                    event: 'mqtt-storage-error',
                    code: e.code || 'PERSISTENCE_FAILED'
                });
                done(e);
            }).finally(() => queued--);
        }
    };
}
export async function connectMqtt(config, repository, converter, { onFatal = () => {
} } = {}) {
    const { connect } = loadDriver('mqtt', config.root);
    const c = config.ivy, key = `mqtt:${config.transit.operatorId}`;
    const topic = raw => c.group ? `$share/${c.group}/${raw}` : raw;
    const client = connect(c.broker, {
        protocolVersion: 5,
        clean: false,
        clientId: c.clientId,
        username: c.username,
        password: c.password,
        properties: {
            sessionExpiryInterval: 3600,
            receiveMaximum: 20
        },
        reconnectPeriod: 3000,
        reconnectOnConnackError: false,
        connectTimeout: 10000,
        keepalive: 30,
        resubscribe: false,
        rejectUnauthorized: true,
        ...(c.caFile ? {
            ca: fs.readFileSync(c.caFile)
        } : {})
    });
    const handler = createMessageHandler({
        config,
        repository,
        converter
    });
    let terminating = false;
    const fatal = async (reason) => {
        if (terminating)
            return;
        terminating = true;
        try {
            await repository.setState(key, {
                state: 'error',
                reason
            });
        }
        finally {
            client.end(true);
            onFatal(new Error(reason));
        }
    };
    client.handleMessage = (packet, done) => handler.handle(packet, error => {
        done(error);
        if (error)
            void fatal('PERSISTENCE_FAILED').catch(() => onFatal(error));
    });
    client.on('connect', async () => {
        try {
            const granted = await client.subscribeAsync([
                topic(c.locationTopic),
                topic(c.stopTopic)
            ], {
                qos: 1
            });
            if (granted.some(g => g.qos === 128))
                throw new Error('SUBSCRIPTION_DENIED');
            await repository.setState(key, {
                state: 'connected',
                reason: null
            });
            log({
                event: 'mqtt-subscribed',
                count: granted.length
            });
        }
        catch (e) {
            void fatal('SUBSCRIPTION_DENIED').catch(() => onFatal(e));
        }
    });
    client.on('reconnect', () => repository.setState(key, {
        state: 'connecting',
        reason: 'RECONNECTING'
    }).catch(() => {
    }));
    client.on('offline', () => repository.setState(key, {
        state: 'error',
        reason: 'MQTT_DISCONNECTED'
    }).catch(() => {
    }));
    client.on('error', () => repository.setState(key, {
        state: 'error',
        reason: 'MQTT_CONNECTION_ERROR'
    }).catch(() => {
    }));
    return {
        client,
        handler,
        stop: async () => {
            await handler.drain();
            await Promise.race([
                new Promise(resolve => client.end(false, {}, resolve)),
                new Promise(resolve => setTimeout(() => {
                    client.end(true);
                    resolve();
                }, 2000))
            ]);
        }
    };
}

