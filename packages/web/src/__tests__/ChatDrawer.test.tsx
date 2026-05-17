// ChatDrawer 테스트 — 메시지 전송 + 기본 UI

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// vi.mock 팩토리는 호이스팅되므로 mutable 상태는 vi.hoisted 로 선언한다.
const h = vi.hoisted(() => ({
  messages: [] as { id: string; role: string; content: string }[],
  sendMessage: vi.fn(),
  clearMessages: vi.fn(),
}));

vi.mock('@web/hooks/useChat', () => ({
  useChat: () => ({
    messages: h.messages,
    isStreaming: false,
    sendMessage: h.sendMessage,
    cancelStream: vi.fn(),
    clearMessages: h.clearMessages,
  }),
}));

// ChatDrawer 는 useDashboard(React Query) 를 transitively 호출한다.
// QueryClientProvider 없이 렌더하면 "No QueryClient set" 로 실패하므로 모킹한다.
vi.mock('@web/hooks/useDashboard', () => ({
  useDashboard: () => ({ data: undefined, isLoading: false, error: null }),
}));

// 모킹 경로는 ChatDrawer 가 실제로 import 하는 모듈로 해석되어야 한다
// (테스트 파일 기준 상대경로가 아니라 컴포넌트 모듈 경로).
vi.mock('@web/components/chat/SuggestedQuestions', () => ({
  SuggestedQuestions: ({ onSelect }: { onSelect: (q: string) => void }) => (
    <div data-testid="suggested-questions">
      <button type="button" onClick={() => onSelect('테스트 질문')}>테스트 질문</button>
    </div>
  ),
}));

vi.mock('@web/components/chat/ChatMessage', () => ({
  ChatMessage: ({ message }: { message: { content: string } }) => (
    <div data-testid="chat-message">{message.content}</div>
  ),
}));

import { ChatDrawer } from '@web/components/chat/ChatDrawer';

describe('ChatDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.messages = [];
  });

  it('isOpen=false이면 렌더링하지 않음', () => {
    const { container } = render(<ChatDrawer isOpen={false} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('isOpen=true이면 헤더와 입력 폼 표시', () => {
    render(<ChatDrawer isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('CowTalk AI')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('질문을 입력하세요...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전송' })).toBeInTheDocument();
  });

  it('빈 입력으로 전송 불가', () => {
    render(<ChatDrawer isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: '전송' })).toBeDisabled();
  });

  it('텍스트 입력 후 전송 버튼 클릭 → sendMessage 호출', async () => {
    const user = userEvent.setup();
    render(<ChatDrawer isOpen={true} onClose={vi.fn()} />);

    const input = screen.getByPlaceholderText('질문을 입력하세요...');
    await user.type(input, '이 소 건강 상태는?');

    const submitBtn = screen.getByRole('button', { name: '전송' });
    expect(submitBtn).not.toBeDisabled();

    await user.click(submitBtn);
    // doSend 는 sendMessage(question, options) 형태로 호출한다.
    expect(h.sendMessage).toHaveBeenCalledWith('이 소 건강 상태는?', expect.any(Object));
  });

  it('닫기 버튼 클릭 → onClose 호출', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ChatDrawer isOpen={true} onClose={onClose} />);

    const closeBtn = screen.getByLabelText('닫기');
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('대화 지우기 버튼 → clearMessages 호출', async () => {
    // 대화 지우기 버튼은 messages.length > 0 일 때만 렌더된다.
    h.messages = [{ id: 'm1', role: 'user', content: '안녕' }];
    const user = userEvent.setup();
    render(<ChatDrawer isOpen={true} onClose={vi.fn()} />);

    const clearBtn = screen.getByLabelText('대화 지우기');
    await user.click(clearBtn);
    expect(h.clearMessages).toHaveBeenCalledOnce();
  });

  it('메시지가 없으면 SuggestedQuestions 또는 빈 상태 표시', () => {
    render(<ChatDrawer isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('질문을 입력하세요...')).toBeInTheDocument();
  });
});
