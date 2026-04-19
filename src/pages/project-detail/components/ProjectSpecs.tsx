interface ProjectSpecsProps {
  plotArea: string;
  builtArea: string;
  floors: string;
  year: string;
  status?: string;
}

export default function ProjectSpecs({
  plotArea,
  builtArea,
  floors,
  year,
  status = 'Completed',
}: ProjectSpecsProps) {
  const row1 = [
    { label: 'Plot Area / m²', value: plotArea },
    { label: 'Built Area / m²', value: builtArea },
    { label: 'Floors', value: floors },
    { label: 'Year', value: year },
  ];

  const row2 = [
    { label: 'Download', value: 'Press Kit' },
    { label: 'Status', value: status },
  ];

  const labelStyle: React.CSSProperties = {
    fontFamily: 'Geist, sans-serif',
    fontSize: '8px',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'rgba(0,0,0,0.38)',
    marginBottom: '12px',
  };

  const dividerStyle: React.CSSProperties = {
    width: '100%',
    height: '1px',
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginBottom: '14px',
  };

  const valueStyle: React.CSSProperties = {
    fontFamily: 'Geist, sans-serif',
    fontWeight: 600,
    fontSize: 'clamp(18px, 2vw, 28px)',
    color: 'rgba(0,0,0,0.85)',
    lineHeight: 1,
    letterSpacing: '-0.02em',
  };

  const cellPad: React.CSSProperties = {
    padding: '14px 0 16px',
    paddingRight: '20px',
  };

  return (
    <div className="w-full">
      {/* Row 1 — 2 cols on mobile, 4 on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4">
        {row1.map(({ label, value }) => (
          <div key={label} className="text-center md:text-left" style={cellPad}>
            <p style={labelStyle}>{label}</p>
            <div style={dividerStyle} />
            <p style={valueStyle}>{value}</p>
          </div>
        ))}
      </div>

      {/* Row 2 — 2 cols on mobile, 4 on desktop (each item spans half) */}
      <div className="grid grid-cols-2 md:grid-cols-4">
        {row2.map(({ label, value }) => (
          <div key={label} className="col-span-1 md:col-span-2 text-center md:text-left" style={cellPad}>
            <p style={labelStyle}>{label}</p>
            <div style={dividerStyle} />
            <p style={valueStyle}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
