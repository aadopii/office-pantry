# Payment authorization

The local operator creates `.pantry/live-consent.json` after confirming the exact recipient and total allowance. It is ignored by Git and must remain private. This record is an additional demonstration safeguard, not a replacement for Eve approval or Catena policy.

The following is a schema example, not permission to spend. Replace every placeholder with the locally confirmed value. Each entry in `allowedAmountsCents` authorizes one attempt of that amount. `totalCents` is the cumulative allowance, including unresolved attempts. The application also enforces a maximum local demonstration authorization of 200 cents; the operator's actual confirmed amount can be lower and always controls.

```json
{
  "accountId": "CONFIRMED_SOURCE_ACCOUNT",
  "railId": "CONFIRMED_RECIPIENT_RAIL",
  "address": "CONFIRMED_WALLET_ADDRESS",
  "network": "CONFIRMED_NETWORK",
  "totalCents": 85,
  "allowedAmountsCents": [25, 60],
  "confirmedAt": "ACTUAL_CONFIRMATION_TIMESTAMP"
}
```

Use `chmod 600 .pantry/live-consent.json` after creating the file. Keep `.env` and `.pantry` together as private operational state. Never reset the file or delete the ledger to repeat an attempted payment. A failed attempt also consumes its authorization slot.

If a submission timed out without returning an intent ID, inspect the original purchase first. The operator can recover only that same action and key:

```sh
PANTRY_MODE=live npm run ledger -- PURCHASE_ID --recover-exact
```

This command can resubmit the saved request to Catena using its original idempotency key. It is not exposed to the model. With an existing intent ID, it only checks status. Never create a new purchase or key to recover an uncertain result.

The optional `PANTRY_MODE=live npm run smoke:live` command addresses one fixed coffee request and can send a real $0.25 payment if its exact authorization slot is unused. It is not part of the repeatable demonstration. Subsequent invocations read the same purchase; do not remove its record.
