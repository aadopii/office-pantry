# Real payments

The simulation is the repeatable demonstration. Real payment setup needs a Catena organization, a funded USD account, an approved wallet counterparty on the same network, and a dedicated Catena agent secret key. Keep the application on your own computer; do not expose its local ports.

1. Create local configuration only if it does not already exist.

   ```sh
   test -f .env || cp .env.example .env
   chmod 600 .env
   ```

   Edit `.env` locally. Set `PANTRY_REQUESTER` to the operator identity. This name is supplied by the operator, not verified employee authentication. Enter the Catena agent secret key and the source account, counterparty, rail, recipient address, and network values. Keep `PANTRY_MODE=disabled` as the normal setting. Never share or commit this file.

2. In Catena, give the dedicated agent read and send access to the selected account. Set account wide USD block rules of $500 monthly and $0.90 per purchase, restrict counterparties to the approved recipient, and block counterparty creation and temporary overrides. Do not weaken an existing stricter policy. Check the setup.

   ```sh
   npm run preflight
   ```

   Successful output confirms the effective policy, source account, recipient rail, and available funds. It contains private account information; keep the output private. This command does not send money.

3. Record the operator's exact payment authorization in `.pantry/live-consent.json`. The schema is shown in [payment authorization](#payment-authorization). It must match the configured recipient and explicitly authorize each amount and the cumulative total. Preserve this file and the ledger. The application will not create or broaden consent from chat.

4. Start Eve normally to inspect requests with payments disabled.

   ```sh
   npm run dev
   ```

   To intentionally permit real payments within the saved authorization, stop that process and run:

   ```sh
   PANTRY_MODE=live npm run dev
   ```

   **This command can move real money.** Above $0.50, use Eve's approval control for the exact purchase. Any further Catena approval or signature must be completed in Catena. Stop the process with Ctrl+C afterward. The normal configuration remains disabled. Once an authorized amount has been attempted, reuse its original purchase record for status checks; do not delete records or reset the allowance to repeat a demo.

## Payment authorization

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
