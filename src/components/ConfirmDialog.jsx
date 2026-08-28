export default function ConfirmDialog({ data, onCancel }) {
  return (
    <div className="modale-velo" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modale" role="dialog" aria-modal="true">
        <h2 className="modale-titolo">{data.title}</h2>
        <p className="modale-testo">{data.body}</p>
        <div className="modale-azioni">
          <button className="btn btn-secondario" onClick={onCancel}>Annulla</button>
          {/* niente rosso nemmeno qui: quello che si perde è spento, non urlato */}
          <button className={`btn ${data.danger ? 'btn-spento' : 'btn-primario'}`} onClick={data.onConfirm}>
            {data.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
