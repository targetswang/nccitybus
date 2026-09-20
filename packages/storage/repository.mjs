import { createHash, randomUUID } from 'node:crypto';
import { invariant, validateCatalog, validateRoute } from '../contracts/index.mjs';
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export class Repository {
    constructor(db) { this.db = db; }
    async publishCatalog(catalog, now = Date.now()) {
        validateCatalog(catalog);
        const payload = JSON.stringify(catalog);
        return this.db.transaction('content-publish', async (tx) => {
            const existing = await tx.query('SELECT payload FROM content_releases WHERE version=$1', [catalog.version]);
            invariant(!existing.length || existing[0].payload === payload, 'IMMUTABLE_VERSION', 'Change version before changing published content', 409);
            await tx.query('INSERT INTO content_releases(version,payload,created_at) VALUES($1,$2,$3) ON CONFLICT(version) DO NOTHING', [catalog.version,payload,now]);
            await tx.query('INSERT INTO content_active(singleton,version) VALUES(1,$1) ON CONFLICT(singleton) DO UPDATE SET version=excluded.version', [catalog.version]);
            return catalog.version;
        });
    }
    async catalog() {
        const rows = await this.db.query('SELECT c.payload FROM content_releases c JOIN content_active a ON a.version=c.version WHERE a.singleton=1');
        return rows.length ? JSON.parse(rows[0].payload) : null;
    }
    async rollbackCatalog(version) {
        return this.db.transaction('content-publish', async (tx) => {
            const r = await tx.query('SELECT version FROM content_releases WHERE version=$1', [version]);
            invariant(r.length, 'NOT_FOUND', 'Unknown content version', 404);
            await tx.query('UPDATE content_active SET version=$1 WHERE singleton=1', [version]);
        });
    }
    async publishRoute(route, now = Date.now(), lease = null) {
        validateRoute(route);
        const version = digest(route), payload = JSON.stringify(route);
        await this.db.transaction(`route:${route.id}`, async (tx) => {
            if (lease) {
                const held = await tx.query('UPDATE worker_leases SET expires_at=expires_at WHERE key=$1 AND owner=$2 AND expires_at>$3 RETURNING key', [lease.key, lease.owner, now]);
                invariant(held.length === 1, 'LEASE_LOST', 'Worker no longer owns the route publication lease', 503);
            }
            await tx.query('INSERT INTO route_versions(version,route_id,payload,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(version) DO NOTHING', [version,route.id,payload,now]);
            await tx.query('INSERT INTO route_active(route_id,version) VALUES($1,$2) ON CONFLICT(route_id) DO UPDATE SET version=excluded.version', [route.id,version]);
        });
        return version;
    }
    async route(id) {
        const rows = await this.db.query('SELECT v.version,v.payload FROM route_active a JOIN route_versions v ON a.version=v.version WHERE a.route_id=$1', [id]);
        return rows.length ? {version: rows[0].version,route: JSON.parse(rows[0].payload)} : null;
    }
    async acceptEvent(event, now = Date.now(), lease = null) {
        const key = digest({operatorId:event.operatorId,vehicleKey:event.vehicleKey,stream:event.stream,time:event.time,data:event.data});
        return this.db.transaction(`vehicle:${event.operatorId}:${event.vehicleKey}`, async (tx) => {
            if (lease) {
                const held=await tx.query('UPDATE worker_leases SET expires_at=expires_at WHERE key=$1 AND owner=$2 AND expires_at>$3 RETURNING key',[lease.key,lease.owner,now]);
                invariant(held.length===1,'LEASE_LOST','Worker no longer owns the ingestion lease',503);
            }
            const receipt=await tx.query('SELECT result FROM event_receipts WHERE digest=$1',[key]);
            if(receipt.length)return 'duplicate';
            const rows=await tx.query('SELECT event_time,digest FROM latest_events WHERE operator_id=$1 AND vehicle_key=$2 AND stream=$3',[event.operatorId,event.vehicleKey,event.stream]);
            let result='accepted';
            if(rows.length&&Number(rows[0].event_time)>event.time)result='out_of_order';
            if(rows.length&&Number(rows[0].event_time)===event.time&&rows[0].digest!==key)result='same_time_conflict';
            await tx.query('INSERT INTO event_receipts(digest,received_at,result) VALUES($1,$2,$3)',[key,now,result]);
            if(result==='accepted')await tx.query('INSERT INTO latest_events(operator_id,vehicle_key,stream,event_time,digest,payload) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(operator_id,vehicle_key,stream) DO UPDATE SET event_time=excluded.event_time,digest=excluded.digest,payload=excluded.payload',[event.operatorId,event.vehicleKey,event.stream,event.time,key,JSON.stringify(event)]);
            return result;
        });
    }
    async latest(operatorId){const rows=await this.db.query('SELECT payload FROM latest_events WHERE operator_id=$1',[operatorId]);return rows.map(x=>JSON.parse(x.payload));}
    async setState(key,state,now=Date.now()){await this.db.query('INSERT INTO integration_state(key,payload,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at',[key,JSON.stringify(state),now]);}
    async state(key){const r=await this.db.query('SELECT payload,updated_at FROM integration_state WHERE key=$1',[key]);return r.length?{...JSON.parse(r[0].payload),updatedAt:Number(r[0].updated_at)}:null;}
    async lease(key,owner,now,duration){return this.db.transaction(`lease:${key}`,async tx=>{const r=await tx.query('SELECT owner,expires_at FROM worker_leases WHERE key=$1',[key]);if(r.length&&r[0].owner!==owner&&Number(r[0].expires_at)>now)return false;await tx.query('INSERT INTO worker_leases(key,owner,expires_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at',[key,owner,now+duration]);return true;});}
    async releaseLease(key,owner){await this.db.query('DELETE FROM worker_leases WHERE key=$1 AND owner=$2',[key,owner]);}
    async acknowledgeSync(key,observed,now=Date.now()){const {updatedAt,...payload}=observed;const replacement={pending:false,requestedAt:payload.requestedAt,completedAt:now};const rows=await this.db.query('UPDATE integration_state SET payload=$1,updated_at=$2 WHERE key=$3 AND payload=$4 RETURNING key',[JSON.stringify(replacement),now,key,JSON.stringify(payload)]);return rows.length===1;}
    async recordAudit(kind,code,now=Date.now()){await this.db.query('INSERT INTO audit_events(id,kind,code,at) VALUES($1,$2,$3,$4)',[randomUUID(),kind,code,now]);}
    async housekeeping(now=Date.now()){await this.db.query('DELETE FROM event_receipts WHERE received_at<$1',[now-7*86400000]);await this.db.query('DELETE FROM sessions WHERE expires_at<$1',[now]);await this.db.query('DELETE FROM audit_events WHERE at<$1',[now-30*86400000]);}
}
