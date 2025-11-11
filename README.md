# Secure BitTorrent File Transfer

Node.js CLI toolkit for sharing files privately via BitTorrent with end-to-end encryption.  
Components:
- `src/tracker` — private tracker service (HTTP/UDP/WS optional)
- `src/sender` — encrypts and seeds files to authorized receivers
- `src/receiver` — downloads and decrypts shared files
- `src/crypto` — libsodium-based key management, session derivation, and streaming encryption helpers

## Getting Started

```bash
npm install
```

Generate identities (run once per device):

```bash
npm run keygen -- --alias sender
npm run keygen -- --alias receiver
```

Start the tracker (requires pm2):

```bash
pm2 start src/tracker/index.js --name secure-tracker -- --port 9000
pm2 logs secure-tracker --lines 50 --nostream
```

Send a file:

```bash
pm2 start src/sender/index.js --name secure-sender -- \
  --file /ABSOLUTE/PATH/TO/SECRET.ZIP \
  --alias sender \
  --recipient-key <PUBLIC_KEY_RECEIVER> \
  --handshake-out /ABSOLUTE/PATH/TO/handshake.json
```

Receive a file:

```bash
pm2 start src/receiver/index.js --name secure-receiver -- \
  --handshake /ABSOLUTE/PATH/TO/handshake.json \
  --alias receiver \
  --save /ABSOLUTE/PATH/TO/OUTPUT/DIR
```

Detailed instructions and security notes are in `docs/USAGE.md`.

