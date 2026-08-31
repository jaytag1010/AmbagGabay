"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Image from "next/image";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, SelectField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Feedback";
import { useCollectionData } from "@/hooks/useCollectionData";
import {
  deletePaymentMethod,
  providerLabel,
  savePaymentMethod,
  subscribePaymentMethods,
} from "@/services/paymentMethods";
import { validateImage } from "@/services/profilePictures";
import type { Friend, PaymentMethod, PaymentProvider } from "@/types";
import { formatMoney } from "@/utils/money";

function PaymentRows({
  methods,
  onEdit,
  onDelete,
  onShow,
  onMessage,
}: {
  methods: PaymentMethod[];
  onEdit?: (m: PaymentMethod) => void;
  onDelete?: (m: PaymentMethod) => void;
  onShow: (m: PaymentMethod) => void;
  onMessage?: (m: string) => void;
}) {
  return (
    <div className="payment-method-list">
      {methods.map((method) => (
        <div className="payment-method-row" key={method.id}>
          <div>
            <strong>
              {providerLabel(method.provider, method.customProviderName)}
            </strong>
            <span>
              {method.accountName || "Account name not set"}
              {method.accountNumber ? ` · ${method.accountNumber}` : ""}
            </span>
          </div>
          <div className="row-actions">
            {method.accountNumber && (
              <button
                className="icon-button"
                aria-label="Copy account number"
                onClick={async () => {
                  await navigator.clipboard.writeText(method.accountNumber!);
                  onMessage?.("Account number copied.");
                }}
              >
                <Copy size={16} />
              </button>
            )}
            {method.qrCodeUrl && (
              <Button variant="ghost" onClick={() => onShow(method)}>
                Show QR Code
              </Button>
            )}
            {onEdit && (
              <button
                className="icon-button"
                aria-label="Edit payment method"
                onClick={() => onEdit(method)}
              >
                <Pencil size={16} />
              </button>
            )}
            {onDelete && (
              <button
                className="icon-button"
                aria-label="Delete payment method"
                onClick={() => onDelete(method)}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
function QRDialog({
  method,
  onClose,
  payee,
  amount,
}: {
  method: PaymentMethod | null;
  onClose: () => void;
  payee?: string;
  amount?: number;
}) {
  return (
    <Dialog
      open={!!method}
      title={
        payee
          ? `Pay ${payee}`
          : method
            ? providerLabel(method.provider, method.customProviderName)
            : "QR Code"
      }
      onClose={onClose}
    >
      {method && (
        <div className="qr-view">
          {amount !== undefined && (
            <div className="payment-amount">
              <span>Amount to Pay</span>
              <strong className="money-outgoing">{formatMoney(amount)}</strong>
            </div>
          )}
          <h3>{providerLabel(method.provider, method.customProviderName)}</h3>
          <p>
            {method.accountName || "Account name not set"}
            {method.accountNumber && (
              <>
                <br />
                {method.accountNumber}
              </>
            )}
          </p>
          {method.qrCodeUrl && (
            <Image
              src={method.qrCodeUrl}
              width={520}
              height={520}
              unoptimized
              alt={`${providerLabel(method.provider, method.customProviderName)} QR code for ${method.accountName || "account"}`}
            />
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </Dialog>
  );
}

export function PaymentMethodsPanel({
  currentUid,
  friend,
}: {
  currentUid: string;
  friend: Friend;
}) {
  const linked = !!friend.linkedUserId && !friend.isMe,
    ownerUid = linked ? friend.linkedUserId! : currentUid,
    localFriendId = friend.isMe || linked ? null : friend.id,
    manageable = !linked;
  const subscription = useCallback(
    (next: (items: PaymentMethod[]) => void, fail: (error: Error) => void) =>
      subscribePaymentMethods(ownerUid, localFriendId, next, fail),
    [ownerUid, localFriendId],
  );
  const data = useCollectionData(subscription),
    [editing, setEditing] = useState<PaymentMethod | "new" | null>(null),
    [showing, setShowing] = useState<PaymentMethod | null>(null),
    [provider, setProvider] = useState<PaymentProvider>("gcash"),
    [qrFile, setQrFile] = useState<File | null>(null),
    [removeQr, setRemoveQr] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<string | null>(null);
  const qrPreview = useMemo(
    () => (qrFile ? URL.createObjectURL(qrFile) : null),
    [qrFile],
  );
  useEffect(
    () => () => {
      if (qrPreview) URL.revokeObjectURL(qrPreview);
    },
    [qrPreview],
  );
  useEffect(() => {
    setProvider(editing && editing !== "new" ? editing.provider : "gcash");
    setQrFile(null);
    setRemoveQr(false);
  }, [editing]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget),
      old = editing && editing !== "new" ? editing : null;
    try {
      await savePaymentMethod(currentUid, {
        id: old?.id,
        localFriendId,
        provider,
        customProviderName: String(form.get("customProviderName") || ""),
        accountName: String(form.get("accountName") || ""),
        accountNumber: String(form.get("accountNumber") || ""),
        qrFile,
        existingQrUrl: old?.qrCodeUrl,
        existingQrPath: old?.qrCodeStoragePath,
        existingQrImageId: old?.qrImageId,
        removeQr,
      });
      setEditing(null);
      setMessage("Payment method saved.");
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Unable to save payment method.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(method: PaymentMethod) {
    if (
      !confirm(
        `Delete ${providerLabel(method.provider, method.customProviderName)} payment method?`,
      )
    )
      return;
    try {
      await deletePaymentMethod(currentUid, method, localFriendId);
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Unable to delete payment method.",
      );
    }
  }
  function chooseQr(file: File | null) {
    if (!file) return;
    try {
      validateImage(file);
      setQrFile(file);
      setRemoveQr(false);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Invalid QR image.");
    }
  }
  return (
    <section className="panel payment-methods-panel">
      <div className="section-heading">
        <div>
          <h2>Payment Methods</h2>
          {linked && (
            <p>Managed by {friend.name} through their linked account.</p>
          )}
        </div>
        {manageable && (
          <Button variant="secondary" onClick={() => setEditing("new")}>
            Add Payment Method
          </Button>
        )}
      </div>
      <Notice
        message={data.error || message}
        tone={
          message?.includes("saved") || message?.includes("copied")
            ? "success"
            : "error"
        }
      />
      {!data.loading && !data.items.length ? (
        <p className="muted-copy">No payment methods yet.</p>
      ) : (
        <PaymentRows
          methods={data.items}
          onShow={setShowing}
          onMessage={setMessage}
          onEdit={manageable ? setEditing : undefined}
          onDelete={manageable ? remove : undefined}
        />
      )}
      <Dialog
        open={!!editing}
        title={editing === "new" ? "Add Payment Method" : "Edit Payment Method"}
        onClose={() => setEditing(null)}
      >
        <form className="dialog-form" onSubmit={save}>
          <SelectField
            label="Bank / Wallet"
            name="provider"
            value={provider}
            onChange={(event) =>
              setProvider(event.target.value as PaymentProvider)
            }
          >
            <option value="gcash">GCash</option>
            <option value="maya">Maya</option>
            <option value="maribank">MariBank</option>
            <option value="landbank">Landbank</option>
            <option value="other">Others</option>
          </SelectField>
          {provider === "other" && (
            <Field
              label="Bank / Wallet Name"
              name="customProviderName"
              required
              defaultValue={
                editing && editing !== "new"
                  ? editing.customProviderName || ""
                  : ""
              }
            />
          )}
          <Field
            label="Account Name"
            name="accountName"
            required
            defaultValue={
              editing && editing !== "new" ? editing.accountName : ""
            }
          />
          <Field
            label="Account Number (optional)"
            name="accountNumber"
            defaultValue={
              editing && editing !== "new" ? editing.accountNumber || "" : ""
            }
          />
          <label className="field">
            <span>QR Code (optional)</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => chooseQr(event.target.files?.[0] || null)}
            />
          </label>
          {qrFile && qrPreview && (
            <div className="qr-upload-preview">
              <Image
                src={qrPreview}
                width={180}
                height={180}
                unoptimized
                alt="Selected QR code preview"
              />
              <p className="muted-copy">Selected: {qrFile.name}</p>
            </div>
          )}
          {editing &&
            editing !== "new" &&
            editing.qrCodeUrl &&
            !removeQr &&
            !qrFile && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRemoveQr(true)}
              >
                Remove current QR
              </Button>
            )}
          <div className="dialog-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <span />
            <Button disabled={busy}>
              {busy ? (qrFile ? "Uploading and saving…" : "Saving…") : "Save"}
            </Button>
          </div>
        </form>
      </Dialog>
      <QRDialog method={showing} onClose={() => setShowing(null)} />
    </section>
  );
}

export function PayeePaymentMethods({
  currentUid,
  friend,
  amount,
}: {
  currentUid: string;
  friend: Friend;
  amount: number;
}) {
  const ownerUid = friend.linkedUserId || currentUid,
    localFriendId = friend.linkedUserId ? null : friend.id,
    subscription = useCallback(
      (next: (items: PaymentMethod[]) => void, fail: (error: Error) => void) =>
        subscribePaymentMethods(ownerUid, localFriendId, next, fail),
      [ownerUid, localFriendId],
    ),
    data = useCollectionData(subscription),
    [open, setOpen] = useState(false),
    [qr, setQr] = useState<PaymentMethod | null>(null);
  if (!data.items.length)
    return <small className="muted-copy">No Payment Method</small>;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Show Payment Method
      </Button>
      <Dialog
        open={open}
        title={`Pay ${friend.name}`}
        onClose={() => setOpen(false)}
      >
        <div className="payment-view">
          <div className="payment-amount">
            <span>Amount to Pay</span>
            <strong className="money-outgoing">{formatMoney(amount)}</strong>
          </div>
          <PaymentRows methods={data.items} onShow={setQr} />
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Back to Settlements
          </Button>
        </div>
      </Dialog>
      <QRDialog
        method={qr}
        onClose={() => setQr(null)}
        payee={friend.name}
        amount={amount}
      />
    </>
  );
}
