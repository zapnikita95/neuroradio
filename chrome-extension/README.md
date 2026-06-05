# Music Story — Chrome extension (MVP)

Reads **Media Session** on Yandex Music / Spotify / YouTube and prepares track info for the Railway BFF.

1. Chrome → `chrome://extensions` → Developer mode → Load unpacked → this folder
2. Popup: Railway URL + install ID (same as Android settings)
3. Full auto-story requires JWT (`POST /v1/auth/token`) — wired in a follow-up
