import { useState } from 'react';
import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import { App, Badge, Empty, Popover, Spin, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { NotificationItem } from '@mes/shared';
import { useMarkAllRead, useMarkRead, useNotifications, useUnreadCount } from '@/api/notification';
import { timeAgo } from '@/pages/feedback/shared';

/**
 * 顶栏通知铃铛（M12）。未读数 30s 轮询；下拉展示最近 20 条，
 * 点击即标已读并跳转对应业务（link 由通知发送方给出）。
 */
export function NotificationBell() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: unread } = useUnreadCount();
  const { data: page, isLoading } = useNotifications(1, open);
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const unreadCount = unread?.count ?? 0;
  const items = page?.items ?? [];

  const handleClick = (item: NotificationItem) => {
    if (!item.readAt) markRead.mutate([item.id]);
    setOpen(false);
    if (item.link) navigate(item.link);
  };

  const handleMarkAll = async () => {
    await markAllRead.mutateAsync();
    message.success('已全部标记为已读');
  };

  const content = (
    <div className="-m-1 w-[340px]">
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
        <span className="text-[13px] font-medium text-slate-700">
          通知
          {unreadCount > 0 && <span className="ml-1.5 text-xs font-normal text-slate-400">{unreadCount} 条未读</span>}
        </span>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void handleMarkAll()}
            className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-xs text-industrial-500 hover:text-industrial-600"
          >
            <CheckOutlined className="text-[11px]" />
            全部已读
          </button>
        )}
      </div>

      <div className="max-h-[380px] overflow-y-auto">
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Spin size="small" />
          </div>
        ) : items.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无通知" className="!my-6" />
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleClick(item)}
              className={`block w-full cursor-pointer border-0 border-b border-solid border-slate-50 bg-transparent px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-slate-50 ${
                item.readAt ? '' : 'bg-industrial-50/40'
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    item.readAt ? 'bg-transparent' : 'bg-industrial-500'
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[13px] leading-5 ${
                      item.readAt ? 'text-slate-500' : 'font-medium text-slate-700'
                    }`}
                  >
                    {item.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs leading-4 text-slate-400">
                    {item.content}
                  </span>
                  <span className="mt-1 block text-[11px] leading-3 text-slate-300">
                    {timeAgo(item.createdAt)}
                  </span>
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      arrow={false}
      open={open}
      onOpenChange={setOpen}
      styles={{ body: { padding: 4 } }}
    >
      <Tooltip title={open ? '' : '通知'} mouseEnterDelay={0.5}>
        <button
          type="button"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-base text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="通知"
        >
          <Badge count={unreadCount} size="small" offset={[2, -2]}>
            <BellOutlined />
          </Badge>
        </button>
      </Tooltip>
    </Popover>
  );
}
