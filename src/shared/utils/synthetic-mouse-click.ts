/**
 * 部分页面只依赖 mousedown / mouseup / click 链或坐标，不响应 HTMLElement.click()。
 * 此处为脚本派发的合成事件，event.isTrusted 始终为 false；无法替代真实用户输入。
 */
export function dispatchSyntheticMouseClick(target: Element): void {
  const view = target.ownerDocument?.defaultView ?? window;
  const rect = target.getBoundingClientRect();
  const clientX = rect.left + Math.max(rect.width, 0) / 2;
  const clientY = rect.top + Math.max(rect.height, 0) / 2;
  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view,
    clientX,
    clientY,
    button: 0,
  };
  target.dispatchEvent(new MouseEvent('mousedown', { ...init, buttons: 1 }));
  target.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
  target.dispatchEvent(new MouseEvent('click', { ...init, buttons: 0 }));
}
