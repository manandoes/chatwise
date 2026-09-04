// Turning the code WhatsApp gives us into a square somebody can point a phone
// at.
//
// WhatsApp hands over a short string; on its own that is not something anyone
// can scan. This draws it as an image, in the app's own colours, and returns it
// as a data URL so the page can show it without another request.

import QRCode from "qrcode";

/**
 * Draws the QR code as a PNG data URL.
 *
 * Deliberately dark-on-light rather than the app's dark theme: phone cameras
 * read a dark code on a light background far more reliably, and a customer
 * struggling to scan is a worse outcome than a white square on a dark page.
 * The page frames it in white so it still looks intentional.
 */
export async function renderQrCode(qr: string): Promise<string> {
  return QRCode.toDataURL(qr, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
    color: {
      dark: "#04140B",
      light: "#FFFFFF",
    },
  });
}
