import { createHash, timingSafeEqual } from 'node:crypto';
const hash = s => createHash('sha256').update(s).digest('hex');
export function validAdmin(header, configured) {
    if (!configured)
        return false;
    const candidate = String(header || '').replace(/^Bearer /, '');
    const a = Buffer.from(hash(candidate)), b = Buffer.from(hash(configured));
    return timingSafeEqual(a, b);
}
