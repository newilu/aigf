import * as CryptoJS from "crypto-js";

function generateSignature(message: string, privateKey: string): string {
  const signature = CryptoJS.HmacSHA256(message, privateKey);
  return signature.toString(CryptoJS.enc.Hex);
}

export { generateSignature };
