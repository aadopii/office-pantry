# Using Office Pantry

[Back to the introduction](../README.md)

## Your own copy

You can run, modify, and share Office Pantry under the MIT license. Cloning the repository is enough to try it. Fork it if you want your own copy on GitHub to save changes or share improvements.

1. Select **Fork** on the [GitHub repository](https://github.com/aadopii/office-pantry).
2. Clone your fork, replacing `YOUR_GITHUB_USERNAME` with your GitHub username.

   ```sh
   git clone https://github.com/YOUR_GITHUB_USERNAME/office-pantry.git
   cd office-pantry
   npm ci
   npm run demo
   ```

3. Sign in through Eve using your own model account when prompted. The simulation needs no Catena account and sends no money.
4. To try real payments, follow the setup below using your own Catena account, funds, recipient, and authorization. A fork does not include the original operator's credentials, money, or purchase records.

## Prices and spending limits

The catalog contains premium coffee for $0.25, house coffee for $0.20, a team snack box for $0.60, and energy drinks for $0.03 each. Code calculates the total from item IDs and whole quantities. The model cannot choose a price or recipient. Each purchase uses one catalog vendor.

Purchases above $0.90 are refused. Purchases above $0.50 wait for your approval; exactly $0.50 does not. The approval prompt copies the saved amount, items, vendor, and recipient. Code checks that copy before accepting approval. Changing a purchase requires a new request.

A spending limit is different from available money. Catena's $500 monthly limit does not fund the account. The source account must have enough available money on the configured network.

Catena independently enforces its configured policy. Its monthly reset boundary, timezone, timestamp rules, and treatment of pending payments remain unverified. Office Pantry therefore keeps a stricter local $500 lifetime guard that includes completed and unresolved purchases and never resets automatically. This is a limitation, not a matching implementation of Catena's monthly accounting.

## Purchase history

A submitted payment is not necessarily paid. `pending` means Catena is waiting, `processing` means it is still working, and `uncertain` means the outcome needs checking. Only provider completion becomes `paid`. Refused and rejected purchases send no payment. A failed provider result releases the local reservation but does not restore an already used test authorization.

Ask Eve to check the purchase ID, or read the local records:

```sh
npm run ledger
npm run ledger -- PURCHASE_ID
PANTRY_MODE=live npm run ledger -- PURCHASE_ID --reconcile
```

Replace `PURCHASE_ID` with the saved ID. Reconciliation reads the existing payment status. It does not create a replacement. Records include the original request, operator identity, reason, items, vendor, approval, and provider outcome. Real records and credentials stay in ignored local files. Preserve `.pantry` when restarting or upgrading.

## Monthly reports

Create or refresh a report for the current UTC calendar month, a chosen month, or read the durable report inbox:

```sh
npm run report
npm run report -- 2026-09
npm run reports
```

A report includes settled spending, purchased items and vendors, and current unresolved commitments across all months. It distinguishes the calendar month comparison from the stricter lifetime guard. Neither is a statement of account balance or Catena's remaining allowance. Provider availability is labeled unknown. The completion timestamp comes from Catena when supplied, otherwise from the first local observation of completion. Check unresolved payments before refreshing a report. Repeating a report updates its existing inbox entry.

Automatic reports run at 09:00 UTC on the first day of each month for the previous month:

```sh
npm run build
npm run schedule
```

Keep this process running and the computer awake. It listens only on local port 2001 and forces live payments off. `npm run dev` does not run the clock. Stop the schedule with Ctrl+C, or start it with `PANTRY_SCHEDULE_DISABLED=1 npm run schedule` to disable reporting. Missed times while the process is stopped are not replayed; use the manual report command. A real scheduled execution was verified with a temporary minute cadence and isolated simulation data, then the monthly cadence was restored.

## Run the checks

Stop any running Eve development process first. These commands never submit real payments:

```sh
npm run check
npm test
npm run eval
npm run info
npm run build
```

The ordinary tests use isolated storage and fake transport. Native Eve evals run real model conversations against fake transport in a fresh temporary directory. They cover coffee selection, refusal, approval cancellation and acceptance, replay, and exhausted budget. Successful output reports five passing evals. Model wording may vary.

## Current limits

This version is for one trusted local operator, one configured network and recipient, and a tiny fixed catalog. It does not discover vendors, deliver goods, authenticate employees, or run while the computer is off. Both catalog vendor names route to the configured demonstration recipient. It has no deployment or shared office service.

Provider monthly accounting remains unresolved. Local records can become stale until you check provider status. Reports do not automatically contact Catena or reconstruct historical unresolved balances. The operator must preserve the private ledger and authorization. See [verification evidence](VERIFICATION.md) and the three [engineering decisions](DECISIONS.md) for the tested behavior and its limits.
