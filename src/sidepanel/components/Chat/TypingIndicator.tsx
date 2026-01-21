export function TypingIndicator() {
  return (
    <div className="flex gap-1 p-3 bg-gray-100 rounded-xl w-fit">
      <div className="w-2 h-2 rounded-full bg-gray-400 animate-typing" style={{ animationDelay: '0s' }} />
      <div className="w-2 h-2 rounded-full bg-gray-400 animate-typing" style={{ animationDelay: '0.2s' }} />
      <div className="w-2 h-2 rounded-full bg-gray-400 animate-typing" style={{ animationDelay: '0.4s' }} />
    </div>
  );
}
