export type ChatScrollSnapshot = {
  anchorId: string | null; offset: number; top: number; follow: boolean;
};
export function captureChatScroll(container: HTMLElement, history: boolean): ChatScrollSnapshot {
  const top = container.getBoundingClientRect().top;
  const anchor = Array.from(container.querySelectorAll<HTMLElement>('[data-message-id]'))
    .find(row => row.getBoundingClientRect().bottom > top);
  return { anchorId: anchor?.dataset.messageId || null, offset: anchor ? anchor.getBoundingClientRect().top - top : 0,
    top: container.scrollTop,
    follow: !history && container.scrollHeight - container.clientHeight - container.scrollTop <= 48 };
}
export function restoreChatScroll(container: HTMLElement, snapshot: ChatScrollSnapshot) {
  if (snapshot.follow) { container.scrollTop = container.scrollHeight - container.clientHeight; return; }
  const anchor = Array.from(container.querySelectorAll<HTMLElement>('[data-message-id]'))
    .find(row => row.dataset.messageId === snapshot.anchorId);
  if (anchor) container.scrollTop += anchor.getBoundingClientRect().top - container.getBoundingClientRect().top - snapshot.offset;
  else container.scrollTop = snapshot.top;
}
