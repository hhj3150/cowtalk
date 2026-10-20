// OPS-16: 상한 있는 캐시 Map — 키가 개체·사용자·농장 단위로 계속 늘어나는 캐시가
// 제거 정책 없이 자라던 것(느린 메모리 누수)을 막는다. 가장 오래 넣은/쓴 항목부터 버린다.

/** 넣기 전에 상한을 넘으면 오래된 것부터 지운다. 같은 키는 맨 뒤로 옮겨 최근 사용으로 취급 */
export function setBounded<K, V>(map: Map<K, V>, key: K, value: V, maxEntries: number): void {
  if (map.has(key)) map.delete(key);
  while (map.size >= maxEntries) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
  map.set(key, value);
}
