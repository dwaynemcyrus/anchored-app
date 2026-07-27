type WelcomeScreenProps = {
  onCreateVault: () => void;
  onOpenVault: () => void;
};

/// What the window shows before a vault is chosen.
///
/// The four panes, the status bar, and every vault- and note-specific control
/// are absent here rather than disabled: with no vault there is nothing for
/// them to act on, and a wall of dead chrome is a poor first impression.
export function WelcomeScreen({
  onCreateVault,
  onOpenVault,
}: WelcomeScreenProps) {
  return (
    <main className="welcome">
      <h1>No vault open</h1>
      <p>
        Choose a folder of Markdown files to begin. Nothing is copied or moved.
      </p>
      <div className="welcome__actions">
        <button type="button" onClick={onOpenVault}>
          Open a vault
        </button>
        <button type="button" onClick={onCreateVault}>
          Create a vault
        </button>
      </div>
    </main>
  );
}
