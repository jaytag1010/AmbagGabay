"use client";
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { EmptyState, LoadingState, Notice } from "@/components/ui/Feedback";
import { useAuth } from "@/hooks/useAuth";
import { useCollectionData } from "@/hooks/useCollectionData";
import {
  cancelPaymentRequest,
  markNotificationRead,
  respondPaymentRequest,
  subscribeNotifications,
  subscribeSettlementRequest,
} from "@/services/notifications";
import {
  respondAccountLinkRequest,
  subscribeAccountLinkRequest,
} from "@/services/identityLinks";
import type {
  AccountLinkRequest,
  AppNotification,
  SettlementRequest,
} from "@/types";

function PaymentRequestActions({
  notification,
  uid,
}: {
  notification: AppNotification;
  uid: string;
}) {
  const [request, setRequest] = useState<SettlementRequest | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(
    () =>
      notification.settlementRequestId
        ? subscribeSettlementRequest(
            notification.settlementRequestId,
            setRequest,
            (e) => setError(e.message),
          )
        : undefined,
    [notification.settlementRequestId],
  );
  async function respond(approve: boolean) {
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      const reason = approve
        ? ""
        : window.prompt("Optional reason for disapproval") || "";
      await respondPaymentRequest(uid, request, approve, reason);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to respond.");
    } finally {
      setBusy(false);
    }
  }
  if (error) return <Notice message={error} />;
  if (!request) return null;
  if (request.status !== "pending")
    return (
      <span className={`request-status ${request.status}`}>
        {request.status}
      </span>
    );
  if (request.approverUid === uid)
    return (
      <div className="row-actions">
        <Button
          disabled={busy}
          variant="secondary"
          onClick={() => respond(false)}
        >
          Disapprove
        </Button>
        <Button disabled={busy} onClick={() => respond(true)}>
          Approve
        </Button>
      </div>
    );
  if (request.requesterUid === uid)
    return (
      <Button
        disabled={busy}
        variant="secondary"
        onClick={async () => {
          setBusy(true);
          try {
            await cancelPaymentRequest(uid, request);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to cancel.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Cancel request
      </Button>
    );
  return null;
}

function AccountLinkActions({
  notification,
  uid,
}: {
  notification: AppNotification;
  uid: string;
}) {
  const [request, setRequest] = useState<AccountLinkRequest | null>(null),
    [reviewing, setReviewing] = useState(false),
    [reason, setReason] = useState(""),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(
    () =>
      notification.accountLinkRequestId
        ? subscribeAccountLinkRequest(
            notification.accountLinkRequestId,
            setRequest,
            (e) => setError(e.message),
          )
        : undefined,
    [notification.accountLinkRequestId],
  );
  async function respond(accept: boolean) {
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      await respondAccountLinkRequest(uid, request, accept, reason);
      setReviewing(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to respond to link request.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (error) return <Notice message={error} />;
  if (!request) return null;
  if (request.status !== "pending")
    return (
      <span className={`request-status ${request.status}`}>
        {request.status}
      </span>
    );
  if (request.targetUid !== uid) return null;
  return (
    <>
      <Button variant="secondary" onClick={() => setReviewing(true)}>
        Review
      </Button>
      <Dialog
        open={reviewing}
        title="Review Account Link Request"
        onClose={() => setReviewing(false)}
      >
        <div className="link-review">
          <p>
            <strong>{request.requesterNameSnapshot}</strong> wants to associate
            your AmbagGabay account with their Friend record{" "}
            <strong>“{request.requesterFriendNameSnapshot}.”</strong>
          </p>
          <section>
            <h3>What accepting means</h3>
            <ul>
              <li>
                This Friend record will be associated with your AmbagGabay
                account.
              </li>
              <li>
                Your live AmbagGabay profile identity may be used where
                authorized.
              </li>
              <li>
                Existing unsettled expenses tied to this Friend can use
                linked-account settlement rules.
              </li>
              <li>
                Future “Paid” claims to you may require your confirmation.
              </li>
              <li>
                Authorized users may see your saved payment methods during
                settlement.
              </li>
              <li>Completed historical settlements will not be reopened.</li>
              <li>
                This does not automatically give you access to any Folder.
              </li>
            </ul>
          </section>
          <Field
            label="Reason for declining (optional)"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Notice message={error} />
          <div className="dialog-actions">
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => respond(false)}
            >
              Decline
            </Button>
            <span />
            <Button disabled={busy} onClick={() => respond(true)}>
              Accept Link
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function RequestActions({
  notification,
  uid,
}: {
  notification: AppNotification;
  uid: string;
}) {
  if (notification.accountLinkRequestId)
    return <AccountLinkActions notification={notification} uid={uid} />;
  if (notification.settlementRequestId)
    return <PaymentRequestActions notification={notification} uid={uid} />;
  return null;
}

export default function NotificationsPage() {
  const { currentUser } = useAuth(),
    uid = currentUser?.uid || "",
    [tab, setTab] = useState<"all" | "unread">("all");
  const subscription = useCallback(
    (next: (items: AppNotification[]) => void, fail: (error: Error) => void) =>
      subscribeNotifications(uid, next, fail),
    [uid],
  );
  const data = useCollectionData(uid ? subscription : null),
    items =
      tab === "unread" ? data.items.filter((item) => !item.read) : data.items;
  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Account-link requests, payment confirmations, and settlement updates."
      />
      <div className="tabs notification-tabs">
        <button
          className={tab === "all" ? "active" : ""}
          onClick={() => setTab("all")}
        >
          All
        </button>
        <button
          className={tab === "unread" ? "active" : ""}
          onClick={() => setTab("unread")}
        >
          Unread ({data.items.filter((i) => !i.read).length})
        </button>
      </div>
      {data.loading ? <LoadingState /> : <Notice message={data.error} />}{" "}
      {!data.loading && !items.length && (
        <EmptyState
          icon={<Bell />}
          title="No notifications"
          description="Account-link and payment requests will appear here."
        />
      )}
      <div className="notification-list">
        {items.map((item) => (
          <article
            key={item.id}
            className={`panel notification-card ${item.read ? "" : "unread"}`}
            onClick={() => !item.read && markNotificationRead(uid, item.id)}
          >
            <div>
              <h2>{item.title}</h2>
              <p>{item.message}</p>
              <small>
                {item.createdAt?.toDate?.().toLocaleString() || "Just now"}
              </small>
            </div>
            <RequestActions notification={item} uid={uid} />
          </article>
        ))}
      </div>
    </>
  );
}
