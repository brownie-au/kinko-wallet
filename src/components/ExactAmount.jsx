import PropTypes from 'prop-types';
export default function ExactAmount({ value, children }) {
  if (value == null) return <span>{children}</span>;
  return (
    <details className="kw-exact">
      <summary aria-label={`Show full amount: ${value}`}>{children}</summary>
      <span className="kw-exact-value">{String(value)}</span>
    </details>
  );
}
ExactAmount.propTypes = { value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]), children: PropTypes.node };
