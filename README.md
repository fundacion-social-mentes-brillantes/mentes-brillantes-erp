<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ff0d8670-6f0a-44f8-a9f7-d76993e66eb0

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Database prerequisites (accounting)

For accounting features to work, ensure these objects exist in your database (not included yet in `schema.sql`):
- View `vw_movimientos_generales`
- Table `movimientos_saldo_favor`
- Table `auditoria_financiera`
- RPC `aplicar_saldo_favor_trx`

If any of these are missing, the Movements history or Assistant pages will show warnings, and applying saldo a favor will fail.
