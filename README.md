# Office Pantry

An office snack agent that knows when to buy, ask, or say no.

> “We’re out of coffee. Get the good stuff.”

Ask in your terminal. Office Pantry picks from a small catalog, works out the price, and checks the budget. You approve the larger purchases. Every request leaves a record of who asked, what was chosen, and what happened to the payment.

Built with [Eve](https://eve.dev) and [Catena](https://catena.com).

## Give it a shopping list

1. **“Get the good coffee.”** One premium pack costs $0.25 and can be bought without approval.
2. **“Buy a snack box for the team.”** That costs $0.60. The agent waits for you to approve or cancel.
3. **“Buy 40 energy drinks.”** That costs $1.20, above the $0.90 purchase limit. The agent explains why it cannot buy them.

These are deliberately tiny demo prices. No snacks are delivered. The simulation sends no money; live mode makes real payments.

## Try it

You need Node.js 24, npm, and your own model login through Eve. No Catena account is needed for the simulation.

```sh
git clone https://github.com/aadopii/office-pantry.git
cd office-pantry
npm ci
npm run demo
```

Use `/login` if prompted, then try a request above. Stop with Ctrl+C.

To see your simulated purchases and monthly spending:

```sh
npm run demo:ledger
npm run demo:report
```

## Make it yours

Fork it, change the catalog, or try it with your own Catena account. It’s [MIT licensed](LICENSE). Start with the [usage guide](docs/USAGE.md) or [real payment setup](docs/PAYMENT_SETUP.md). Real payments are off by default.

This version runs locally for one trusted operator. Catena enforces a $500 monthly policy. Until its reset rules are confirmed, an additional local $500 total spending limit never resets. Monthly reports use UTC. The [usage guide](docs/USAGE.md#monthly-reports) explains how to schedule them while your computer is running.

[Engineering decisions](docs/DECISIONS.md) · [What’s been tested](docs/VERIFICATION.md)
