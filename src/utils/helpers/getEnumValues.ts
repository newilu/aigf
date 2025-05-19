function getEnumKeys<E extends {}>(enumObj: E): string[] {
  return Object.keys(enumObj).filter((key) => isNaN(Number(key)));
}

function getEnumValues<E extends {}>(enumObj: E): E[keyof E][] {
  return getEnumKeys(enumObj).map((k) => enumObj[k as keyof E]);
}

export { getEnumKeys, getEnumValues };
