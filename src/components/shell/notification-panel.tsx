"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { NOTIFICATION_TYPE_TONES, type NotificationType, type Tone } from "@/lib/constants";
import { relativeTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead, markNotificationRead } from "./notification-actions";
import type { ShellNotification } from "./types";

const TONE_DOT: Record<Tone, string> = {
  success: "bg-brand",
  warning: "bg-warning",
  danger: "bg-danger",
  primary: "bg-deep",
  muted: "bg-subtle",
};

function toneFor(type: string | null): Tone {
  return (type && NOTIFICATION_TYPE_TONES[type as NotificationType]) || "primary";
}

type NotificationPanelProps = {
  userId: string;
  notifications: ShellNotification[];
  unreadCount: number;
};

/** Topbar bell + popover listing recent notifications, kept live via Supabase Realtime. */
export function NotificationPanel({ userId, notifications, unreadCount }: NotificationPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(notifications);
  const [unread, setUnread] = useState(unreadCount);
  const [isPending, startTransition] = useTransition();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Server data wins whenever the layout re-renders (router.refresh / navigation).
  useEffect(() => setItems(notifications), [notifications]);
  useEffect(() => setUnread(unreadCount), [unreadCount]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          // Coalesce bursts (e.g. several notifications from one RPC) into one refresh.
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => router.refresh(), 400);
        },
      )
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [userId, router]);

  function openNotification(item: ShellNotification) {
    if (!item.read_at) {
      const readAt = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read_at: readAt } : n)));
      setUnread((count) => Math.max(0, count - 1));
      startTransition(async () => {
        const result = await markNotificationRead(item.id);
        if (!result.ok) toast.error(result.error);
      });
    }
    setOpen(false);
    if (item.link && item.link.startsWith("/") && !item.link.startsWith("//")) {
      router.push(item.link);
    }
  }

  function markAll() {
    const readAt = new Date().toISOString();
    const previous = { items, unread };
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: readAt })));
    setUnread(0);
    startTransition(async () => {
      const result = await markAllNotificationsRead();
      if (!result.ok) {
        setItems(previous.items);
        setUnread(previous.unread);
        toast.error(result.error);
      }
    });
  }

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        className="relative inline-flex size-11 items-center justify-center rounded-xl border border-border-soft bg-white text-text transition-colors hover:bg-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary data-[state=open]:bg-soft"
        aria-label={label}
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 ? (
          <span
            className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-brand ring-2 ring-white"
            aria-hidden="true"
          />
        ) : null}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={10}
          collisionPadding={12}
          className="z-50 flex max-h-[min(560px,calc(100dvh-96px))] w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-border-soft bg-white shadow-pop outline-none"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border-soft px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-text">Notifications</h2>
              <p className="text-xs text-muted" aria-live="polite">
                {unread > 0 ? `${unread} unread` : "You're all caught up"}
              </p>
            </div>
            <button
              type="button"
              onClick={markAll}
              disabled={unread === 0 || isPending}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-deep transition-colors hover:bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-40"
            >
              <CheckCheck className="size-4" aria-hidden="true" />
              Mark all read
            </button>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-soft text-deep">
                <BellOff className="size-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium text-text">No notifications yet</p>
              <p className="text-xs text-muted">
                Deadline reminders and request updates will appear here.
              </p>
            </div>
          ) : (
            <ul className="flex-1 divide-y divide-border-soft overflow-y-auto">
              {items.map((item) => {
                const isUnread = !item.read_at;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(item)}
                      className={cn(
                        "flex w-full gap-3 px-5 py-3.5 text-left transition-colors hover:bg-soft/40 focus-visible:bg-soft/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                        isUnread && "bg-soft/50",
                      )}
                    >
                      <span
                        className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE_DOT[toneFor(item.type)], !isUnread && "opacity-30")}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block text-sm text-text",
                            isUnread ? "font-semibold" : "font-medium",
                          )}
                        >
                          {item.title}
                          {isUnread ? <span className="sr-only"> (unread)</span> : null}
                        </span>
                        {item.message ? (
                          <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted">
                            {item.message}
                          </span>
                        ) : null}
                        <time dateTime={item.created_at} className="mt-1 block text-xs text-muted">
                          {relativeTime(item.created_at)}
                        </time>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
