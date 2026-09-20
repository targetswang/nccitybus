import { coordinate, invariant } from '../contracts/index.mjs';
/** No guessed coordinate conversion. Raw WGS84 is retained; official conversion is optional and explicit. */
export class AmapConverter {
    constructor(key, transport = fetch) {
        this.key = key;
        this.transport = transport;
        this.cache = new Map();
    }
    async convert(points) {
        for (const p of points)
            coordinate(p.lat, p.lng, 'WGS84');
        if (!this.key)
            return points.map(() => null);
        const out = [];
        for (let i = 0; i < points.length; i += 40) {
            const batch = points.slice(i, i + 40), lookup = batch.map(p => `${p.lng},${p.lat}`).join('|');
            if (this.cache.has(lookup)) {
                out.push(...this.cache.get(lookup));
                continue;
            }
            const url = new URL('https://restapi.amap.com/v3/assistant/coordinate/convert');
            url.searchParams.set('key', this.key);
            url.searchParams.set('coordsys', 'gps');
            url.searchParams.set('locations', lookup);
            const response = await this.transport(url, {
                signal: AbortSignal.timeout(10000),
                redirect: 'error'
            });
            invariant(response.ok, 'MAP_CONVERSION_FAILED', 'Coordinate service failed', 502);
            const data = await response.json();
            invariant(data.status === '1' && typeof data.locations === 'string', 'MAP_CONVERSION_FAILED', 'Coordinate conversion rejected', 502);
            const converted = data.locations.split(';').map(v => {
                const [lng, lat] = v.split(',').map(Number);
                return coordinate(lat, lng, 'GCJ02');
            });
            invariant(converted.length === batch.length, 'MAP_CONVERSION_FAILED', 'Conversion count mismatch', 502);
            if (this.cache.size > 500)
                this.cache.clear();
            this.cache.set(lookup, converted);
            out.push(...converted);
        }
        return out;
    }
}

