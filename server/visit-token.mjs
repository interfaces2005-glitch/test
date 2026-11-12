import {createHmac,timingSafeEqual} from 'node:crypto';
export const viewToken=id=>createHmac('sha256',process.env.BOOKING_LINK_SECRET||process.env.ADMIN_PASSWORD).update('madin-visit:'+id).digest('hex');
export function tokenMatches(row,token,hash){if(typeof token!=='string'||token.length>200)return false;if(hash(token)===row.token_hash)return true;const valid=viewToken(row.id);return token.length===valid.length&&timingSafeEqual(Buffer.from(token),Buffer.from(valid));}
