export function FormulaDisplay({ formula }: { formula: string }) {
  // Pretty-print CEL expression with very light syntax highlighting.
  const tokens = formula.split(/(\s+|[()*/+\-,])/);
  return (
    <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed">
      <code>
        {tokens.map((t, i) => {
          if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(t)) {
            const isFunc = /^(sum|avg|min|max|abs|round)$/i.test(t);
            return <span key={i} className={isFunc ? "text-violet-700" : "text-emerald-700"}>{t}</span>;
          }
          if (/^[0-9.]+$/.test(t)) return <span key={i} className="text-sky-700">{t}</span>;
          if (/^[+\-*/(),]$/.test(t)) return <span key={i} className="text-slate-400">{t}</span>;
          return <span key={i}>{t}</span>;
        })}
      </code>
    </pre>
  );
}
