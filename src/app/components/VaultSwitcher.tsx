import { useRef } from "react";

import type { RememberedVault } from "../../lib/tauri/vault";
import { useModalDialog } from "./useModalDialog";

type VaultSwitcherProps = {
  currentVaultId: string;
  error?: string;
  loading: boolean;
  openingVaultId?: string;
  vaults: RememberedVault[];
  onClose: () => void;
  onCreateVault: () => void;
  onForget: (vaultId: string) => void;
  onOpenAnother: () => void;
  onOpenRemembered: (vaultId: string) => void;
};

function formatLastOpened(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export function VaultSwitcher({
  currentVaultId,
  error,
  loading,
  openingVaultId,
  vaults,
  onClose,
  onCreateVault,
  onForget,
  onOpenAnother,
  onOpenRemembered,
}: VaultSwitcherProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { dialogRef, onDialogKeyDown } = useModalDialog<HTMLElement>({
    initialFocusRef: closeButtonRef,
    onClose,
  });

  return (
    <aside
      ref={dialogRef}
      aria-label="Switch vault"
      aria-modal="true"
      className="continuity-panel"
      role="dialog"
      tabIndex={-1}
      onKeyDown={onDialogKeyDown}
    >
      <header className="continuity-panel__header">
        <div>
          <h2>Vaults</h2>
          <p>Open a remembered vault or choose another folder.</p>
        </div>
        <button
          ref={closeButtonRef}
          aria-label="Close vault switcher"
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <div className="continuity-panel__body">
        {loading ? (
          <p className="continuity-panel__empty">Loading vaults…</p>
        ) : null}
        {error ? (
          <p className="continuity-panel__error" role="alert">
            {error}
          </p>
        ) : null}
        {!loading && vaults.length === 0 ? (
          <p className="continuity-panel__empty">No remembered vaults yet.</p>
        ) : null}
        {vaults.length > 0 ? (
          <ol className="continuity-list">
            {vaults.map((vault) => {
              const isCurrent = vault.id === currentVaultId;
              const isOpening = vault.id === openingVaultId;
              return (
                <li className="continuity-record" key={vault.id}>
                  <div className="continuity-record__copy">
                    <strong>{vault.name}</strong>
                    <span>
                      {isCurrent
                        ? "Open now"
                        : vault.available
                          ? `Last opened ${formatLastOpened(vault.lastOpenedAt)}`
                          : "Folder unavailable"}
                    </span>
                  </div>
                  <div className="continuity-record__actions">
                    <button
                      disabled={
                        isCurrent ||
                        !vault.available ||
                        openingVaultId !== undefined
                      }
                      type="button"
                      onClick={() => onOpenRemembered(vault.id)}
                    >
                      {isOpening ? "Opening…" : isCurrent ? "Current" : "Open"}
                    </button>
                    <button
                      disabled={openingVaultId !== undefined}
                      type="button"
                      onClick={() => onForget(vault.id)}
                    >
                      Forget
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
      <footer className="continuity-panel__footer">
        <button
          disabled={openingVaultId !== undefined}
          type="button"
          onClick={onCreateVault}
        >
          Create new vault…
        </button>
        <button
          disabled={openingVaultId !== undefined}
          type="button"
          onClick={onOpenAnother}
        >
          Open another vault…
        </button>
      </footer>
    </aside>
  );
}
