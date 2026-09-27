// Separate from npm test. Real-money execution requires live-consent.json and PANTRY_MODE=live.
import { pantry } from '../lib/runtime.ts';
import { summary } from '../lib/pantry.ts';
if (process.env.PANTRY_MODE!=='live') throw new Error('Explicit PANTRY_MODE=live is required for this separate smoke check.');
const p=pantry();const requestId='office-pantry-live-smoke-coffee-v1';const sessionId='operator-live-smoke';
p.store.capture({id:requestId,sessionId,requester:process.env.PANTRY_REQUESTER || 'local-operator',original:'One premium coffee pack for the explicitly approved live integration smoke check.',at:new Date().toISOString()});
const purchase=p.prepare(requestId,[{itemId:'premium-coffee',quantity:1}],'Verify the approved $0.25 Catena send.');
console.log(JSON.stringify(summary(await p.pay(purchase.id,sessionId)),null,2));
