// src/components/cards/SocialStatsCard.jsx
// NO-OP: This component has been retired. We keep the file so any old imports don't crash.
// It renders nothing and logs once in dev.

export default function SocialStatsCard() {
  if (import.meta?.env?.DEV) {
    console.debug('[SocialStatsCard] noop render (component retired)');
  }
  return null;
}
