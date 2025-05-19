import * as CryptoJS from "crypto-js";

function generateUUID(): string {
  let hex = CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex);
  // Устанавливаем версию UUID (4) - символ на позиции 12
  hex = hex.substring(0, 12) + "4" + hex.substring(13);
  // Устанавливаем вариант - символ на позиции 16
  const variantDigit = parseInt(hex[16], 16);
  const newVariantDigit = (variantDigit & 0x3) | 0x8;
  hex = hex.substring(0, 16) + newVariantDigit.toString(16) + hex.substring(17);

  // Форматирование в виде UUID: 8-4-4-4-12
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

export { generateUUID };
