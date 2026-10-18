# game_iamge — PARTIAL

Every image is a real capture of the running Safety Net Lab, played through the browser with the fictional accounts `acct-A` and `acct-B` (both using the nickname "CyberTiger") behind the local gateway harness. Capture command: `npm run capture` (`tests/browser-capture.mjs`, Chromium through Playwright 1.56.1), then converted with Pillow. No EXIF data is kept.

| File | Real screen | Size | Orientation | Encoding | Bytes |
| --- | --- | --- | --- | --- | --- |
| header.jpg | Final results and board, 1920x1080 viewport | 1920x1080 | landscape | JPEG q85, opaque | 55379 |
| 01-welcome.webp | Player join screen | 1600x1000 | landscape | WebP | 17744 |
| 02-host-console.webp | Host console, Medium match running, all four difficulty levels | 1600x1000 | landscape | WebP | 31566 |
| 03-gameplay.webp | Probing bookRide and the locked safety net | 1600x1000 | landscape | WebP | 58598 |
| 04-leave-confirmation.webp | Leave game confirmation (player exit control) | 1600x1000 | landscape | WebP | 42444 |
| 05-results.webp | Monitor result and final board | 1600x1000 | landscape | WebP | 24964 |
| 06-mobile-gameplay.webp | Player probing on a phone (360x640 CSS px at 3x) | 1080x1920 | portrait | WebP | 58892 |

Total: 289,587 bytes. The desktop screenshots were opened and inspected at 1600x1000; the layout was also checked at 390 and 320 CSS px with no horizontal overflow.

**Known gap (why PARTIAL):** the results content in `header.jpg` sits in the top half of the frame. A centred 320x120 or 1280x400 cover crop shows mostly empty background. The 320x200 contain previews of the gallery images are readable. A better cover needs a denser 1920x1080 screen or a trainer-approved photo of a real workshop.
