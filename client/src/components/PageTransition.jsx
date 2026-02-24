export default function PageTransition({ children }) {
  return (
    <div className="animate-in fade-in duration-300">
      {children}
    </div>
  );
}
