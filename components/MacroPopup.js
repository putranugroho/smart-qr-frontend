// components/MacroPopup.jsx
export default function MacroPopup({ data, onSelect, onSkip }) {
  const macros = Array.isArray(data?.data) ? data.data : [];

  return (
    <div className="overlay">
      <div className="popup">
        <h3>Penawaran Spesial</h3>

        {macros.map((m, mi) =>
          (m.combosGet || []).map((combo, ci) => (
            <button
              key={`${mi}-${ci}`}
              onClick={() => onSelect(combo)}
              style={{ display: "block", marginBottom: 12 }}
            >
              {combo.name}
            </button>
          ))
        )}

        <button onClick={onSkip}>Lewati</button>
      </div>
    </div>
  );
}
