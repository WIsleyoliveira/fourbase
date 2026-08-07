// Campo de cor personalizada — o próprio input nativo type="color" é o
// swatch clicável: o navegador abre o seletor com o espectro completo,
// sliders e código hex. `value` null/undefined = cor automática (hash).
export default function ColorPickerField({ label = 'Cor', value, onChange }) {
  return (
    <div className="color-picker-field">
      <span className="color-picker-label">{label}</span>
      <div className="color-picker-row">
        <input
          type="color"
          className="color-picker-swatch"
          value={value || '#14b8c4'}
          onChange={(e) => onChange(e.target.value)}
          title="Escolher cor"
        />
        <span className="color-picker-value">{value ? value.toUpperCase() : 'Cor automática'}</span>
        {value && (
          <button type="button" className="color-picker-reset" onClick={() => onChange(null)}>
            Usar automática
          </button>
        )}
      </div>
    </div>
  )
}
