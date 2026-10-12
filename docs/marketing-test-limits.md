# Marketing test limits

User-authorized test configuration: 50 paid generation jobs per KST day, 1,500 per KST month, and 50 no-AI render jobs per day. Generating copy, regenerating copy, or subsequently generating an AI cover may consume separate paid jobs. These are job limits, not guaranteed numbers of completed posts.

Application reservation guardrails are USD 15/day and USD 300/month. Reservations are estimates, not provider invoices or a guarantee of the provider account balance. No credits were purchased. Failed reservations remain in the budget; the existing counted-job semantics are unchanged.

Database fields marketing_ai_control.daily_call_limit, monthly_call_limit and render_daily_limit are read by the reservation function and the admin usage summary. Production settings were updated by the marketing_test_generation_limits migration. No automatic expiry was requested. To end testing, restore limits 10/180/10 and budgets 5/20 in the same control row.

Automatic generation frequency, publication frequency, manual approval, source and photo review, 30-second cooldown, one-active-job lock, idempotency and uncertain-outcome safeguards are unchanged. No live generation or posting is performed by tests.
