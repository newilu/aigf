function getSecureRandom() {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] / (0xffffffff + 1); // Возвращаем число от 0 до 1
}

export { getSecureRandom };
