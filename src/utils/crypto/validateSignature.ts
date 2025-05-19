import { generateSignature } from "./generateSignature";

function validateSignature(
  message: string,
  signature: string,
  privateKey: string,
): boolean {
  const expectedSignature = generateSignature(message, privateKey);
  return expectedSignature === signature;
}

export { validateSignature };
