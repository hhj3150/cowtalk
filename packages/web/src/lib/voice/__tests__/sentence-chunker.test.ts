import { describe, it, expect } from 'vitest';
import { extractChunks, stripUnspeakableBlocks, ChunkAccumulator } from '../sentence-chunker';

describe('extractChunks', () => {
  it('첫 청크는 짧아도 내보낸다 — 말을 빨리 떼기 위해', () => {
    const { chunks } = extractChunks('423번 소입니다. 체온이 높습니다. ', true, false);
    expect(chunks[0]).toBe('423번 소입니다.');
  });

  it('문장이 끝나지 않으면 보류한다', () => {
    const { chunks, rest } = extractChunks('423번 소의 체온이 조금', true, false);
    expect(chunks).toHaveLength(0);
    expect(rest).toBe('423번 소의 체온이 조금');
  });

  it('소수점은 문장 끝으로 보지 않는다', () => {
    const { chunks } = extractChunks('체온은 38.5도로 정상 범위 안에 있습니다. ', true, false);
    expect(chunks[0]).toBe('체온은 38.5도로 정상 범위 안에 있습니다.');
  });

  it('flush하면 남은 꼬리까지 모두 내보낸다', () => {
    const { chunks, rest } = extractChunks('마무리 문장이 아직 끝나지 않았', false, true);
    expect(chunks).toEqual(['마무리 문장이 아직 끝나지 않았']);
    expect(rest).toBe('');
  });

  it('종결부호가 없어도 최대 길이에서 강제 분할한다', () => {
    const long = '가'.repeat(300);
    const { chunks } = extractChunks(long, false, false, { maxChars: 100 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]!.length).toBeLessThanOrEqual(100);
  });

  it('줄바꿈을 경계로 쓸 수 있다', () => {
    const { chunks } = extractChunks('첫 줄 내용입니다\n둘째 줄 내용입니다\n', true, false);
    expect(chunks[0]).toBe('첫 줄 내용입니다');
  });

  it('스트림 끝에 걸친 종결부호는 확정하지 않는다 — 다음 델타를 기다린다', () => {
    // "38.5" 처럼 뒤에 숫자가 더 올 수도 있으므로 끝 문자는 판단 보류
    const { chunks, rest } = extractChunks('체온이 정상입니다.', true, false);
    expect(chunks).toHaveLength(0);
    expect(rest).toBe('체온이 정상입니다.');
  });
});

describe('stripUnspeakableBlocks', () => {
  it('코드블록을 제거한다', () => {
    const out = stripUnspeakableBlocks('설명입니다\n```js\nconst a = 1;\n```\n끝입니다');
    expect(out).not.toContain('const a');
    expect(out).toContain('설명입니다');
    expect(out).toContain('끝입니다');
  });

  it('스트리밍 중 열린 코드블록은 뒤를 통째로 보류한다', () => {
    const out = stripUnspeakableBlocks('설명입니다\n```svg\n<svg viewBox');
    expect(out).not.toContain('svg viewBox');
    expect(out).toContain('설명입니다');
  });

  it('마크다운 표를 제거한다', () => {
    const out = stripUnspeakableBlocks('요약\n| 항목 | 값 |\n| --- | --- |\n| 체온 | 38.5 |');
    expect(out).not.toContain('체온 | 38.5');
    expect(out).toContain('요약');
  });
});

describe('ChunkAccumulator', () => {
  it('델타를 누적해 완성 문장만 흘려보낸다', () => {
    const acc = new ChunkAccumulator();
    expect(acc.push('423번 소의 ')).toHaveLength(0);
    expect(acc.push('체온이 높습니다. ')).toEqual(['423번 소의 체온이 높습니다.']);
  });

  it('flush로 남은 꼬리를 회수한다', () => {
    const acc = new ChunkAccumulator();
    acc.push('마지막 문장은 아직');
    expect(acc.flush()).toEqual(['마지막 문장은 아직']);
  });

  it('같은 텍스트를 두 번 내보내지 않는다', () => {
    const acc = new ChunkAccumulator();
    const first = acc.push('첫 문장입니다. ');
    const rest = acc.push('두 번째 문장입니다. ');
    const flushed = acc.flush();
    const all = [...first, ...rest, ...flushed].join(' ');
    // "첫 문장입니다" 가 정확히 한 번만 등장해야 한다
    expect(all.match(/첫 문장입니다/g)).toHaveLength(1);
  });

  it('reset 후에는 첫 청크 기준으로 되돌아간다', () => {
    const acc = new ChunkAccumulator();
    acc.push('첫 문장입니다. ');
    acc.reset();
    expect(acc.push('짧다. ')).toEqual(['짧다.']);
  });
});
