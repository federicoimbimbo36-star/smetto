export default function ConfirmDialog({ data, onCancel }) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal modal-small">
        <div className="modal-title">{data.title}</div>
        <p className="modal-hint">{data.body}</p>
        <div className="modal-row-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Annulla</button>
          <button className={`btn ${data.danger ? 'btn-danger' : 'btn-primary'}`} onClick={data.onConfirm}>
            {data.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
