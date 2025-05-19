import * as CryptoJS from "crypto-js";

function generateId(length = 16): string {
  // Generate the specified number of random bytes
  const randomBytes = CryptoJS.lib.WordArray.random(length);

  // Convert the random bytes to a Base64 string
  let randomId = CryptoJS.enc.Base64.stringify(randomBytes);

  // Remove any padding characters from the Base64 string
  randomId = randomId.replace(/=+$/, "");

  // Replace non-url-safe characters with url-safe ones
  randomId = randomId.replace(/\+/g, "A").replace(/\//g, "B");

  return randomId.slice(0, length);
}

export { generateId };
