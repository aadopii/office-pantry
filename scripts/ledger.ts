import { openStore, pantry } from '../lib/runtime.ts';
import { summary } from '../lib/pantry.ts';
const [id,operation]=process.argv.slice(2);
if (operation==='--reconcile' && id) console.log(JSON.stringify(summary(await pantry().reconcile(id)),null,2));
else if (operation==='--recover-exact' && id) console.log(JSON.stringify(summary(await pantry().recoverUnknown(id)),null,2));
else {const store=openStore();console.log(JSON.stringify(id?store.get(id):store.all(),null,2));store.close();}
